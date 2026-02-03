import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import { createTestDb } from '../db/connection.js'
import { Config } from '../config.js'
import { setDb } from '../db/connection.js'
import { requireAuth, addSession, clearSessions } from './auth.js'
import type Database from 'better-sqlite3'

describe('auth middleware', () => {
  let app: FastifyInstance
  let db: Database.Database

  beforeEach(async () => {
    db = createTestDb()
    const config = Config.forTesting('/tmp/test-auth-middleware')

    app = Fastify({ logger: false })
    app.decorate('config', config)
    app.decorate('db', db)
    setDb(db)

    await app.register(cookie)

    // Register a protected test route
    app.get('/api/protected', { preHandler: requireAuth }, async () => {
      return { secret: 'data' }
    })
  })

  afterEach(async () => {
    clearSessions()
    await app.close()
    db.close()
  })

  test('valid session passes', async () => {
    const token = 'valid-test-token'
    addSession(token)

    const response = await app.inject({
      method: 'GET',
      url: '/api/protected',
      cookies: { session: token },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ secret: 'data' })
  })

  test('missing cookie returns 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/protected',
    })

    expect(response.statusCode).toBe(401)
  })

  test('expired session returns 401', async () => {
    const token = 'expired-test-token'
    // Add session with a TTL that's already in the past
    addSession(token, -1)

    const response = await app.inject({
      method: 'GET',
      url: '/api/protected',
      cookies: { session: token },
    })

    expect(response.statusCode).toBe(401)
  })

  test('invalid token returns 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/protected',
      cookies: { session: 'nonexistent-token' },
    })

    expect(response.statusCode).toBe(401)
  })

  test('expired session is cleaned up on access', async () => {
    const token = 'cleanup-test-token'
    addSession(token, -1)

    // First access - should return 401 and clean up
    await app.inject({
      method: 'GET',
      url: '/api/protected',
      cookies: { session: token },
    })

    // Second access with same token - should also return 401
    // (session was removed, not just expired)
    const response = await app.inject({
      method: 'GET',
      url: '/api/protected',
      cookies: { session: token },
    })

    expect(response.statusCode).toBe(401)
  })
})
