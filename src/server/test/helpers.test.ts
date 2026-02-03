import { describe, test, expect, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { createTestApp, createAuthedApp, injectAuth } from './helpers.js'

describe('test helpers', () => {
  const apps: FastifyInstance[] = []
  const dbs: Database.Database[] = []

  function track<T extends { app: FastifyInstance; db: Database.Database }>(result: T): T {
    apps.push(result.app)
    dbs.push(result.db)
    return result
  }

  afterEach(async () => {
    for (const app of apps) await app.close()
    for (const db of dbs) db.close()
    apps.length = 0
    dbs.length = 0
  })

  test('createTestApp returns working app with health endpoint', async () => {
    const { app, config, db } = track(await createTestApp())
    expect(app).toBeDefined()
    expect(config).toBeDefined()
    expect(db).toBeDefined()

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  test('createAuthedApp returns valid session cookie', async () => {
    const { app, cookie } = track(await createAuthedApp())
    expect(cookie).toMatch(/^session=/)

    // Cookie should grant access to protected endpoints
    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
  })

  test('createAuthedApp with custom password works', async () => {
    const { app, cookie } = track(await createAuthedApp('mypassword'))
    expect(cookie).toMatch(/^session=/)

    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
  })

  test('injectAuth attaches cookie to requests', async () => {
    const { app, cookie } = track(await createAuthedApp())

    const response = await injectAuth(app, 'GET', '/api/settings', undefined, cookie)
    expect(response.statusCode).toBe(200)
  })

  test('injectAuth with payload sends body', async () => {
    const { app, cookie } = track(await createAuthedApp())

    const response = await injectAuth(
      app,
      'PUT',
      '/api/settings',
      { payload: { display_refresh_interval: 120 } },
      cookie,
    )
    expect(response.statusCode).toBe(200)

    // Verify the setting was updated
    const getResp = await injectAuth(app, 'GET', '/api/settings', undefined, cookie)
    expect(getResp.json().display_refresh_interval).toBe(120)
  })
})
