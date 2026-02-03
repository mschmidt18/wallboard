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
})
