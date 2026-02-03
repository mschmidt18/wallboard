import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../app.js'
import { Config } from '../config.js'
import { createTestDb } from '../db/connection.js'
import type Database from 'better-sqlite3'

describe('health routes', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  test('GET /api/health returns ok', async () => {
    const config = Config.forTesting('/tmp/test-health')
    const app = await buildApp({ config, db })

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
    await app.close()
  })
})
