import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createAuthedApp, injectAuth } from '../test/helpers.js'

describe('Layout routes', () => {
  let app: FastifyInstance
  let cookie: string

  beforeEach(async () => {
    const authed = await createAuthedApp()
    app = authed.app
    cookie = authed.cookie
  })

  afterEach(async () => {
    await app.close()
  })

  it('creates a layout', async () => {
    const resp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'My Dashboard', columns: 12, row_height: 80 },
    }, cookie)
    expect(resp.statusCode).toBe(201)
    const data = resp.json()
    expect(data.name).toBe('My Dashboard')
    expect(data.columns).toBe(12)
    expect(data.is_active).toBe(false)
    expect(data.id).toBeDefined()
    expect(data.widgets).toEqual([])
  })

  it('lists layouts', async () => {
    await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Layout 1' },
    }, cookie)
    await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Layout 2' },
    }, cookie)

    const resp = await injectAuth(app, 'GET', '/api/layouts', {}, cookie)
    expect(resp.statusCode).toBe(200)
    const data = resp.json()
    expect(data).toHaveLength(2)
    expect(data[0].widget_count).toBe(0)
  })

  it('gets a layout with widgets', async () => {
    const createResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Test' },
    }, cookie)
    const layoutId = createResp.json().id

    const resp = await injectAuth(app, 'GET', `/api/layouts/${layoutId}`, {}, cookie)
    expect(resp.statusCode).toBe(200)
    const data = resp.json()
    expect(data.name).toBe('Test')
    expect(data.widgets).toEqual([])
  })

  it('returns 404 for nonexistent layout', async () => {
    const resp = await injectAuth(app, 'GET', '/api/layouts/999', {}, cookie)
    expect(resp.statusCode).toBe(404)
  })

  it('updates a layout', async () => {
    const createResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Old Name' },
    }, cookie)
    const layoutId = createResp.json().id

    const resp = await injectAuth(app, 'PUT', `/api/layouts/${layoutId}`, {
      payload: { name: 'New Name' },
    }, cookie)
    expect(resp.statusCode).toBe(200)
    expect(resp.json().name).toBe('New Name')
  })

  it('returns 404 when updating nonexistent layout', async () => {
    const resp = await injectAuth(app, 'PUT', '/api/layouts/999', {
      payload: { name: 'Nope' },
    }, cookie)
    expect(resp.statusCode).toBe(404)
  })

  it('deletes a layout', async () => {
    const createResp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'To Delete' },
    }, cookie)
    const layoutId = createResp.json().id

    const resp = await injectAuth(app, 'DELETE', `/api/layouts/${layoutId}`, {}, cookie)
    expect(resp.statusCode).toBe(204)

    const getResp = await injectAuth(app, 'GET', `/api/layouts/${layoutId}`, {}, cookie)
    expect(getResp.statusCode).toBe(404)
  })

  it('returns 404 when deleting nonexistent layout', async () => {
    const resp = await injectAuth(app, 'DELETE', '/api/layouts/999', {}, cookie)
    expect(resp.statusCode).toBe(404)
  })

  it('activates a layout and deactivates others', async () => {
    const resp1 = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Layout 1' },
    }, cookie)
    const resp2 = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: 'Layout 2' },
    }, cookie)
    const id1 = resp1.json().id
    const id2 = resp2.json().id

    await injectAuth(app, 'POST', `/api/layouts/${id1}/activate`, {}, cookie)
    const get1 = await injectAuth(app, 'GET', `/api/layouts/${id1}`, {}, cookie)
    expect(get1.json().is_active).toBe(true)

    await injectAuth(app, 'POST', `/api/layouts/${id2}/activate`, {}, cookie)
    const get2 = await injectAuth(app, 'GET', `/api/layouts/${id2}`, {}, cookie)
    expect(get2.json().is_active).toBe(true)
    const get1After = await injectAuth(app, 'GET', `/api/layouts/${id1}`, {}, cookie)
    expect(get1After.json().is_active).toBe(false)
  })

  it('returns 404 when activating nonexistent layout', async () => {
    const resp = await injectAuth(app, 'POST', '/api/layouts/999/activate', {}, cookie)
    expect(resp.statusCode).toBe(404)
  })

  it('returns 400 for validation errors', async () => {
    // Empty name should fail validation
    const resp = await injectAuth(app, 'POST', '/api/layouts', {
      payload: { name: '' },
    }, cookie)
    expect(resp.statusCode).toBe(400)
  })

  it('requires auth for all routes', async () => {
    // No cookie - should get 401
    const resp = await app.inject({ method: 'GET', url: '/api/layouts' })
    expect(resp.statusCode).toBe(401)
  })

  describe('POST /api/layouts/:id/duplicate', () => {
    it('returns 401 without auth', async () => {
      const resp = await app.inject({ method: 'POST', url: '/api/layouts/1/duplicate' })
      expect(resp.statusCode).toBe(401)
    })

    it('returns 404 for non-existent layout', async () => {
      const resp = await injectAuth(app, 'POST', '/api/layouts/999/duplicate', {}, cookie)
      expect(resp.statusCode).toBe(404)
    })

    it('duplicates layout with " (copy)" name', async () => {
      const createResp = await injectAuth(app, 'POST', '/api/layouts', {
        payload: { name: 'Dashboard' },
      }, cookie)
      const layoutId = createResp.json().id

      const resp = await injectAuth(app, 'POST', `/api/layouts/${layoutId}/duplicate`, {}, cookie)
      expect(resp.statusCode).toBe(201)
      const data = resp.json()
      expect(data.name).toBe('Dashboard (copy)')
      expect(data.id).not.toBe(layoutId)
    })

    it('copies layout settings', async () => {
      const createResp = await injectAuth(app, 'POST', '/api/layouts', {
        payload: { name: 'Themed', columns: 8, row_height: 100, theme: { background: '#000' } },
      }, cookie)
      const layoutId = createResp.json().id

      const resp = await injectAuth(app, 'POST', `/api/layouts/${layoutId}/duplicate`, {}, cookie)
      const data = resp.json()
      expect(data.columns).toBe(8)
      expect(data.row_height).toBe(100)
      expect(data.theme).toEqual({ background: '#000' })
    })

    it('new layout is inactive even if source is active', async () => {
      const createResp = await injectAuth(app, 'POST', '/api/layouts', {
        payload: { name: 'Active Layout' },
      }, cookie)
      const layoutId = createResp.json().id
      await injectAuth(app, 'POST', `/api/layouts/${layoutId}/activate`, {}, cookie)

      const resp = await injectAuth(app, 'POST', `/api/layouts/${layoutId}/duplicate`, {}, cookie)
      expect(resp.json().is_active).toBe(false)
    })

    it('copies all widgets with config and positions', async () => {
      const createResp = await injectAuth(app, 'POST', '/api/layouts', {
        payload: { name: 'With Widgets' },
      }, cookie)
      const layoutId = createResp.json().id

      await injectAuth(app, 'POST', `/api/layouts/${layoutId}/widgets`, {
        payload: { widget_type: 'clock', config: { format: '24h' }, position_x: 0, position_y: 0, width: 4, height: 2 },
      }, cookie)
      await injectAuth(app, 'POST', `/api/layouts/${layoutId}/widgets`, {
        payload: { widget_type: 'weather', config: { zip: '90210' }, position_x: 4, position_y: 0, width: 6, height: 3 },
      }, cookie)

      const resp = await injectAuth(app, 'POST', `/api/layouts/${layoutId}/duplicate`, {}, cookie)
      expect(resp.statusCode).toBe(201)
      const data = resp.json()
      expect(data.widgets).toHaveLength(2)

      const clock = data.widgets.find((w: { widget_type: string }) => w.widget_type === 'clock')
      expect(clock.config).toEqual({ format: '24h' })
      expect(clock.position_x).toBe(0)
      expect(clock.position_y).toBe(0)
      expect(clock.width).toBe(4)
      expect(clock.height).toBe(2)
      expect(clock.layout_id).toBe(data.id)
      expect(clock.id).not.toBe(createResp.json().widgets?.[0]?.id)

      const weather = data.widgets.find((w: { widget_type: string }) => w.widget_type === 'weather')
      expect(weather.config).toEqual({ zip: '90210' })
      expect(weather.position_x).toBe(4)
      expect(weather.width).toBe(6)
      expect(weather.height).toBe(3)
      expect(weather.layout_id).toBe(data.id)
    })

    it('duplicates layout with no widgets', async () => {
      const createResp = await injectAuth(app, 'POST', '/api/layouts', {
        payload: { name: 'Empty' },
      }, cookie)
      const layoutId = createResp.json().id

      const resp = await injectAuth(app, 'POST', `/api/layouts/${layoutId}/duplicate`, {}, cookie)
      expect(resp.statusCode).toBe(201)
      expect(resp.json().widgets).toEqual([])
    })
  })
})
