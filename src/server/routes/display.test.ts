import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { createAuthedApp, injectAuth } from '../test/helpers.js'
import { getCacheKey } from './display.js'
import { upsertCache } from '../db/queries/cache.js'

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
      events: [{ title: 'Team Sync', start: '2026-02-03T14:00:00', end: '2026-02-03T15:00:00' }],
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
})
