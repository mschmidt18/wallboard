import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import type Database from 'better-sqlite3'
import type { Config } from '../config.js'
import { DEFAULT_TTLS } from '@shared/constants.js'
import { isCacheFresh, upsertCache, invalidateAllCache } from '../db/queries/cache.js'
import { listIcsCalendars } from '../db/queries/ics-calendars.js'
import { loadOrCreateKey } from './encryption.js'
import { getValidAccessToken } from './google-auth.js'
import { fetchWeather } from './weather.js'
import { fetchEvents } from './google-calendar.js'
import { getSessionMediaItems } from './google-photos.js'
import { fetchIcsEvents } from './ical-service.js'
import { fetchApplePhotos, extractAlbumToken } from './apple-photos.js'

interface DataSource {
  type: 'weather' | 'calendar' | 'photos' | 'ics_calendar' | 'apple_photos'
  key: string
  params: Record<string, unknown>
  interval: number // seconds
}

interface WidgetRow {
  id: number
  layout_id: number
  widget_type: string
  config: string
}

interface IcsCalendarRow {
  id: number
  name: string
  url: string
  color: string
}

interface CalendarSource {
  type: 'google' | 'ics'
  id: string | number
}

function loadSettings(config: { dbPath: string }): Record<string, unknown> {
  const path = join(dirname(config.dbPath), 'settings.json')
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'))
    } catch {
      return {}
    }
  }
  return {}
}

function getRefreshInterval(config: { dbPath: string }, defaultInterval: number): number {
  const settings = loadSettings(config)
  return (settings.display_refresh_interval as number) ?? defaultInterval
}

/**
 * Scan all widgets in the active layout, deduplicate data sources by cache key.
 */
export function collectDataSources(db: Database.Database): DataSource[] {
  const sources = new Map<string, DataSource>()

  // Get all widgets (from any layout, matching Python behavior which queries all widgets)
  const widgets = db.prepare('SELECT * FROM widgets').all() as WidgetRow[]

  for (const widget of widgets) {
    const config = JSON.parse(widget.config) as Record<string, unknown>

    if (widget.widget_type === 'weather') {
      const lat = config.lat
      const lon = config.lon
      if (lat != null && lon != null) {
        const key = `weather_${lat}_${lon}`
        if (!sources.has(key)) {
          sources.set(key, {
            type: 'weather',
            key,
            params: { lat, lon, units: (config.units as string) ?? 'metric' },
            interval: DEFAULT_TTLS.weather,
          })
        }
      }
    } else if (widget.widget_type === 'calendar') {
      const calendarSourcesList = config.calendar_sources as CalendarSource[] | undefined
      const daysAhead = (config.days_ahead as number) ?? 7

      if (calendarSourcesList) {
        // New format: calendar_sources with type/id entries
        const googleIds: string[] = []
        for (const cs of calendarSourcesList) {
          if (cs.type === 'google') {
            googleIds.push(String(cs.id))
          } else if (cs.type === 'ics') {
            const icsCal = db.prepare('SELECT * FROM ics_calendars WHERE id = ?').get(cs.id) as IcsCalendarRow | undefined
            if (icsCal) {
              const icsKey = `ics_calendar_${icsCal.id}`
              if (!sources.has(icsKey)) {
                sources.set(icsKey, {
                  type: 'ics_calendar',
                  key: icsKey,
                  params: {
                    url: icsCal.url,
                    days_ahead: daysAhead,
                    calendar_name: icsCal.name,
                    color: icsCal.color,
                  },
                  interval: DEFAULT_TTLS.ics_calendar,
                })
              }
            }
          }
        }
        if (googleIds.length > 0) {
          const sortedIds = [...googleIds].sort()
          const key = `google_calendar_${sortedIds.join('_')}_${daysAhead}`
          if (!sources.has(key)) {
            sources.set(key, {
              type: 'calendar',
              key,
              params: { calendar_ids: sortedIds, days_ahead: daysAhead },
              interval: DEFAULT_TTLS.calendar,
            })
          }
        }
      } else {
        // Backward compat: old calendar_ids format
        const calendarIds = [...((config.calendar_ids as string[]) ?? ['primary'])].sort()
        const key = `google_calendar_${calendarIds.join('_')}_${daysAhead}`
        if (!sources.has(key)) {
          sources.set(key, {
            type: 'calendar',
            key,
            params: { calendar_ids: calendarIds, days_ahead: daysAhead },
            interval: DEFAULT_TTLS.calendar,
          })
        }
        // Auto-include all ICS calendars when no explicit calendar_sources
        const allIcs = listIcsCalendars(db)
        for (const icsCal of allIcs) {
          const icsKey = `ics_calendar_${icsCal.id}`
          if (!sources.has(icsKey)) {
            sources.set(icsKey, {
              type: 'ics_calendar',
              key: icsKey,
              params: {
                url: icsCal.url,
                days_ahead: daysAhead,
                calendar_name: icsCal.name,
                color: icsCal.color,
              },
              interval: DEFAULT_TTLS.ics_calendar,
            })
          }
        }
      }
    } else if (widget.widget_type === 'photos') {
      const photosSource = config.photos_source as string | undefined
      const pickerSessionId = config.picker_session_id
      const icloudAlbumUrl = config.icloud_album_url as string | undefined

      if (photosSource === 'apple' && icloudAlbumUrl) {
        // Apple iCloud Photos
        const token = extractAlbumToken(icloudAlbumUrl)
        if (token) {
          const key = `apple_photos_${token}`
          if (!sources.has(key)) {
            sources.set(key, {
              type: 'apple_photos',
              key,
              params: { icloud_album_url: icloudAlbumUrl },
              interval: DEFAULT_TTLS.apple_photos,
            })
          }
        }
      } else if (pickerSessionId) {
        // Google Photos (explicit source='google' or legacy without photos_source)
        const key = `google_photos_picker_${pickerSessionId}`
        if (!sources.has(key)) {
          sources.set(key, {
            type: 'photos',
            key,
            params: { picker_session_id: pickerSessionId },
            interval: DEFAULT_TTLS.photos,
          })
        }
      }
    }
  }

  return [...sources.values()]
}

