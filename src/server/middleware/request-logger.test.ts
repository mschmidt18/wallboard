import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import { Writable } from 'node:stream'
import { createTestDb } from '../db/connection.js'
import { Config } from '../config.js'
import { setDb } from '../db/connection.js'
import { requestLogger } from './request-logger.js'
import { healthRoutes } from '../routes/health.js'
import type Database from 'better-sqlite3'

interface LogLine {
  method?: string
  path?: string
  status?: number
  duration_ms?: number
  event?: string
  [key: string]: unknown
}

function createAppWithLogCapture(): { app: FastifyInstance; logs: LogLine[]; db: Database.Database } {
  const logs: LogLine[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      try {
        const line = JSON.parse(chunk.toString())
        logs.push(line)
      } catch {
        // ignore non-JSON lines
      }
      callback()
    },
  })

  const db = createTestDb()
  const config = Config.forTesting('/tmp/test-request-logger')

  const app = Fastify({
    logger: {
      level: 'info',
      messageKey: 'event',
      stream,
    },
  })

  app.decorate('config', config)
  app.decorate('db', db)
  setDb(db)

  return { app, logs, db }
}

describe('request-logger middleware', () => {
  let app: FastifyInstance
  let logs: LogLine[]
  let db: Database.Database

  beforeEach(async () => {
    const result = createAppWithLogCapture()
    app = result.app
    logs = result.logs
    db = result.db

    await app.register(cookie)
    await app.register(requestLogger)
    await app.register(healthRoutes)
  })

  afterEach(async () => {
    await app.close()
    db.close()
  })

  test('logs normal requests', async () => {
    app.get('/api/test-route', async () => {
      return { ok: true }
    })

    await app.inject({
      method: 'GET',
      url: '/api/test-route',
    })

    const requestLog = logs.find(
      (line) => line.event === 'request' && line.path === '/api/test-route'
    )
    expect(requestLog).toBeDefined()
    expect(requestLog!.method).toBe('GET')
    expect(requestLog!.path).toBe('/api/test-route')
    expect(requestLog!.status).toBe(200)
    expect(typeof requestLog!.duration_ms).toBe('number')
  })

  test('skips /api/display', async () => {
    app.get('/api/display', async () => {
      return { layout: null }
    })

    await app.inject({
      method: 'GET',
      url: '/api/display',
    })

    const requestLog = logs.find(
      (line) => line.event === 'request' && line.path === '/api/display'
    )
    expect(requestLog).toBeUndefined()
  })

  test('skips /api/health', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    const requestLog = logs.find(
      (line) => line.event === 'request' && line.path === '/api/health'
    )
    expect(requestLog).toBeUndefined()
  })
})
