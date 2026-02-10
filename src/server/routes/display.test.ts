import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { createAuthedApp, injectAuth } from '../test/helpers.js'
import { getCacheKey } from './display.js'
import { upsertCache } from '../db/queries/cache.js'
import { createScheduleRule } from '../db/queries/schedule-rules.js'

describe('display routes', () => {
  let app: FastifyInstance
  let cookie: string
  let db: Database.Database

  beforeEach(async () => {
    const authed = await createAuthedApp()
    app = authed.app
    cookie = authed.cookie
    db = authed.db
  })

  afterEach(async () => {
    await app.close()
  })

  it('should return active layout with widgets', async () => {
    // Create layout and activate
    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Active Layout', columns: 12, row_height: 80 },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)

    // Add widgets
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: { widget_type: 'clock', config: { timezone: 'UTC' }, position_x: 0, position_y: 0, width: 3, height: 2 },
    }, cookie)
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: { widget_type: 'notes', config: { content: 'Hello' }, position_x: 3, position_y: 0, width: 3, height: 2 },
    }, cookie)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    const data = resp.json()
    expect(data.layout.name).toBe('Active Layout')
    expect(data.layout.columns).toBe(12)
    expect(data.widgets).toHaveLength(2)
    const widgetTypes = new Set(data.widgets.map((w: { widget_type: string }) => w.widget_type))
    expect(widgetTypes).toEqual(new Set(['clock', 'notes']))
  })

  it('should return 404 when no active layout', async () => {
    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(404)
  })

  it('should merge cached weather data into widgets', async () => {
    // Create layout with weather widget
    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Display Test' },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'weather',
        config: { lat: 40.7, lon: -74.0, units: 'imperial' },
        position_x: 0, position_y: 0, width: 4, height: 3,
      },
    }, cookie)

    // Insert cache entry (JS renders -74.0 as -74 in template literals)
    upsertCache(db, 'weather_40.7_-74', { temp: 72, condition: 'sunny' }, null)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    const weatherWidget = resp.json().widgets[0]
    expect(weatherWidget.widget_type).toBe('weather')
    expect(weatherWidget.data).toEqual({ temp: 72, condition: 'sunny' })
  })

  it('should include default refresh interval', async () => {
    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Interval Test' },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    expect(resp.json().refresh_interval).toBe(60)
  })

  it('should include custom refresh interval from settings', async () => {
    // Update setting
    await injectAuth(app, 'PUT', '/api/settings', {
      payload: { display_refresh_interval: 120 },
    }, cookie)

    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Custom Interval' },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    expect(resp.json().refresh_interval).toBe(120)
  })

  it('should merge multi-source calendar data sorted by start', async () => {
    // Create ICS calendar record
    db.prepare(
      "INSERT INTO ics_calendars (name, url, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run('Work ICS', 'https://example.com/cal.ics', '#ff0000', new Date().toISOString(), new Date().toISOString())
    const icsId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id

    // Create layout with multi-source calendar widget
    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Multi Source' },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'calendar',
        config: {
          calendar_sources: [
            { type: 'google', id: 'work' },
            { type: 'ics', id: icsId },
          ],
          days_ahead: 7,
          colors: { 'google:work': '#0000ff', [`ics:${icsId}`]: '#ff0000' },
        },
        position_x: 0, position_y: 0, width: 6, height: 4,
      },
    }, cookie)

    // Populate cache
    upsertCache(db, 'google_calendar_work_7', {
      events: [
        { title: 'Google Meeting', start: '2026-02-03T10:00:00', end: '2026-02-03T11:00:00' },
        { title: 'Google Standup', start: '2026-02-03T09:00:00', end: '2026-02-03T09:15:00' },
      ],
    }, null)
    upsertCache(db, `ics_calendar_${icsId}`, {
      events: [
        { title: 'ICS Event', start: '2026-02-03T09:30:00', end: '2026-02-03T10:00:00' },
      ],
    }, null)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    const widget = resp.json().widgets[0]
    expect(widget.widget_type).toBe('calendar')
    const events = widget.data.events
    expect(events).toHaveLength(3)
    expect(events[0].title).toBe('Google Standup')
    expect(events[1].title).toBe('ICS Event')
    expect(events[2].title).toBe('Google Meeting')
  })

  it('should apply color mapping to calendar events', async () => {
    db.prepare(
      "INSERT INTO ics_calendars (name, url, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run('Personal', 'https://example.com/personal.ics', '#00ff00', new Date().toISOString(), new Date().toISOString())
    const icsId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id

    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Color Test' },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'calendar',
        config: {
          calendar_sources: [
            { type: 'google', id: 'primary' },
            { type: 'ics', id: icsId },
          ],
          days_ahead: 7,
          colors: { 'google:primary': '#3b82f6', [`ics:${icsId}`]: '#ef4444' },
        },
        position_x: 0, position_y: 0, width: 6, height: 4,
      },
    }, cookie)

    upsertCache(db, 'google_calendar_primary_7', {
      events: [{ title: 'Team Sync', start: '2026-02-03T14:00:00', end: '2026-02-03T15:00:00', calendar_id: 'primary' }],
    }, null)
    upsertCache(db, `ics_calendar_${icsId}`, {
      events: [{ title: 'Yoga', start: '2026-02-03T07:00:00', end: '2026-02-03T08:00:00' }],
    }, null)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    const events = resp.json().widgets[0].data.events
    const yoga = events.find((e: { title: string }) => e.title === 'Yoga')
    const teamSync = events.find((e: { title: string }) => e.title === 'Team Sync')
    expect(yoga.color).toBe('#ef4444')
    expect(teamSync.color).toBe('#3b82f6')
  })

  it('should apply different colors to multiple Google calendars', async () => {
    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Multi-Google Color Test' },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'calendar',
        config: {
          calendar_sources: [
            { type: 'google', id: 'family' },
            { type: 'google', id: 'work' },
            { type: 'google', id: 'school' },
          ],
          days_ahead: 7,
          colors: { 'google:family': '#ff0000', 'google:work': '#0000ff', 'google:school': '#00ff00' },
        },
        position_x: 0, position_y: 0, width: 6, height: 4,
      },
    }, cookie)

    upsertCache(db, 'google_calendar_family_school_work_7', {
      events: [
        { title: 'Dinner', start: '2026-02-03T18:00:00', end: '2026-02-03T19:00:00', calendar_id: 'family' },
        { title: 'Standup', start: '2026-02-03T09:00:00', end: '2026-02-03T09:30:00', calendar_id: 'work' },
        { title: 'PTA Meeting', start: '2026-02-03T15:00:00', end: '2026-02-03T16:00:00', calendar_id: 'school' },
      ],
    }, null)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    const events = resp.json().widgets[0].data.events
    const dinner = events.find((e: { title: string }) => e.title === 'Dinner')
    const standup = events.find((e: { title: string }) => e.title === 'Standup')
    const pta = events.find((e: { title: string }) => e.title === 'PTA Meeting')
    expect(dinner.color).toBe('#ff0000')
    expect(standup.color).toBe('#0000ff')
    expect(pta.color).toBe('#00ff00')
  })

  it('should support backward-compatible calendar_ids format', async () => {
    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Compat Test' },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'calendar',
        config: { calendar_ids: ['primary', 'work'], days_ahead: 14 },
        position_x: 0, position_y: 0, width: 6, height: 4,
      },
    }, cookie)

    upsertCache(db, 'google_calendar_primary_work_14', {
      events: [{ title: 'Old Format Event', start: '2026-02-03T12:00:00', end: '2026-02-03T13:00:00' }],
    }, null)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    const widget = resp.json().widgets[0]
    expect(widget.data.events[0].title).toBe('Old Format Event')
  })

  it('should auto-include ICS calendars for unconfigured calendar widgets', async () => {
    db.prepare(
      "INSERT INTO ics_calendars (name, url, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run('School', 'https://school.example.com/cal.ics', '#3b82f6', new Date().toISOString(), new Date().toISOString())
    const icsId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id

    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Auto ICS' },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'calendar',
        config: {},
        position_x: 0, position_y: 0, width: 6, height: 4,
      },
    }, cookie)

    upsertCache(db, `ics_calendar_${icsId}`, {
      events: [{ title: 'School Event', start: '2026-02-03T08:00:00', end: '2026-02-03T09:00:00' }],
    }, null)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    const widget = resp.json().widgets[0]
    expect(widget.data).not.toBeNull()
    expect(widget.data.events).toHaveLength(1)
    expect(widget.data.events[0].title).toBe('School Event')
  })

  it('should return partial cache when only some sources are cached', async () => {
    db.prepare(
      "INSERT INTO ics_calendars (name, url, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run('Shared', 'https://example.com/shared.ics', '#9333ea', new Date().toISOString(), new Date().toISOString())
    const icsId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id

    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Partial Cache' },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'calendar',
        config: {
          calendar_sources: [
            { type: 'google', id: 'primary' },
            { type: 'ics', id: icsId },
          ],
          days_ahead: 7,
          colors: {},
        },
        position_x: 0, position_y: 0, width: 6, height: 4,
      },
    }, cookie)

    // Only ICS cache exists
    upsertCache(db, `ics_calendar_${icsId}`, {
      events: [{ title: 'ICS Only', start: '2026-02-03T10:00:00', end: '2026-02-03T11:00:00' }],
    }, null)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    const events = resp.json().widgets[0].data.events
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('ICS Only')
  })

  it('should validate photo proxy URL', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: '/api/photos/proxy?url=https://evil.com/image.jpg',
    })
    expect(resp.statusCode).toBe(400)
    expect(resp.json().error).toBe('Invalid photo URL')
  })

  it('should return 400 for photo proxy with missing url', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: '/api/photos/proxy',
    })
    expect(resp.statusCode).toBe(400)
  })

  it('should return 502 when Google not connected for photo proxy', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: '/api/photos/proxy?url=https://lh3.googleusercontent.com/test.jpg',
    })
    // No Google integration set up, so should fail
    expect(resp.statusCode).toBe(502)
  })

  it('should always include display_power on in normal responses', async () => {
    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Power Test' },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    expect(resp.json().display_power).toBe('on')
  })

  it('should use manually-activated layout when scheduling is disabled (default)', async () => {
    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Manual Layout' },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)

    // Create a schedule rule in DB (but scheduling is disabled by default)
    const otherLayout = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Scheduled Layout' },
    }, cookie)
    const otherLayoutId = otherLayout.json().id

    createScheduleRule(db, {
      layout_id: otherLayoutId,
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
      start_time: '00:00',
      end_time: '00:00',
    })

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    expect(resp.json().layout.name).toBe('Manual Layout')
    expect(resp.json().display_power).toBe('on')
  })

  it('should return scheduled layout when scheduling is enabled and rule matches', async () => {
    // Enable scheduling
    await injectAuth(app, 'PUT', '/api/settings', {
      payload: { scheduling_enabled: true },
    }, cookie)

    // Create and activate manual layout
    const manualResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Manual' },
    }, cookie)
    const manualId = manualResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${manualId}/activate`, {}, cookie)

    // Create scheduled layout
    const schedResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Scheduled' },
    }, cookie)
    const schedId = schedResp.json().id

    // Create rule: every day all-day -> scheduled layout
    createScheduleRule(db, {
      layout_id: schedId,
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
      start_time: '00:00',
      end_time: '00:00',
    })

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    expect(resp.json().layout.name).toBe('Scheduled')
    expect(resp.json().display_power).toBe('on')
  })

  it('should return display off when scheduled rule has null layout_id', async () => {
    await injectAuth(app, 'PUT', '/api/settings', {
      payload: { scheduling_enabled: true },
    }, cookie)

    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Active' },
    }, cookie)
    await injectAuth(app, 'POST', `/api/layouts/${layoutResp.json().id}/activate`, {}, cookie)

    // Display off rule: every day all day
    createScheduleRule(db, {
      layout_id: null,
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
      start_time: '00:00',
      end_time: '00:00',
    })

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    expect(resp.json().display_power).toBe('off')
    expect(resp.json().layout).toBeNull()
    expect(resp.json().widgets).toEqual([])
  })

  it('should fall back to manual layout when no schedule rule matches', async () => {
    await injectAuth(app, 'PUT', '/api/settings', {
      payload: { scheduling_enabled: true },
    }, cookie)

    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Fallback' },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)

    // Rule only covers day 0 (doesn't exist in ISO) - will never match
    // Actually use a day range that doesn't include today to guarantee no match
    // We use an empty rule set by not creating any rules - scheduling is enabled but no rules
    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    expect(resp.json().layout.name).toBe('Fallback')
    expect(resp.json().display_power).toBe('on')
  })

  it('should not include background_photos when layout has no photo background', async () => {
    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Color BG', theme: { background: '#1a1a2e' } },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    expect(resp.json().background_photos).toBeUndefined()
  })

  it('should include background_photos when theme has photo background and cache has data', async () => {
    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: {
        name: 'Photo BG',
        theme: {
          background_type: 'photos',
          background_photos_source: 'google',
          background_picker_session_id: 'bg_sess_1',
        },
      },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)

    // Populate cache
    upsertCache(db, 'google_photos_picker_bg_sess_1', {
      photos: [
        { id: 'p1', url: '/api/photos/proxy?url=https://lh3.googleusercontent.com/photo1', mimeType: 'image/jpeg' },
        { id: 'p2', url: '/api/photos/proxy?url=https://lh3.googleusercontent.com/photo2', mimeType: 'image/jpeg' },
      ],
    }, null)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    const data = resp.json()
    expect(data.background_photos).toHaveLength(2)
    expect(data.background_photos[0].url).toContain('photo1')
    expect(data.background_photos[1].url).toContain('photo2')
  })

  it('should not include background_photos when config exists but cache is empty', async () => {
    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: {
        name: 'No Cache BG',
        theme: {
          background_type: 'photos',
          background_photos_source: 'google',
          background_picker_session_id: 'bg_sess_empty',
        },
      },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    expect(resp.json().background_photos).toBeUndefined()
  })

  it('should include background_photos for apple photos background', async () => {
    const layoutResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: {
        name: 'Apple BG',
        theme: {
          background_type: 'photos',
          background_photos_source: 'apple',
          background_icloud_album_url: 'https://www.icloud.com/sharedalbum/#TestBgAlbum',
        },
      },
    }, cookie)
    const layoutId = layoutResp.json().id
    await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)

    upsertCache(db, 'apple_photos_TestBgAlbum', {
      photos: [
        { id: 'a1', url: 'https://cvws.icloud-content.com/photo1.jpg', width: 2048, height: 1536 },
      ],
    }, null)

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    const data = resp.json()
    expect(data.background_photos).toHaveLength(1)
    expect(data.background_photos[0].url).toContain('photo1.jpg')
  })

  it('should override manually activated layout with schedule', async () => {
    await injectAuth(app, 'PUT', '/api/settings', {
      payload: { scheduling_enabled: true },
    }, cookie)

    // Activate layout A manually
    const layoutA = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Layout A' },
    }, cookie)
    await injectAuth(app, 'POST', `/api/layouts/${layoutA.json().id}/activate`, {}, cookie)

    // Schedule says layout B (all-day every day)
    const layoutB = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Layout B' },
    }, cookie)
    createScheduleRule(db, {
      layout_id: layoutB.json().id,
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
      start_time: '00:00',
      end_time: '00:00',
    })

    const resp = await app.inject({ method: 'GET', url: '/api/display' })
    expect(resp.statusCode).toBe(200)
    expect(resp.json().layout.name).toBe('Layout B')
  })
})

describe('display helper functions', () => {
  it('getCacheKey returns correct keys for each widget type', () => {
    expect(getCacheKey({ widget_type: 'weather', config: { lat: 40.7, lon: -74.0 } }))
      .toBe('weather_40.7_-74')
    expect(getCacheKey({ widget_type: 'clock', config: { timezone: 'UTC' } }))
      .toBeNull()
    expect(getCacheKey({ widget_type: 'calendar', config: { calendar_ids: ['work'], days_ahead: 7 } }))
      .toBe('google_calendar_work_7')
    expect(getCacheKey({ widget_type: 'photos', config: { picker_session_id: 'abc' } }))
      .toBe('google_photos_picker_abc')
    expect(getCacheKey({ widget_type: 'notes', config: {} }))
      .toBeNull()
    // calendar with calendar_sources returns null
    expect(getCacheKey({ widget_type: 'calendar', config: { calendar_sources: [{ type: 'google', id: 'primary' }] } }))
      .toBeNull()
  })

  it('getCacheKey returns apple_photos key for apple source', () => {
    expect(getCacheKey({
      widget_type: 'photos',
      config: {
        photos_source: 'apple',
        icloud_album_url: 'https://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y',
      },
    })).toBe('apple_photos_B0z5qAGN1JIFd3y')
  })

  it('getCacheKey returns google_photos key for google source', () => {
    expect(getCacheKey({
      widget_type: 'photos',
      config: {
        photos_source: 'google',
        picker_session_id: 'sess123',
      },
    })).toBe('google_photos_picker_sess123')
  })

  it('getCacheKey returns null for photos widget without source', () => {
    expect(getCacheKey({ widget_type: 'photos', config: {} })).toBeNull()
    expect(getCacheKey({ widget_type: 'photos', config: { photos_source: 'apple' } })).toBeNull()
    expect(getCacheKey({ widget_type: 'photos', config: { photos_source: 'google' } })).toBeNull()
  })

  it('getCacheKey handles legacy photos widget without photos_source field', () => {
    // Legacy widgets have picker_session_id but no photos_source
    expect(getCacheKey({
      widget_type: 'photos',
      config: { picker_session_id: 'legacy_sess' },
    })).toBe('google_photos_picker_legacy_sess')
  })
})