async function getGoogleAccessToken(
  db: Database.Database,
  config: Config,
): Promise<string | null> {
  try {
    const key = loadOrCreateKey(config.secretKeyPath)
    const settings = loadSettings(config)
    const clientId = (settings.google_client_id as string) ?? ''
    const clientSecret = (settings.google_client_secret as string) ?? ''
    return await getValidAccessToken(db, key, clientId, clientSecret)
  } catch {
    return null
  }
}

/**
 * Fetch data for a single source. Returns the data object or null on failure.
 */
export async function fetchSource(
  source: DataSource,
  db: Database.Database,
  config: Config,
): Promise<Record<string, unknown> | null> {
  const { type, params } = source

  if (type === 'weather') {
    const data = await fetchWeather(
      params.lat as number,
      params.lon as number,
      params.units as string | undefined,
    )
    return data as unknown as Record<string, unknown>
  } else if (type === 'calendar') {
    const accessToken = await getGoogleAccessToken(db, config)
    if (!accessToken) return null
    const calendarIds = (params.calendar_ids as string[]) ?? ['primary']
    const daysAhead = (params.days_ahead as number) ?? 7
    const events = await fetchEvents(accessToken, calendarIds, daysAhead)
    return { events }
  } else if (type === 'photos') {
    const accessToken = await getGoogleAccessToken(db, config)
    if (!accessToken) return null
    const sessionId = params.picker_session_id as string
    if (!sessionId) return null
    try {
      const items = await getSessionMediaItems(accessToken, sessionId)
      const photos = items.map((item) => ({
        id: item.id,
        url: `/api/photos/proxy?url=${encodeURIComponent(item.baseUrl)}`,
        mimeType: item.mimeType,
      }))
      return { photos }
    } catch (err) {
      const errorStr = String(err)
      if (errorStr.includes('404') || errorStr.includes('403')) {
        return { photos: [], session_expired: true }
      }
      throw err
    }
  } else if (type === 'ics_calendar') {
    const events = await fetchIcsEvents(
      params.url as string,
      params.days_ahead as number,
      params.calendar_name as string,
      params.color as string,
    )
    return { events }
  } else if (type === 'apple_photos') {
    const albumUrl = params.icloud_album_url as string
    const photos = await fetchApplePhotos(albumUrl)
    return { photos }
  }

  return null
}

/**
 * One refresh cycle: collect sources, check freshness, fetch stale, update cache.
 */
export async function refreshOnce(
  db: Database.Database,
  config: Config,
  logger?: { info: (msg: string) => void; error: (msg: string) => void; debug: (msg: string) => void },
): Promise<void> {
  const sources = collectDataSources(db)

  for (const source of sources) {
    if (isCacheFresh(db, source.key)) {
      logger?.debug(`Cache fresh for ${source.key}, skipping`)
      continue
    }

    try {
      const data = await fetchSource(source, db, config)
      if (data != null) {
        const now = new Date()
        const expiresAt = new Date(now.getTime() + source.interval * 1000)
        upsertCache(db, source.key, data, expiresAt.toISOString())
        logger?.info(`Refreshed ${source.key}`)
      }
    } catch (err) {
      logger?.error(`Failed to refresh ${source.key}: ${err}`)
    }
  }
}

/**
 * Force refresh all data sources, bypassing cache freshness checks.
 * Returns the number of sources refreshed.
 */
export async function forceRefreshAll(
  db: Database.Database,
  config: Config,
  logger?: { info: (msg: string) => void; error: (msg: string) => void; debug: (msg: string) => void },
): Promise<{ refreshed: number; failed: number }> {
  // Invalidate all cache entries
  invalidateAllCache(db)
  logger?.info('Cache invalidated, starting force refresh')

  const sources = collectDataSources(db)
  let refreshed = 0
  let failed = 0

  for (const source of sources) {
    try {
      const data = await fetchSource(source, db, config)
      if (data != null) {
        const now = new Date()
        const expiresAt = new Date(now.getTime() + source.interval * 1000)
        upsertCache(db, source.key, data, expiresAt.toISOString())
        logger?.info(`Force refreshed ${source.key}`)
        refreshed++
      }
    } catch (err) {
      logger?.error(`Failed to force refresh ${source.key}: ${err}`)
      failed++
    }
  }

  return { refreshed, failed }
}

export interface RefreshHandle {
  stop(): void
}

/**
 * Start the background refresh loop using setTimeout (not setInterval) to prevent overlap.
 * Re-reads interval from settings.json each tick.
 */
export function startRefreshLoop(
  db: Database.Database,
  config: Config,
  logger?: { info: (msg: string) => void; error: (msg: string) => void; debug: (msg: string) => void },
  defaultInterval = 60,
): RefreshHandle {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const tick = async () => {
    if (stopped) return
    try {
      await refreshOnce(db, config, logger)
    } catch (err) {
      logger?.error(`Refresh loop error: ${err}`)
    }
    if (stopped) return
    const interval = getRefreshInterval(config, defaultInterval)
    timeoutId = setTimeout(tick, interval * 1000)
  }

  // Start the first tick immediately
  timeoutId = setTimeout(tick, 0)

  return {
    stop() {
      stopped = true
      if (timeoutId != null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    },
  }
}
