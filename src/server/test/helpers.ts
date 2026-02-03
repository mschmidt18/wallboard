import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { FastifyInstance, InjectOptions } from 'fastify'
import type Database from 'better-sqlite3'
import { buildApp } from '../app.js'
import { Config } from '../config.js'
import { createTestDb } from '../db/connection.js'

export interface TestApp {
  app: FastifyInstance
  config: Config
  db: Database.Database
  tmpDir: string
}

export interface AuthedTestApp extends TestApp {
  cookie: string
}

/**
 * Creates a test Fastify app with an in-memory database and test config.
 */
export async function createTestApp(): Promise<TestApp> {
  const db = createTestDb()
  const tmpDir = mkdtempSync(join(tmpdir(), 'wallboard-test-'))
  const config = Config.forTesting(tmpDir)
  const app = await buildApp({ config, db, skipRefreshLoop: true })
  return { app, config, db, tmpDir }
}

/**
 * Creates a test app with password setup and logged-in session.
 * Returns the app, config, db, tmpDir, and a session cookie string.
 */
export async function createAuthedApp(password = 'admin123'): Promise<AuthedTestApp> {
  const testApp = await createTestApp()
  const { app } = testApp

  // Set up password
  await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: { password },
  })

  // Login and extract session cookie
  const loginResp = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password },
  })

  const setCookie = loginResp.headers['set-cookie']
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
  const match = cookieStr?.match(/session=([^;]+)/)
  const cookie = match ? `session=${match[1]}` : ''

  return { ...testApp, cookie }
}

/**
 * Helper that injects a request with the auth cookie attached.
 */
export function injectAuth(
  app: FastifyInstance,
  method: InjectOptions['method'],
  url: string,
  opts?: Partial<InjectOptions>,
  cookie?: string,
) {
  return app.inject({
    method,
    url,
    ...opts,
    headers: {
      ...opts?.headers,
      cookie: cookie ?? '',
    },
  })
}
