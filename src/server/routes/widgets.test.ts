import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAuthedApp, injectAuth } from '../test/helpers.js'
import type { AuthedTestApp } from '../test/helpers.js'

const MOCK_GEO_RESULT = { lat: 40.7484, lon: -73.9967, locationName: 'New York, NY' }

// Mock geocoding module
vi.mock('../services/geocoding.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/geocoding.js')>()
  return {
    ...actual,
    geocodeZip: vi.fn(),
  }
})

import { geocodeZip } from '../services/geocoding.js'
import { GeocodingError } from '../services/geocoding.js'

const mockedGeocodeZip = vi.mocked(geocodeZip)

describe('widget routes', () => {
  let ctx: AuthedTestApp
  let layoutId: number

  beforeEach(async () => {
    ctx = await createAuthedApp()
    const resp = await injectAuth(ctx.app, 'POST', '/api/layouts', {
      payload: { name: 'Test Layout' },
    }, ctx.cookie)
    layoutId = resp.json().id
    mockedGeocodeZip.mockReset()
  })

  it('should add a widget to a layout', async () => {
    const resp = await injectAuth(ctx.app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'clock',
        config: { timezone: 'America/New_York', format_24h: false },
        position_x: 0,
        position_y: 0,
        width: 3,
        height: 2,
      },
    }, ctx.cookie)
    expect(resp.statusCode).toBe(201)
    const data = resp.json()
    expect(data.widget_type).toBe('clock')
    expect(data.layout_id).toBe(layoutId)
  })

  it('should update a widget', async () => {
    const createResp = await injectAuth(ctx.app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'notes',
        config: { content: 'Hello' },
        position_x: 0,
        position_y: 0,
        width: 3,
        height: 2,
      },
    }, ctx.cookie)
    const widgetId = createResp.json().id

    const resp = await injectAuth(ctx.app, 'PUT', `/api/widgets/${widgetId}`, {
      payload: { config: { content: 'Updated' } },
    }, ctx.cookie)
    expect(resp.statusCode).toBe(200)
    expect(resp.json().config.content).toBe('Updated')
  })

  it('should delete a widget', async () => {
    const createResp = await injectAuth(ctx.app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'clock',
        config: {},
        position_x: 0,
        position_y: 0,
        width: 3,
        height: 2,
      },
    }, ctx.cookie)
    const widgetId = createResp.json().id

    const resp = await injectAuth(ctx.app, 'DELETE', `/api/widgets/${widgetId}`, undefined, ctx.cookie)
    expect(resp.statusCode).toBe(204)
  })

  it('should batch update positions', async () => {
    const r1 = await injectAuth(ctx.app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'clock',
        config: {},
        position_x: 0,
        position_y: 0,
        width: 3,
        height: 2,
      },
    }, ctx.cookie)
    const r2 = await injectAuth(ctx.app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'notes',
        config: { content: 'Hi' },
        position_x: 3,
        position_y: 0,
        width: 3,
        height: 2,
      },
    }, ctx.cookie)
    const id1 = r1.json().id
    const id2 = r2.json().id

    const resp = await injectAuth(ctx.app, 'PUT', `/api/layouts/${layoutId}/widgets/positions`, {
      payload: [
        { id: id1, position_x: 6, position_y: 0, width: 4, height: 3 },
        { id: id2, position_x: 0, position_y: 0, width: 6, height: 2 },
      ],
    }, ctx.cookie)
    expect(resp.statusCode).toBe(200)

    const layoutResp = await injectAuth(ctx.app, 'GET', `/api/layouts/${layoutId}`, undefined, ctx.cookie)
    const widgets = layoutResp.json().widgets
    const byId: Record<number, { position_x: number; width: number }> = {}
    for (const w of widgets) byId[w.id] = w
    expect(byId[id1].position_x).toBe(6)
    expect(byId[id2].width).toBe(6)
  })

  it('should return 404 when adding widget to nonexistent layout', async () => {
    const resp = await injectAuth(ctx.app, 'POST', '/api/layouts/999/widgets', {
      payload: {
        widget_type: 'clock',
        config: {},
        position_x: 0,
        position_y: 0,
        width: 3,
        height: 2,
      },
    }, ctx.cookie)
    expect(resp.statusCode).toBe(404)
  })

  it('should resolve zip code when adding a weather widget', async () => {
    mockedGeocodeZip.mockResolvedValue(MOCK_GEO_RESULT)

    const resp = await injectAuth(ctx.app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'weather',
        config: { zip_code: '10001', units: 'imperial' },
        position_x: 0,
        position_y: 0,
        width: 4,
        height: 3,
      },
    }, ctx.cookie)
    expect(resp.statusCode).toBe(201)
    const config = resp.json().config
    expect(config.lat).toBe(40.7484)
    expect(config.lon).toBe(-73.9967)
    expect(config.location_name).toBe('New York, NY')
    expect(config.zip_code).toBe('10001')
    expect(mockedGeocodeZip).toHaveBeenCalledWith('10001')
  })

  it('should resolve zip code when updating a weather widget', async () => {
    mockedGeocodeZip.mockResolvedValue(MOCK_GEO_RESULT)

    const createResp = await injectAuth(ctx.app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'weather',
        config: { zip_code: '10001', units: 'imperial' },
        position_x: 0,
        position_y: 0,
        width: 4,
        height: 3,
      },
    }, ctx.cookie)
    const widgetId = createResp.json().id
    mockedGeocodeZip.mockClear()
    mockedGeocodeZip.mockResolvedValue(MOCK_GEO_RESULT)

    const resp = await injectAuth(ctx.app, 'PUT', `/api/widgets/${widgetId}`, {
      payload: { config: { zip_code: '90210', units: 'imperial' } },
    }, ctx.cookie)
    expect(resp.statusCode).toBe(200)
    expect(resp.json().config.lat).toBe(40.7484)
    expect(mockedGeocodeZip).toHaveBeenCalledWith('90210')
  })

  it('should return 400 for invalid zip code on weather widget', async () => {
    mockedGeocodeZip.mockRejectedValue(new GeocodingError('No location found for zip code: 00000'))

    const resp = await injectAuth(ctx.app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'weather',
        config: { zip_code: '00000', units: 'imperial' },
        position_x: 0,
        position_y: 0,
        width: 4,
        height: 3,
      },
    }, ctx.cookie)
    expect(resp.statusCode).toBe(400)
    expect(resp.json().error).toContain('No location found')
  })

  it('should preserve photos widget config with interval_seconds', async () => {
    const resp = await injectAuth(ctx.app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'photos',
        config: { album_id: 'abc123', interval_seconds: 45, transition: 'fade' },
        position_x: 0,
        position_y: 0,
        width: 6,
        height: 4,
      },
    }, ctx.cookie)
    expect(resp.statusCode).toBe(201)
    const config = resp.json().config
    expect(config.interval_seconds).toBe(45)
    expect(config.interval).toBeUndefined()
  })

  it('should preserve clock widget config with format_24h', async () => {
    const resp = await injectAuth(ctx.app, 'POST', `/api/layouts/${layoutId}/widgets`, {
      payload: {
        widget_type: 'clock',
        config: { timezone: 'America/New_York', format_24h: true },
        position_x: 0,
        position_y: 0,
        width: 3,
        height: 2,
      },
    }, ctx.cookie)
    expect(resp.statusCode).toBe(201)
    const config = resp.json().config
    expect(config.format_24h).toBe(true)
    expect(config.use_24h).toBeUndefined()
  })

  it('should return 404 when updating nonexistent widget', async () => {
    const resp = await injectAuth(ctx.app, 'PUT', '/api/widgets/999', {
      payload: { config: { content: 'Hi' } },
    }, ctx.cookie)
    expect(resp.statusCode).toBe(404)
  })

  it('should return 404 when deleting nonexistent widget', async () => {
    const resp = await injectAuth(ctx.app, 'DELETE', '/api/widgets/999', undefined, ctx.cookie)
    expect(resp.statusCode).toBe(404)
  })

  it('should return 404 for batch positions with nonexistent layout', async () => {
    const resp = await injectAuth(ctx.app, 'PUT', '/api/layouts/999/widgets/positions', {
      payload: [
        { id: 1, position_x: 0, position_y: 0, width: 3, height: 2 },
      ],
    }, ctx.cookie)
    expect(resp.statusCode).toBe(404)
  })

  it('should return 404 for batch positions with wrong widget id', async () => {
    const resp = await injectAuth(ctx.app, 'PUT', `/api/layouts/${layoutId}/widgets/positions`, {
      payload: [
        { id: 99999, position_x: 0, position_y: 0, width: 3, height: 2 },
      ],
    }, ctx.cookie)
    expect(resp.statusCode).toBe(404)
    expect(resp.json().error).toContain('99999')
  })

  it('should require auth for all widget endpoints', async () => {
    const resp = await ctx.app.inject({
      method: 'POST',
      url: `/api/layouts/${layoutId}/widgets`,
      payload: {
        widget_type: 'clock',
        config: {},
        position_x: 0,
        position_y: 0,
        width: 3,
        height: 2,
      },
    })
    expect(resp.statusCode).toBe(401)
  })
})
