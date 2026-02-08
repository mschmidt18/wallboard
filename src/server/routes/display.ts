import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import type { FastifyInstance } from 'fastify'
import { getCacheMultiple } from '../db/queries/cache.js'
import { listIcsCalendars } from '../db/queries/ics-calendars.js'
import { listEnabledScheduleRules } from '../db/queries/schedule-rules.js'
import { evaluateSchedule } from '../services/schedule.js'
import { loadOrCreateKey } from '../services/encryption.js'
import { getValidAccessToken } from '../services/google-auth.js'
import { extractAlbumToken } from '../services/apple-photos.js'
import type { DisplayResponse, DisplayWidgetResponse } from '@shared/types.js'

interface WidgetRow {
  id: number
  layout_id: number
  widget_type: string
  config: string
  position_x: number
  position_y: number
  width: number
  height: number
  created_at: string
  updated_at: string
}

interface LayoutRow {
  id: number
  name: string
  columns: number
  row_height: number
  is_active: number
  theme: string
  created_at: string
  updated_at: string
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

function getRefreshInterval(config: { dbPath: string }): number {
  const settings = loadSettings(config)
  return (settings.display_refresh_interval as number) ?? 60
}

/**
 * Determine cache key based on widget type and config.
 * For calendar widgets with calendar_sources, returns null (handled by getCalendarCacheKeys).
 */
export function getCacheKey(widget: { widget_type: string; config: Record<string, unknown> }): string | null {
  const { widget_type, config } = widget
  if (widget_type === 'weather') {
    const lat = config.lat
    const lon = config.lon
    if (lat != null && lon != null) {
      return `weather_${lat}_${lon}`
    }
  } else if (widget_type === 'calendar') {
    if (config.calendar_sources) {
      return null // Multi-source handled separately
    }
    const calendarIds = (config.calendar_ids as string[] | undefined) ?? ['primary']
    const sortedIds = [...calendarIds].sort()
    const daysAhead = (config.days_ahead as number) ?? 7
    return `google_calendar_${sortedIds.join('_')}_${daysAhead}`
  } else if (widget_type === 'photos') {
    const photosSource = config.photos_source as string | undefined
    const pickerSessionId = config.picker_session_id
    const icloudAlbumUrl = config.icloud_album_url as string | undefined

    if (photosSource === 'apple' && icloudAlbumUrl) {
      const token = extractAlbumToken(icloudAlbumUrl)
      if (token) {
        return `apple_photos_${token}`
      }
    } else if (pickerSessionId) {
      // Google Photos (explicit source='google' or legacy without photos_source)
      return `google_photos_picker_${pickerSessionId}`
    }
  }
  return null
}

/**
 * For calendar widgets with calendar_sources, return list of [sourceLabel, cacheKey] tuples.
 */
export function getCalendarCacheKeys(config: Record<string, unknown>): [string, string][] {
  const calendarSources = config.calendar_sources as CalendarSource[] | undefined
  if (!calendarSources) return []

  const daysAhead = (config.days_ahead as number) ?? 7
  const keys: [string, string][] = []
  const googleIds: string[] = []

  for (const cs of calendarSources) {
    if (cs.type === 'google') {
      googleIds.push(String(cs.id))
    } else if (cs.type === 'ics') {
      keys.push([`ics:${cs.id}`, `ics_calendar_${cs.id}`])
    }
  }

  if (googleIds.length > 0) {
    const sortedIds = [...googleIds].sort()
    const cacheKey = `google_calendar_${sortedIds.join('_')}_${daysAhead}`
    for (const gid of sortedIds) {
      keys.push([`google:${gid}`, cacheKey])
    }
  }

  return keys
}

/**
 * Merge events from multiple calendar sources, apply colors, sort by start.
 */
export function mergeCalendarData(
  config: Record<string, unknown>,
  cacheEntries: Map<string, unknown>,
): Record<string, unknown> | null {
  const calendarSources = config.calendar_sources as CalendarSource[] | undefined
  if (!calendarSources || calendarSources.length === 0) return null

  const colors = (config.colors as Record<string, string>) ?? {}
  const daysAhead = (config.days_ahead as number) ?? 7
  const allEvents: Record<string, unknown>[] = []

  // Collect Google calendar events
  const googleIds = calendarSources
    .filter((cs) => cs.type === 'google')
    .map((cs) => String(cs.id))

  if (googleIds.length > 0) {
    const sortedIds = [...googleIds].sort()
    const cacheKey = `google_calendar_${sortedIds.join('_')}_${daysAhead}`
    const cached = cacheEntries.get(cacheKey) as { events?: Record<string, unknown>[] } | undefined
    if (cached?.events) {
      for (const event of cached.events) {
        let e = event
        for (const gid of googleIds) {
          const color = colors[`google:${gid}`]
          if (color) {
            e = { ...e, color }
            break
          }
        }
        allEvents.push(e)
      }
    }
  }

  // Collect ICS calendar events
  for (const cs of calendarSources) {
    if (cs.type === 'ics') {
      const cacheKey = `ics_calendar_${cs.id}`
      const cached = cacheEntries.get(cacheKey) as { events?: Record<string, unknown>[] } | undefined
      if (cached?.events) {
        const color = colors[`ics:${cs.id}`]
        for (const event of cached.events) {
          if (color) {
            allEvents.push({ ...event, color })
          } else {
            allEvents.push(event)
          }
        }
      }
    }
  }

  if (allEvents.length === 0) return null

  // Sort by start time
  allEvents.sort((a, b) => {
    const aStart = (a.start as string) ?? ''
    const bStart = (b.start as string) ?? ''
    return aStart.localeCompare(bStart)
  })

  return { events: allEvents }
}

export async function displayRoutes(app: FastifyInstance): Promise<void> {
  const config = (app as unknown as { config: { dbPath: string; secretKeyPath: string } }).config
  const db = (app as unknown as { db: import('better-sqlite3').Database }).db

  app.get('/api/display', async (_request, reply) => {
    // Check schedule
    const settings = loadSettings(config)
    const schedulingEnabled = settings.scheduling_enabled === true

    let layout: LayoutRow | undefined

    if (schedulingEnabled) {
      const rules = listEnabledScheduleRules(db)
      const scheduleResult = evaluateSchedule(rules, new Date())

      if (scheduleResult) {
        if (scheduleResult.display_power === 'off') {
          // Display off - return minimal response
          const response: DisplayResponse = {
            layout: null,
            widgets: [],
            refresh_interval: getRefreshInterval(config),
            display_power: 'off',
          }
          return response
        }
        // Schedule says show a specific layout
        layout = db.prepare('SELECT * FROM layouts WHERE id = ?').get(scheduleResult.layout_id) as LayoutRow | undefined
      }
    }

    // Fallback: use manually-activated layout
    if (!layout) {
      layout = db.prepare('SELECT * FROM layouts WHERE is_active = 1').get() as LayoutRow | undefined
    }

    if (!layout) {
      reply.code(404).send({ error: 'No active layout' })
      return
    }

    // Query all ICS calendars for auto-inclusion
    const allIcs = listIcsCalendars(db)

    // Get widgets for active layout
    const widgetRows = db.prepare('SELECT * FROM widgets WHERE layout_id = ?').all(layout.id) as WidgetRow[]

    // Compute needed cache keys
    const cacheKeys = new Map<number, string>() // widget_id -> cache_key
    const multiSourceConfigs = new Map<number, Record<string, unknown>>() // widget_id -> effective config
    const allNeededKeys = new Set<string>()

    for (const row of widgetRows) {
      const widgetConfig = JSON.parse(row.config) as Record<string, unknown>
      if (row.widget_type === 'calendar') {
        const effectiveConfig = { ...widgetConfig }
        // Auto-include all ICS calendars when no explicit sources configured
        if (!effectiveConfig.calendar_sources && !effectiveConfig.calendar_ids && allIcs.length > 0) {
          effectiveConfig.calendar_sources = allIcs.map((ic) => ({ type: 'ics', id: ic.id }))
        }
        if (effectiveConfig.calendar_sources) {
          multiSourceConfigs.set(row.id, effectiveConfig)
          const calKeys = getCalendarCacheKeys(effectiveConfig)
          for (const [, cacheKey] of calKeys) {
            allNeededKeys.add(cacheKey)
          }
        } else {
          const key = getCacheKey({ widget_type: row.widget_type, config: widgetConfig })
          if (key) {
            cacheKeys.set(row.id, key)
            allNeededKeys.add(key)
          }
        }
      } else {
        const key = getCacheKey({ widget_type: row.widget_type, config: widgetConfig })
        if (key) {
          cacheKeys.set(row.id, key)
          allNeededKeys.add(key)
        }
      }
    }

    // Batch-query cache
    const cacheEntries = allNeededKeys.size > 0
      ? getCacheMultiple(db, [...allNeededKeys])
      : new Map<string, unknown>()

    // Build widget responses
    const widgets: DisplayWidgetResponse[] = widgetRows.map((row) => {
      const widgetConfig = JSON.parse(row.config) as Record<string, unknown>
      let data: Record<string, unknown> | null = null

      if (multiSourceConfigs.has(row.id)) {
        data = mergeCalendarData(multiSourceConfigs.get(row.id)!, cacheEntries)
      } else {
        const cacheKey = cacheKeys.get(row.id)
        if (cacheKey) {
          data = (cacheEntries.get(cacheKey) as Record<string, unknown>) ?? null
        }
      }

      return {
        id: row.id,
        widget_type: row.widget_type as DisplayWidgetResponse['widget_type'],
        config: widgetConfig,
        data,
        position_x: row.position_x,
        position_y: row.position_y,
        width: row.width,
        height: row.height,
      }
    })

    const response: DisplayResponse = {
      layout: {
        id: layout.id,
        name: layout.name,
        columns: layout.columns,
        row_height: layout.row_height,
        theme: JSON.parse(layout.theme),
      },
      widgets,
      refresh_interval: getRefreshInterval(config),
      display_power: 'on',
    }

    return response
  })

  app.get<{ Querystring: { url: string } }>('/api/photos/proxy', async (request, reply) => {
    const { url } = request.query
    if (!url || !url.startsWith('https://lh3.googleusercontent.com/')) {
      reply.code(400).send({ error: 'Invalid photo URL' })
      return
    }

    const settings = loadSettings(config)
    const clientId = (settings.google_client_id as string) ?? ''
    const clientSecret = (settings.google_client_secret as string) ?? ''

    let key: Buffer
    try {
      key = loadOrCreateKey(config.secretKeyPath)
    } catch {
      reply.code(502).send({ error: 'Encryption key unavailable' })
      return
    }

    const accessToken = await getValidAccessToken(db, key, clientId, clientSecret)
    if (!accessToken) {
      reply.code(502).send({ error: 'Google not connected' })
      return
    }

    const photoUrl = `${url}=w1920-h1080`

    try {
      const resp = await fetch(photoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      })

      if (!resp.ok) {
        request.log.warn(`Photo proxy failed: ${resp.status}`)
        reply.code(resp.status).send({ error: 'Photo fetch failed' })
        return
      }

      const contentType = resp.headers.get('content-type') ?? 'image/jpeg'
      const buffer = Buffer.from(await resp.arrayBuffer())

      reply
        .header('content-type', contentType)
        .header('cache-control', 'private, max-age=3000')
        .send(buffer)
    } catch (err) {
      request.log.warn(`Photo proxy request error: ${err}`)
      reply.code(502).send({ error: 'Photo fetch failed' })
    }
  })
}
