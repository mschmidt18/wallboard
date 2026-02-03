import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createAuthedApp, injectAuth, createTestApp } from '../test/helpers.js'

describe('ICS calendar routes', () => {
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

  it('should create an ICS calendar', async () => {
    const resp = await injectAuth(app, 'POST', '/api/ics-calendars', {
      payload: { name: 'Work Calendar', url: 'https://example.com/cal.ics', color: '#ff5733' },
    }, cookie)
    expect(resp.statusCode).toBe(201)
    const data = resp.json()
    expect(data.name).toBe('Work Calendar')
    expect(data.url).toBe('https://example.com/cal.ics')
    expect(data.color).toBe('#ff5733')
    expect(data.id).toBeDefined()
    expect(data.created_at).toBeDefined()
    expect(data.updated_at).toBeDefined()
  })

  it('should create with default color', async () => {
    const resp = await injectAuth(app, 'POST', '/api/ics-calendars', {
      payload: { name: 'My Calendar', url: 'https://example.com/cal.ics' },
    }, cookie)
    expect(resp.statusCode).toBe(201)
    expect(resp.json().color).toBe('#6366f1')
  })

  it('should list ICS calendars', async () => {
    await injectAuth(app, 'POST', '/api/ics-calendars', {
      payload: { name: 'Calendar A', url: 'https://example.com/a.ics' },
    }, cookie)
    await injectAuth(app, 'POST', '/api/ics-calendars', {
      payload: { name: 'Calendar B', url: 'https://example.com/b.ics', color: '#00ff00' },
    }, cookie)

    const resp = await injectAuth(app, 'GET', '/api/ics-calendars', {}, cookie)
    expect(resp.statusCode).toBe(200)
    const data = resp.json()
    expect(data).toHaveLength(2)
    const names = new Set(data.map((c: { name: string }) => c.name))
    expect(names).toEqual(new Set(['Calendar A', 'Calendar B']))
  })

  it('should update an ICS calendar', async () => {
    const createResp = await injectAuth(app, 'POST', '/api/ics-calendars', {
      payload: { name: 'Old Name', url: 'https://example.com/old.ics' },
    }, cookie)
    const calId = createResp.json().id

    const resp = await injectAuth(app, 'PUT', `/api/ics-calendars/${calId}`, {
      payload: { name: 'New Name' },
    }, cookie)
    expect(resp.statusCode).toBe(200)
    const data = resp.json()
    expect(data.name).toBe('New Name')
    expect(data.url).toBe('https://example.com/old.ics') // unchanged
  })

  it('should return 404 when updating nonexistent calendar', async () => {
    const resp = await injectAuth(app, 'PUT', '/api/ics-calendars/9999', {
      payload: { name: 'Nope' },
    }, cookie)
    expect(resp.statusCode).toBe(404)
  })

  it('should delete an ICS calendar', async () => {
    const createResp = await injectAuth(app, 'POST', '/api/ics-calendars', {
      payload: { name: 'To Delete', url: 'https://example.com/del.ics' },
    }, cookie)
    const calId = createResp.json().id

    const resp = await injectAuth(app, 'DELETE', `/api/ics-calendars/${calId}`, {}, cookie)
    expect(resp.statusCode).toBe(204)

    // Verify it's gone
    const listResp = await injectAuth(app, 'GET', '/api/ics-calendars', {}, cookie)
    expect(listResp.json()).toHaveLength(0)
  })

  it('should return 404 when deleting nonexistent calendar', async () => {
    const resp = await injectAuth(app, 'DELETE', '/api/ics-calendars/9999', {}, cookie)
    expect(resp.statusCode).toBe(404)
  })

  it('should reject invalid color format', async () => {
    const resp = await injectAuth(app, 'POST', '/api/ics-calendars', {
      payload: { name: 'Bad Color', url: 'https://example.com/cal.ics', color: 'red' },
    }, cookie)
    expect(resp.statusCode).toBe(400)
  })

  it('should reject missing name', async () => {
    const resp = await injectAuth(app, 'POST', '/api/ics-calendars', {
      payload: { url: 'https://example.com/cal.ics' },
    }, cookie)
    expect(resp.statusCode).toBe(400)
  })

  it('should require auth for all endpoints', async () => {
    const { app: unauthedApp } = await createTestApp()

    const getResp = await unauthedApp.inject({ method: 'GET', url: '/api/ics-calendars' })
    expect(getResp.statusCode).toBe(401)

    const postResp = await unauthedApp.inject({
      method: 'POST', url: '/api/ics-calendars',
      payload: { name: 'X', url: 'http://x' },
    })
    expect(postResp.statusCode).toBe(401)

    const putResp = await unauthedApp.inject({
      method: 'PUT', url: '/api/ics-calendars/1',
      payload: { name: 'X' },
    })
    expect(putResp.statusCode).toBe(401)

    const deleteResp = await unauthedApp.inject({ method: 'DELETE', url: '/api/ics-calendars/1' })
    expect(deleteResp.statusCode).toBe(401)

    await unauthedApp.close()
  })
})
