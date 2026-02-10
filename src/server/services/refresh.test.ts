import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createTestDb } from '../db/connection.js'
import { Config } from '../config.js'
import { collectDataSources, refreshOnce, startRefreshLoop, forceRefreshAll, getRefreshProgress } from './refresh.js'
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
vi.mock('./apple-photos.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apple-photos.js')>()
  return {
    ...actual,
    fetchApplePhotos: vi.fn(),
  }
})

import { fetchWeather } from './weather.js'
import { fetchIcsEvents } from './ical-service.js'
import { getValidAccessToken } from './google-auth.js'
import { fetchApplePhotos } from './apple-photos.js'

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

function seedPhotosWidget(
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
  ).run(layout.id, 'photos', JSON.stringify(widgetConfig), 0, 0, 4, 3, now, now)
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

  it('creates apple_photos source for apple photos widget', () => {
    seedPhotosWidget(db, {
      photos_source: 'apple',
      icloud_album_url: 'https://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y',
    })

    const sources = collectDataSources(db)
    const appleSources = sources.filter((s) => s.type === 'apple_photos')
    expect(appleSources).toHaveLength(1)
    expect(appleSources[0].key).toBe('apple_photos_B0z5qAGN1JIFd3y')
    expect(appleSources[0].params).toEqual({
      icloud_album_url: 'https://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y',
    })
    expect(appleSources[0].interval).toBe(2 * 60 * 60)
  })

  it('creates google_photos source for google photos widget', () => {
    seedPhotosWidget(db, {
      photos_source: 'google',
      picker_session_id: 'sess123',
    })

    const sources = collectDataSources(db)
    const googleSources = sources.filter((s) => s.type === 'photos')
    expect(googleSources).toHaveLength(1)
    expect(googleSources[0].key).toBe('google_photos_picker_sess123')
    expect(googleSources[0].params).toEqual({ picker_session_id: 'sess123' })
    expect(googleSources[0].interval).toBe(50 * 60)
  })

  it('skips photos widget with no source configured', () => {
    seedPhotosWidget(db, {})

    const sources = collectDataSources(db)
    const photosSources = sources.filter((s) => s.type === 'photos' || s.type === 'apple_photos')
    expect(photosSources).toHaveLength(0)
  })

  it('handles legacy photos widget without photos_source field', () => {
    // Legacy widgets only have picker_session_id (no photos_source)
    seedPhotosWidget(db, { picker_session_id: 'legacy_sess' })

    const sources = collectDataSources(db)
    const googleSources = sources.filter((s) => s.type === 'photos')
    expect(googleSources).toHaveLength(1)
    expect(googleSources[0].key).toBe('google_photos_picker_legacy_sess')
  })

  it('skips apple_photos source when icloud_album_url is missing', () => {
    seedPhotosWidget(db, { photos_source: 'apple' })

    const sources = collectDataSources(db)
    const appleSources = sources.filter((s) => s.type === 'apple_photos')
    expect(appleSources).toHaveLength(0)
  })

  it('collects Google Photos background source from layout theme', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('BG Test', 12, 80, 1, JSON.stringify({
      background_type: 'photos',
      background_photos_source: 'google',
      background_picker_session_id: 'bg_sess_123',
    }), now, now)

    const sources = collectDataSources(db)
    const photosSources = sources.filter((s) => s.type === 'photos')
    expect(photosSources).toHaveLength(1)
    expect(photosSources[0].key).toBe('google_photos_picker_bg_sess_123')
    expect(photosSources[0].params).toEqual({ picker_session_id: 'bg_sess_123' })
  })

  it('collects Apple Photos background source from layout theme', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('Apple BG', 12, 80, 1, JSON.stringify({
      background_type: 'photos',
      background_photos_source: 'apple',
      background_icloud_album_url: 'https://www.icloud.com/sharedalbum/#BgAlbumToken',
    }), now, now)

    const sources = collectDataSources(db)
    const appleSources = sources.filter((s) => s.type === 'apple_photos')
    expect(appleSources).toHaveLength(1)
    expect(appleSources[0].key).toBe('apple_photos_BgAlbumToken')
    expect(appleSources[0].params).toEqual({
      icloud_album_url: 'https://www.icloud.com/sharedalbum/#BgAlbumToken',
    })
  })

  it('deduplicates widget and background using same picker session', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('Dedup Test', 12, 80, 1, JSON.stringify({
      background_type: 'photos',
      background_photos_source: 'google',
      background_picker_session_id: 'shared_sess',
    }), now, now)

    const layout = db.prepare('SELECT id FROM layouts WHERE is_active = 1').get() as { id: number }
    db.prepare(
      `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(layout.id, 'photos', JSON.stringify({
      photos_source: 'google',
      picker_session_id: 'shared_sess',
    }), 0, 0, 4, 3, now, now)

    const sources = collectDataSources(db)
    const photosSources = sources.filter((s) => s.type === 'photos')
    expect(photosSources).toHaveLength(1)
    expect(photosSources[0].key).toBe('google_photos_picker_shared_sess')
  })

  it('skips layouts without background_type photos', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('Color BG', 12, 80, 1, JSON.stringify({
      background: '#1a1a2e',
    }), now, now)

    const sources = collectDataSources(db)
    expect(sources).toHaveLength(0)
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

  it('fetches apple photos and caches result', async () => {
    seedPhotosWidget(db, {
      photos_source: 'apple',
      icloud_album_url: 'https://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y',
    })

    vi.mocked(fetchApplePhotos).mockResolvedValue([
      { id: 'abc123', url: 'https://cvws.icloud-content.com/photo1.jpg', width: 2048, height: 1536 },
      { id: 'def456', url: 'https://cvws.icloud-content.com/photo2.jpg', width: 1024, height: 768 },
    ])

    await refreshOnce(db, config)

    expect(fetchApplePhotos).toHaveBeenCalledWith('https://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y')
    const row = db.prepare("SELECT data FROM cache WHERE source = ?").get('apple_photos_B0z5qAGN1JIFd3y') as { data: string } | undefined
    expect(row).toBeDefined()
    const data = JSON.parse(row!.data)
    expect(data.photos).toHaveLength(2)
    expect(data.photos[0].id).toBe('abc123')
    expect(data.photos[0].url).toBe('https://cvws.icloud-content.com/photo1.jpg')
  })

  it('handles apple album errors gracefully', async () => {
    seedPhotosWidget(db, {
      photos_source: 'apple',
      icloud_album_url: 'https://www.icloud.com/sharedalbum/#PrivateAlbum',
    })

    vi.mocked(fetchApplePhotos).mockRejectedValue(new Error('Album not found or private'))

    const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() }
    await refreshOnce(db, config, logger)

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('apple_photos_PrivateAlbum'))
    const row = db.prepare("SELECT data FROM cache WHERE source = ?").get('apple_photos_PrivateAlbum') as { data: string } | undefined
    expect(row).toBeUndefined()
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

describe('forceRefreshAll', () => {
  it('invalidates cache and replaces stale data with fresh fetch', async () => {
    seedWeatherWidget(db)
    const newData = { current: { temperature: 72 }, daily: [] }
    vi.mocked(fetchWeather).mockResolvedValue(newData as never)

    // Populate cache with fresh data (different from what mock will return)
    const futureExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const oldData = { current: { temperature: 60 }, daily: [] }
    db.prepare(
      `INSERT INTO cache (source, data, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`
    ).run('weather_40.7_-74', JSON.stringify(oldData), new Date().toISOString(), futureExpiry)

    // Verify cache has old data before force refresh
    const beforeRow = db.prepare("SELECT data FROM cache WHERE source = 'weather_40.7_-74'").get() as { data: string }
    expect(JSON.parse(beforeRow.data).current.temperature).toBe(60)

    const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const result = await forceRefreshAll(db, config, logger)

    expect(result.refreshed).toBe(1)
    expect(result.failed).toBe(0)
    expect(fetchWeather).toHaveBeenCalledOnce()
    expect(logger.info).toHaveBeenCalledWith('Cache invalidated, starting force refresh')

    // Verify cache now has NEW data (the actual point of force refresh)
    const afterRow = db.prepare("SELECT data FROM cache WHERE source = 'weather_40.7_-74'").get() as { data: string }
    expect(JSON.parse(afterRow.data).current.temperature).toBe(72)
  })

  it('returns counts for successes and failures', async () => {
    seedWeatherWidget(db)
    seedPhotosWidget(db, {
      photos_source: 'apple',
      icloud_album_url: 'https://www.icloud.com/sharedalbum/#TestAlbum',
    })

    vi.mocked(fetchWeather).mockResolvedValue({ current: { temperature: 72 }, daily: [] } as never)
    vi.mocked(fetchApplePhotos).mockRejectedValue(new Error('Album not found'))

    const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const result = await forceRefreshAll(db, config, logger)

    expect(result.refreshed).toBe(1)
    expect(result.failed).toBe(1)
  })

  it('failed source leaves existing cache data intact (invalidated but preserved)', async () => {
    seedPhotosWidget(db, {
      photos_source: 'apple',
      icloud_album_url: 'https://www.icloud.com/sharedalbum/#TestAlbum',
    })

    // Pre-populate cache with old photos data
    const futureExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const oldPhotos = { photos: [{ id: 'old1', url: 'https://example.com/old.jpg' }] }
    db.prepare(
      `INSERT INTO cache (source, data, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`
    ).run('apple_photos_TestAlbum', JSON.stringify(oldPhotos), new Date().toISOString(), futureExpiry)

    // Force refresh will fail
    vi.mocked(fetchApplePhotos).mockRejectedValue(new Error('Album not found'))

    const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() }
    await forceRefreshAll(db, config, logger)

    // Cache entry should still exist with old data (but now expired)
    const row = db.prepare("SELECT data, expires_at FROM cache WHERE source = 'apple_photos_TestAlbum'").get() as { data: string; expires_at: string } | undefined
    expect(row).toBeDefined()
    expect(JSON.parse(row!.data)).toEqual(oldPhotos)
    // expires_at should be in the past (invalidated)
    expect(new Date(row!.expires_at).getTime()).toBeLessThan(Date.now())
  })

  it('refetches even when cache is fresh', async () => {
    seedWeatherWidget(db)

    // Insert fresh cache
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    db.prepare(
      `INSERT INTO cache (source, data, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`
    ).run('weather_40.7_-74', JSON.stringify({ current: { temperature: 60 }, daily: [] }), new Date().toISOString(), futureExpiry)

    vi.mocked(fetchWeather).mockResolvedValue({ current: { temperature: 80 }, daily: [] } as never)

    await forceRefreshAll(db, config)

    // Should have fetched despite fresh cache
    expect(fetchWeather).toHaveBeenCalledOnce()
    const row = db.prepare("SELECT data FROM cache WHERE source = 'weather_40.7_-74'").get() as { data: string }
    expect(JSON.parse(row.data).current.temperature).toBe(80)
  })

  it('tracks progress during refresh', async () => {
    seedWeatherWidget(db)
    seedPhotosWidget(db, {
      photos_source: 'apple',
      icloud_album_url: 'https://www.icloud.com/sharedalbum/#ProgressTest',
    })

    vi.mocked(fetchWeather).mockResolvedValue({ current: { temperature: 72 }, daily: [] } as never)
    vi.mocked(fetchApplePhotos).mockResolvedValue([
      { id: 'p1', url: 'https://example.com/photo.jpg', width: 100, height: 100 },
    ])

    await forceRefreshAll(db, config)

    const progress = getRefreshProgress()
    expect(progress.active).toBe(false)
    expect(progress.total).toBe(2)
    expect(progress.completed).toBe(2)
    expect(progress.failed).toBe(0)
    expect(progress.sources).toHaveLength(2)
    expect(progress.sources.every((s) => s.status === 'completed')).toBe(true)
  })

  it('tracks failed sources in progress', async () => {
    seedWeatherWidget(db)
    vi.mocked(fetchWeather).mockRejectedValue(new Error('Network error'))

    const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() }
    await forceRefreshAll(db, config, logger)

    const progress = getRefreshProgress()
    expect(progress.active).toBe(false)
    expect(progress.total).toBe(1)
    expect(progress.completed).toBe(0)
    expect(progress.failed).toBe(1)
    expect(progress.sources[0].status).toBe('failed')
  })
})
