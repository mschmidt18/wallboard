import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createTestDb } from '../db/connection.js'
import { Config } from '../config.js'
import { collectDataSources, refreshOnce, startRefreshLoop } from './refresh.js'
import type Database from 'better-sqlite3'

// Mock external services
vi.mock('./weather.js', () => ({
  fetchWeather: vi.fn(),
}))
vi.mock('./google-calendar.js', () => ({
  fetchEvents: vi.fn(),
}))
vi.mock('./google-photos.js', () => ({
  getSessionMediaItems: vi.fn(),
}))
vi.mock('./ical-service.js', () => ({
  fetchIcsEvents: vi.fn(),
}))
vi.mock('./google-auth.js', () => ({
  getValidAccessToken: vi.fn(),
}))
vi.mock('./encryption.js', () => ({
  loadOrCreateKey: vi.fn().mockReturnValue(Buffer.alloc(32)),
}))

import { fetchWeather } from './weather.js'
import { fetchIcsEvents } from './ical-service.js'
import { getValidAccessToken } from './google-auth.js'

let db: Database.Database
let config: Config
let tmpDir: string

function seedWeatherWidget(db: Database.Database): void {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('Test', 12, 80, 1, '{}', now, now)

  const layout = db.prepare('SELECT id FROM layouts WHERE is_active = 1').get() as { id: number }

  db.prepare(
    `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(layout.id, 'weather', JSON.stringify({ lat: 40.7, lon: -74.0, units: 'imperial' }), 0, 0, 4, 3, now, now)
}

function seedCalendarWidget(
  db: Database.Database,
  widgetConfig: Record<string, unknown>,
): number {
  const now = new Date().toISOString()
  let layout = db.prepare('SELECT id FROM layouts WHERE is_active = 1').get() as { id: number } | undefined
  if (!layout) {
    db.prepare(
      `INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('Test', 12, 80, 1, '{}', now, now)
    layout = db.prepare('SELECT id FROM layouts WHERE is_active = 1').get() as { id: number }
  }

  const result = db.prepare(
    `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(layout.id, 'calendar', JSON.stringify(widgetConfig), 0, 0, 4, 3, now, now)
  return Number(result.lastInsertRowid)
}

function seedIcsCalendar(db: Database.Database, name: string, url: string, color: string): number {
  const now = new Date().toISOString()
  const result = db.prepare(
    `INSERT INTO ics_calendars (name, url, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(name, url, color, now, now)
  return Number(result.lastInsertRowid)
}

beforeEach(() => {
  vi.clearAllMocks()
  db = createTestDb()
  tmpDir = mkdtempSync(join(tmpdir(), 'wallboard-refresh-test-'))
  config = Config.forTesting(tmpDir)
})

afterEach(() => {
  db.close()
})

describe('collectDataSources', () => {
  it('collects weather source with deduplication', () => {
    seedWeatherWidget(db)
    const sources = collectDataSources(db)
    const weatherSources = sources.filter((s) => s.type === 'weather')
    expect(weatherSources).toHaveLength(1)
    expect(weatherSources[0].key).toBe('weather_40.7_-74')
    expect(weatherSources[0].params).toEqual({ lat: 40.7, lon: -74.0, units: 'imperial' })
    expect(weatherSources[0].interval).toBe(30 * 60)
  })

  it('two calendar widgets with different configs produce separate sources', () => {
    seedCalendarWidget(db, { calendar_ids: ['work'], days_ahead: 7 })
    seedCalendarWidget(db, { calendar_ids: ['personal'], days_ahead: 14 })

    const sources = collectDataSources(db)
    const calSources = sources.filter((s) => s.type === 'calendar')
    expect(calSources).toHaveLength(2)
    const allIds = new Set<string>()
    for (const src of calSources) {
      for (const cid of src.params.calendar_ids as string[]) {
        allIds.add(cid)
      }
    }
    expect(allIds).toContain('work')
    expect(allIds).toContain('personal')
  })

  it('collects ICS calendar source from calendar_sources config', () => {
    const icsId = seedIcsCalendar(db, 'Work ICS', 'https://example.com/cal.ics', '#ff0000')
    seedCalendarWidget(db, {
      calendar_sources: [{ type: 'ics', id: icsId }],
      days_ahead: 7,
    })

    const sources = collectDataSources(db)
    const icsSources = sources.filter((s) => s.type === 'ics_calendar')
    expect(icsSources).toHaveLength(1)
    expect(icsSources[0].key).toBe(`ics_calendar_${icsId}`)
    expect(icsSources[0].interval).toBe(15 * 60)
    expect(icsSources[0].params.url).toBe('https://example.com/cal.ics')
    expect(icsSources[0].params.calendar_name).toBe('Work ICS')
    expect(icsSources[0].params.color).toBe('#ff0000')
  })

  it('collects both Google and ICS sources from mixed config', () => {
    const icsId = seedIcsCalendar(db, 'External', 'https://example.com/ext.ics', '#00ff00')
    seedCalendarWidget(db, {
      calendar_sources: [
        { type: 'google', id: 'work@gmail.com' },
        { type: 'ics', id: icsId },
      ],
      days_ahead: 14,
    })

    const sources = collectDataSources(db)
    const googleSources = sources.filter((s) => s.type === 'calendar')
    const icsSources = sources.filter((s) => s.type === 'ics_calendar')
    expect(googleSources).toHaveLength(1)
    expect(icsSources).toHaveLength(1)
    expect((googleSources[0].params.calendar_ids as string[])).toContain('work@gmail.com')
    expect(icsSources[0].key).toBe(`ics_calendar_${icsId}`)
  })

  it('auto-includes all ICS calendars when no calendar_sources', () => {
    const icsId1 = seedIcsCalendar(db, 'School', 'https://school.example.com/cal.ics', '#ff0000')
    const icsId2 = seedIcsCalendar(db, 'Sports', 'https://sports.example.com/cal.ics', '#00ff00')
    seedCalendarWidget(db, {})

    const sources = collectDataSources(db)
    const icsSources = sources.filter((s) => s.type === 'ics_calendar')
    expect(icsSources).toHaveLength(2)
    const icsKeys = new Set(icsSources.map((s) => s.key))
    expect(icsKeys).toContain(`ics_calendar_${icsId1}`)
    expect(icsKeys).toContain(`ics_calendar_${icsId2}`)
  })

  it('backward-compat calendar_ids format produces google calendar source', () => {
    seedCalendarWidget(db, { calendar_ids: ['primary', 'work@gmail.com'], days_ahead: 7 })

    const sources = collectDataSources(db)
    const calSources = sources.filter((s) => s.type === 'calendar')
    expect(calSources).toHaveLength(1)
    expect((calSources[0].params.calendar_ids as string[]).sort()).toEqual(['primary', 'work@gmail.com'])
  })

  it('backward-compat calendar_ids also auto-includes ICS calendars', () => {
    const icsId = seedIcsCalendar(db, 'School', 'https://school.example.com/cal.ics', '#ff0000')
    seedCalendarWidget(db, { calendar_ids: ['primary'], days_ahead: 7 })

    const sources = collectDataSources(db)
    const googleSources = sources.filter((s) => s.type === 'calendar')
    const icsSources = sources.filter((s) => s.type === 'ics_calendar')
    expect(googleSources).toHaveLength(1)
    expect(icsSources).toHaveLength(1)
    expect(icsSources[0].key).toBe(`ics_calendar_${icsId}`)
  })
})

describe('refreshOnce', () => {
  it('fetches weather when no cache exists', async () => {
    seedWeatherWidget(db)
    const mockData = { current: { temperature: 72 }, daily: [] }
    vi.mocked(fetchWeather).mockResolvedValue(mockData as never)

    await refreshOnce(db, config)

    expect(fetchWeather).toHaveBeenCalledWith(40.7, -74.0, 'imperial')
    const row = db.prepare("SELECT data FROM cache WHERE source = 'weather_40.7_-74'").get() as { data: string } | undefined
    expect(row).toBeDefined()
    expect(JSON.parse(row!.data).current.temperature).toBe(72)
  })

  it('skips when cache is fresh', async () => {
    seedWeatherWidget(db)
    // Insert fresh cache
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour from now
    db.prepare(
      `INSERT INTO cache (source, data, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`
    ).run('weather_40.7_-74', JSON.stringify({ current: { temperature: 72 }, daily: [] }), now.toISOString(), expiresAt.toISOString())

    await refreshOnce(db, config)

    expect(fetchWeather).not.toHaveBeenCalled()
  })

  it('refetches when cache is expired', async () => {
    seedWeatherWidget(db)
    // Insert expired cache
    const now = new Date()
    const expiresAt = new Date(now.getTime() - 60 * 60 * 1000) // 1 hour ago
    db.prepare(
      `INSERT INTO cache (source, data, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`
    ).run('weather_40.7_-74', JSON.stringify({ current: { temperature: 72 }, daily: [] }), new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), expiresAt.toISOString())

    vi.mocked(fetchWeather).mockResolvedValue({ current: { temperature: 80 }, daily: [] } as never)

    await refreshOnce(db, config)

    expect(fetchWeather).toHaveBeenCalledOnce()
    const row = db.prepare("SELECT data FROM cache WHERE source = 'weather_40.7_-74'").get() as { data: string }
    expect(JSON.parse(row.data).current.temperature).toBe(80)
  })

  it('fetches ICS source and caches result', async () => {
    const icsId = seedIcsCalendar(db, 'My ICS', 'https://example.com/feed.ics', '#abcdef')
    seedCalendarWidget(db, {
      calendar_sources: [{ type: 'ics', id: icsId }],
      days_ahead: 7,
    })

    const mockEvents = [
      {
        title: 'Meeting',
        start: '2025-01-15T10:00:00',
        end: '2025-01-15T11:00:00',
        calendar_name: 'My ICS',
        color: '#abcdef',
        all_day: false,
      },
    ]
    vi.mocked(fetchIcsEvents).mockResolvedValue(mockEvents)

    await refreshOnce(db, config)

    expect(fetchIcsEvents).toHaveBeenCalledWith(
      'https://example.com/feed.ics',
      7,
      'My ICS',
      '#abcdef',
    )

    const row = db.prepare(`SELECT data FROM cache WHERE source = ?`).get(`ics_calendar_${icsId}`) as { data: string }
    expect(row).toBeDefined()
    expect(JSON.parse(row.data).events).toEqual(mockEvents)
  })

  it('error in one source does not block others', async () => {
    seedWeatherWidget(db)
    // Add a photos widget too
    const now = new Date().toISOString()
    const layout = db.prepare('SELECT id FROM layouts WHERE is_active = 1').get() as { id: number }
    db.prepare(
      `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(layout.id, 'photos', JSON.stringify({ picker_session_id: 'sess123' }), 4, 0, 4, 3, now, now)

    // Weather fails
    vi.mocked(fetchWeather).mockRejectedValue(new Error('Network error'))
    // Photos needs google auth which returns null
    vi.mocked(getValidAccessToken).mockResolvedValue(null)

    const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() }
    await refreshOnce(db, config, logger)

    // Should have logged error for weather
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('weather_40.7_-74'))
  })

  it('fetches Google calendar data when token available', async () => {
    seedCalendarWidget(db, { calendar_ids: ['primary'], days_ahead: 7 })
    vi.mocked(getValidAccessToken).mockResolvedValue('fake-token')
    const { fetchEvents } = await import('./google-calendar.js')
    vi.mocked(fetchEvents).mockResolvedValue([{ title: 'Event', start: '2025-01-15T10:00:00', end: '2025-01-15T11:00:00', calendar_id: 'primary', calendar_name: 'Primary', all_day: false }] as never)

    await refreshOnce(db, config)

    expect(fetchEvents).toHaveBeenCalledWith('fake-token', ['primary'], 7)
    const row = db.prepare("SELECT data FROM cache WHERE source = ?").get('google_calendar_primary_7') as { data: string } | undefined
    expect(row).toBeDefined()
  })

  it('skips Google calendar when no token available', async () => {
    seedCalendarWidget(db, { calendar_ids: ['primary'], days_ahead: 7 })
    vi.mocked(getValidAccessToken).mockResolvedValue(null)

    await refreshOnce(db, config)

    const row = db.prepare("SELECT data FROM cache WHERE source = ?").get('google_calendar_primary_7') as { data: string } | undefined
    expect(row).toBeUndefined()
  })

  it('fetches photos when token available', async () => {
    const now = new Date().toISOString()
    let layout = db.prepare('SELECT id FROM layouts WHERE is_active = 1').get() as { id: number } | undefined
    if (!layout) {
      db.prepare(`INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Test', 12, 80, 1, '{}', now, now)
      layout = db.prepare('SELECT id FROM layouts WHERE is_active = 1').get() as { id: number }
    }
    db.prepare(`INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(layout!.id, 'photos', JSON.stringify({ picker_session_id: 'sess1' }), 0, 0, 4, 3, now, now)

    vi.mocked(getValidAccessToken).mockResolvedValue('fake-token')
    const { getSessionMediaItems } = await import('./google-photos.js')
    vi.mocked(getSessionMediaItems).mockResolvedValue([{ id: 'p1', baseUrl: 'https://lh3.googleusercontent.com/photo1', mimeType: 'image/jpeg' }])

    await refreshOnce(db, config)

    expect(getSessionMediaItems).toHaveBeenCalledWith('fake-token', 'sess1')
    const row = db.prepare("SELECT data FROM cache WHERE source = ?").get('google_photos_picker_sess1') as { data: string } | undefined
    expect(row).toBeDefined()
    const data = JSON.parse(row!.data)
    expect(data.photos).toHaveLength(1)
  })

  it('handles photos session expiry gracefully', async () => {
    const now = new Date().toISOString()
    let layout = db.prepare('SELECT id FROM layouts WHERE is_active = 1').get() as { id: number } | undefined
    if (!layout) {
      db.prepare(`INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Test', 12, 80, 1, '{}', now, now)
      layout = db.prepare('SELECT id FROM layouts WHERE is_active = 1').get() as { id: number }
    }
    db.prepare(`INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(layout!.id, 'photos', JSON.stringify({ picker_session_id: 'expired_sess' }), 0, 0, 4, 3, now, now)

    vi.mocked(getValidAccessToken).mockResolvedValue('fake-token')
    const { getSessionMediaItems } = await import('./google-photos.js')
    vi.mocked(getSessionMediaItems).mockRejectedValue(new Error('403 Forbidden'))

    await refreshOnce(db, config)

    const row = db.prepare("SELECT data FROM cache WHERE source = ?").get('google_photos_picker_expired_sess') as { data: string } | undefined
    expect(row).toBeDefined()
    const data = JSON.parse(row!.data)
    expect(data.session_expired).toBe(true)
  })
})

describe('startRefreshLoop', () => {
  it('re-reads interval from settings.json each cycle', async () => {
    // Write settings with 30-second interval
    const settingsDir = dirname(config.dbPath)
    mkdirSync(settingsDir, { recursive: true })
    writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify({ display_refresh_interval: 30 }))

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout')

    const handle = startRefreshLoop(db, config, undefined, 60)

    // Wait for the first tick to complete (the initial setTimeout(tick, 0))
    await new Promise((resolve) => setTimeout(resolve, 50))

    // The loop should have called setTimeout with 30 * 1000 (from settings) after the first tick
    const timeoutCalls = setTimeoutSpy.mock.calls
    // Find the call that scheduled the next tick (should be 30000ms, not 60000ms)
    const scheduledIntervals = timeoutCalls
      .filter(([, ms]) => typeof ms === 'number' && ms > 0)
      .map(([, ms]) => ms)

    expect(scheduledIntervals).toContain(30000)

    handle.stop()
    setTimeoutSpy.mockRestore()
  })

  it('handles errors in refresh cycle gracefully', async () => {
    // Give it a widget that will cause errors
    seedWeatherWidget(db)
    vi.mocked(fetchWeather).mockRejectedValue(new Error('boom'))

    const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const handle = startRefreshLoop(db, config, logger, 60)

    await new Promise((resolve) => setTimeout(resolve, 50))

    handle.stop()
    // Should not crash - error is caught and logged
  })
})
