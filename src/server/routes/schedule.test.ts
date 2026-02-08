import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { createAuthedApp, createTestApp, injectAuth } from '../test/helpers.js'

describe('schedule routes', () => {
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

  function createLayout(name = 'Test Layout'): number {
    const now = new Date().toISOString()
    const result = db.prepare(
      'INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at) VALUES (?, 12, 80, 0, ?, ?, ?)'
    ).run(name, '{}', now, now)
    return Number(result.lastInsertRowid)
  }

  // Auth
  it('should require auth for all endpoints', async () => {
    const { app: unauthedApp } = await createTestApp()

    const getResp = await unauthedApp.inject({ method: 'GET', url: '/api/schedule' })
    expect(getResp.statusCode).toBe(401)

    const postResp = await unauthedApp.inject({
      method: 'POST', url: '/api/schedule',
      payload: { layout_id: null, days_of_week: [1], start_time: '09:00', end_time: '17:00' },
    })
    expect(postResp.statusCode).toBe(401)

    const putResp = await unauthedApp.inject({
      method: 'PUT', url: '/api/schedule/1',
      payload: { start_time: '10:00' },
    })
    expect(putResp.statusCode).toBe(401)

    const deleteResp = await unauthedApp.inject({ method: 'DELETE', url: '/api/schedule/1' })
    expect(deleteResp.statusCode).toBe(401)

    const reorderResp = await unauthedApp.inject({
      method: 'PUT', url: '/api/schedule/reorder',
      payload: [{ id: 1, sort_order: 0 }],
    })
    expect(reorderResp.statusCode).toBe(401)

    await unauthedApp.close()
  })

  // CRUD happy paths
  it('POST creates rule and returns 201', async () => {
    const layoutId = createLayout()
    const resp = await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: layoutId, days_of_week: [1, 2, 3], start_time: '09:00', end_time: '17:00' },
    }, cookie)

    expect(resp.statusCode).toBe(201)
    const data = resp.json()
    expect(data.layout_id).toBe(layoutId)
    expect(data.days_of_week).toEqual([1, 2, 3])
    expect(data.start_time).toBe('09:00')
    expect(data.end_time).toBe('17:00')
    expect(data.enabled).toBe(true)
    expect(data.id).toBeDefined()
  })

  it('GET lists rules ordered by sort_order', async () => {
    const layoutId = createLayout()
    await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: layoutId, days_of_week: [1], start_time: '09:00', end_time: '12:00' },
    }, cookie)
    await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: layoutId, days_of_week: [2], start_time: '13:00', end_time: '17:00' },
    }, cookie)

    const resp = await injectAuth(app, 'GET', '/api/schedule', {}, cookie)
    expect(resp.statusCode).toBe(200)
    const data = resp.json()
    expect(data).toHaveLength(2)
    expect(data[0].sort_order).toBeLessThan(data[1].sort_order)
  })

  it('PUT updates rule fields', async () => {
    const layoutId = createLayout()
    const createResp = await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: layoutId, days_of_week: [1], start_time: '09:00', end_time: '17:00' },
    }, cookie)
    const ruleId = createResp.json().id

    const resp = await injectAuth(app, 'PUT', `/api/schedule/${ruleId}`, {
      payload: { start_time: '10:00', enabled: false },
    }, cookie)
    expect(resp.statusCode).toBe(200)
    const data = resp.json()
    expect(data.start_time).toBe('10:00')
    expect(data.enabled).toBe(false)
    expect(data.end_time).toBe('17:00') // unchanged
  })

  it('DELETE returns 204', async () => {
    const layoutId = createLayout()
    const createResp = await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: layoutId, days_of_week: [1], start_time: '09:00', end_time: '17:00' },
    }, cookie)
    const ruleId = createResp.json().id

    const resp = await injectAuth(app, 'DELETE', `/api/schedule/${ruleId}`, {}, cookie)
    expect(resp.statusCode).toBe(204)

    // Verify it's gone
    const listResp = await injectAuth(app, 'GET', '/api/schedule', {}, cookie)
    expect(listResp.json()).toHaveLength(0)
  })

  it('PUT reorder updates ordering and returns reordered list', async () => {
    const layoutId = createLayout()
    const r1 = (await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: layoutId, days_of_week: [1], start_time: '09:00', end_time: '12:00' },
    }, cookie)).json()
    const r2 = (await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: layoutId, days_of_week: [2], start_time: '13:00', end_time: '17:00' },
    }, cookie)).json()

    const resp = await injectAuth(app, 'PUT', '/api/schedule/reorder', {
      payload: [
        { id: r2.id, sort_order: 0 },
        { id: r1.id, sort_order: 1 },
      ],
    }, cookie)
    expect(resp.statusCode).toBe(200)
    const data = resp.json()
    expect(data[0].id).toBe(r2.id)
    expect(data[1].id).toBe(r1.id)
  })

  // Validation
  it('POST with invalid time format returns 400', async () => {
    const resp = await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: null, days_of_week: [1], start_time: '25:00', end_time: '17:00' },
    }, cookie)
    expect(resp.statusCode).toBe(400)
  })

  it('POST with "9:00" (missing leading zero) returns 400', async () => {
    const resp = await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: null, days_of_week: [1], start_time: '9:00', end_time: '17:00' },
    }, cookie)
    expect(resp.statusCode).toBe(400)
  })

  it('POST with empty days_of_week returns 400', async () => {
    const resp = await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: null, days_of_week: [], start_time: '09:00', end_time: '17:00' },
    }, cookie)
    expect(resp.statusCode).toBe(400)
  })

  it('POST with out-of-range day returns 400', async () => {
    const resp = await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: null, days_of_week: [0], start_time: '09:00', end_time: '17:00' },
    }, cookie)
    expect(resp.statusCode).toBe(400)

    const resp2 = await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: null, days_of_week: [8], start_time: '09:00', end_time: '17:00' },
    }, cookie)
    expect(resp2.statusCode).toBe(400)
  })

  it('POST with nonexistent layout_id returns 400', async () => {
    const resp = await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: 9999, days_of_week: [1], start_time: '09:00', end_time: '17:00' },
    }, cookie)
    expect(resp.statusCode).toBe(400)
  })

  it('POST with layout_id: null succeeds (display off)', async () => {
    const resp = await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: null, days_of_week: [1, 2, 3, 4, 5], start_time: '22:00', end_time: '06:00' },
    }, cookie)
    expect(resp.statusCode).toBe(201)
    expect(resp.json().layout_id).toBeNull()
  })

  it('PUT to nonexistent ID returns 404', async () => {
    const resp = await injectAuth(app, 'PUT', '/api/schedule/9999', {
      payload: { start_time: '10:00' },
    }, cookie)
    expect(resp.statusCode).toBe(404)
  })

  it('DELETE nonexistent ID returns 404', async () => {
    const resp = await injectAuth(app, 'DELETE', '/api/schedule/9999', {}, cookie)
    expect(resp.statusCode).toBe(404)
  })

  // Integration
  it('deleting a layout cascade-deletes associated rule', async () => {
    const layoutId = createLayout()
    await injectAuth(app, 'POST', '/api/schedule', {
      payload: { layout_id: layoutId, days_of_week: [1], start_time: '09:00', end_time: '17:00' },
    }, cookie)

    const beforeDelete = await injectAuth(app, 'GET', '/api/schedule', {}, cookie)
    expect(beforeDelete.json()).toHaveLength(1)

    db.prepare('DELETE FROM layouts WHERE id = ?').run(layoutId)

    const afterDelete = await injectAuth(app, 'GET', '/api/schedule', {}, cookie)
    expect(afterDelete.json()).toHaveLength(0)
  })
})
