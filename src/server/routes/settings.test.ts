import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { buildApp } from '../app.js'
import { Config } from '../config.js'
import { createTestDb } from '../db/connection.js'

describe('settings routes', () => {
  let db: Database.Database
  let app: FastifyInstance
  let tmpDir: string
  let config: Config

  beforeEach(async () => {
    db = createTestDb()
    tmpDir = mkdtempSync(join(tmpdir(), 'wallboard-test-'))
    config = Config.forTesting(tmpDir)
    app = await buildApp({ config, db })
  })

  afterEach(async () => {
    await app.close()
    db.close()
  })

  // --- Helper to set up password and optionally log in ---
  async function setupPassword(password = 'admin123') {
    return app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { password },
    })
  }

  async function login(password = 'admin123') {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password },
    })
    // Extract session cookie from Set-Cookie header
    const setCookie = response.headers['set-cookie']
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
    const match = cookieStr?.match(/session=([^;]+)/)
    return { response, cookie: match ? `session=${match[1]}` : '' }
  }

  // --- Auth status ---

  test('GET /api/auth/status returns setup_required true when no password set', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/status',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ setup_required: true })
  })

  test('GET /api/auth/status returns setup_required false after setup', async () => {
    await setupPassword()
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/status',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ setup_required: false })
  })

  // --- Auth setup ---

  test('POST /api/auth/setup sets initial password', async () => {
    const response = await setupPassword()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  test('POST /api/auth/setup fails if password already set', async () => {
    await setupPassword()
    const response = await setupPassword('other456')
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toMatch(/already set/i)
  })

  // --- Auth login ---

  test('POST /api/auth/login with correct password succeeds', async () => {
    await setupPassword()
    const { response } = await login()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
    expect(response.headers['set-cookie']).toBeDefined()
    expect(response.headers['set-cookie']).toMatch(/session=/)
  })

  test('POST /api/auth/login with wrong password fails', async () => {
    await setupPassword()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'wrong' },
    })
    expect(response.statusCode).toBe(401)
  })

  test('POST /api/auth/login fails when no password set', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'anything' },
    })
    expect(response.statusCode).toBe(401)
  })

  // --- Auth logout ---

  test('POST /api/auth/logout clears session', async () => {
    await setupPassword()
    const { cookie } = await login()

    // Verify we have access
    const before = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    })
    expect(before.statusCode).toBe(200)

    // Logout
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    })

    // Session should be invalidated
    const after = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    })
    expect(after.statusCode).toBe(401)
  })

  // --- Change password ---

  test('POST /api/auth/change-password requires auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { current_password: 'admin123', new_password: 'new456' },
    })
    expect(response.statusCode).toBe(401)
  })

  test('POST /api/auth/change-password rejects wrong current password', async () => {
    await setupPassword()
    const { cookie } = await login()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { current_password: 'wrong', new_password: 'new456' },
      headers: { cookie },
    })
    expect(response.statusCode).toBe(401)
  })

  test('POST /api/auth/change-password succeeds and new password works', async () => {
    await setupPassword()
    const { cookie } = await login()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { current_password: 'admin123', new_password: 'new456' },
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)

    // Logout and verify new password works
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    })
    const { response: loginResp } = await login('new456')
    expect(loginResp.statusCode).toBe(200)
  })

  // --- Settings file permissions ---

  test('settings file is written with 0o600 permissions', async () => {
    await setupPassword()
    const settingsPath = join(tmpDir, 'settings.json')
    const mode = statSync(settingsPath).mode & 0o777
    expect(mode).toBe(0o600)
  })

  // --- Protected endpoints ---

  test('GET /api/settings requires auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
    })
    expect(response.statusCode).toBe(401)
  })

  test('PUT /api/settings requires auth', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { google_client_id: 'test' },
    })
    expect(response.statusCode).toBe(401)
  })

  // --- Settings CRUD ---

  test('GET /api/settings returns defaults', async () => {
    await setupPassword()
    const { cookie } = await login()
    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    const data = response.json()
    expect(data.google_client_id).toBe('')
    expect(data.display_refresh_interval).toBe(60)
    expect(data.has_password).toBe(true)
  })

  test('PUT /api/settings updates values', async () => {
    await setupPassword()
    const { cookie } = await login()

    const updateResp = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        google_client_id: 'my-client-id',
        display_refresh_interval: 120,
      },
      headers: { cookie },
    })
    expect(updateResp.statusCode).toBe(200)

    // Verify persisted
    const getResp = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    })
    const data = getResp.json()
    expect(data.google_client_id).toBe('my-client-id')
    expect(data.display_refresh_interval).toBe(120)
  })

  test('PUT /api/settings partial update preserves other values', async () => {
    await setupPassword()
    const { cookie } = await login()

    // First set a value
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { google_client_id: 'my-client-id' },
      headers: { cookie },
    })

    // Then update a different value
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { display_refresh_interval: 120 },
      headers: { cookie },
    })

    // Verify both values
    const getResp = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    })
    const data = getResp.json()
    expect(data.google_client_id).toBe('my-client-id')
    expect(data.display_refresh_interval).toBe(120)
  })

  test('PUT /api/settings with empty google_client_secret preserves existing value', async () => {
    await setupPassword()
    const { cookie } = await login()

    // Set a google_client_secret
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { google_client_secret: 'my-secret-value' },
      headers: { cookie },
    })

    // Update another setting while sending empty google_client_secret
    // (this is what the frontend does since GET doesn't return the secret)
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { log_level: 'debug', google_client_secret: '' },
      headers: { cookie },
    })

    // Verify the secret was preserved by reading the settings file directly
    // (GET /api/settings intentionally doesn't return the secret)
    const settingsPath = join(tmpDir, 'settings.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.google_client_secret).toBe('my-secret-value')
  })

  // --- Log level settings ---

  test('GET /api/settings returns default log_level as INFO', async () => {
    await setupPassword()
    const { cookie } = await login()
    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().log_level).toBe('INFO')
  })

  test('PUT /api/settings with log_level persists and GET returns correct value', async () => {
    await setupPassword()
    const { cookie } = await login()

    // Set log level to debug (frontend sends lowercase pino level)
    const updateResp = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { log_level: 'debug' },
      headers: { cookie },
    })
    expect(updateResp.statusCode).toBe(200)

    // Verify GET returns uppercase frontend format
    const getResp = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    })
    expect(getResp.json().log_level).toBe('DEBUG')
  })

  test('PUT /api/settings with log_level updates runtime logger level', async () => {
    await setupPassword()
    const { cookie } = await login()

    // Initial level should be info (default)
    expect(app.log.level).toBe('info')

    // Set to warn
    const resp = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { log_level: 'warn' },
      headers: { cookie },
    })
    expect(resp.statusCode).toBe(200)

    // Verify runtime logger level changed
    expect(app.log.level).toBe('warn')
  })

  test('GET /api/settings returns log_level as uppercase', async () => {
    await setupPassword()
    const { cookie } = await login()

    // Set to warn
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { log_level: 'warn' },
      headers: { cookie },
    })

    // Verify GET returns uppercase
    const getResp = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    })
    expect(getResp.json().log_level).toBe('WARN')
  })

  // --- Full auth flow ---

  test('full auth flow: setup → login → access → logout → denied', async () => {
    // Setup
    const setupResp = await setupPassword()
    expect(setupResp.statusCode).toBe(200)

    // Login
    const { cookie } = await login()

    // Access protected endpoint
    const settingsResp = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    })
    expect(settingsResp.statusCode).toBe(200)

    // Logout
    const logoutResp = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    })
    expect(logoutResp.statusCode).toBe(200)

    // Denied
    const deniedResp = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    })
    expect(deniedResp.statusCode).toBe(401)
  })

  // --- Refresh endpoint ---

  test('POST /api/refresh requires authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/refresh',
    })
    expect(response.statusCode).toBe(401)
  })

  test('POST /api/refresh returns success with no data sources', async () => {
    await setupPassword()
    const { cookie } = await login()

    const response = await app.inject({
      method: 'POST',
      url: '/api/refresh',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    const data = response.json()
    expect(data.status).toBe('ok')
    expect(data.refreshed).toBe(0)
    expect(data.failed).toBe(0)
  })

  test('POST /api/refresh refreshes data sources and updates cache', async () => {
    await setupPassword()
    const { cookie } = await login()

    // Seed a weather widget
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('Test', 12, 80, 1, '{}', now, now)
    const layout = db.prepare('SELECT id FROM layouts WHERE is_active = 1').get() as { id: number }
    db.prepare(
      `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(layout.id, 'weather', JSON.stringify({ lat: 40.7, lon: -74.0, units: 'imperial' }), 0, 0, 4, 3, now, now)

    // Pre-populate cache with old data
    const futureExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    db.prepare(
      `INSERT INTO cache (source, data, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`
    ).run('weather_40.7_-74', JSON.stringify({ current: { temperature: 60 }, daily: [] }), now, futureExpiry)

    // Mock fetch to return new data
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        current: { temperature_2m: 72, weather_code: 0 },
        daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], weather_code: [] },
      }),
    })

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/refresh',
        headers: { cookie },
      })

      expect(response.statusCode).toBe(200)
      const data = response.json()
      expect(data.status).toBe('ok')
      expect(data.refreshed).toBe(1)
      expect(data.failed).toBe(0)

      // Verify cache was updated with new temperature
      const row = db.prepare("SELECT data FROM cache WHERE source = 'weather_40.7_-74'").get() as { data: string }
      const cached = JSON.parse(row.data)
      expect(cached.current.temperature).toBe(72)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('POST /api/refresh reports partial failures', async () => {
    await setupPassword()
    const { cookie } = await login()

    // Seed a weather widget
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('Test', 12, 80, 1, '{}', now, now)
    const layout = db.prepare('SELECT id FROM layouts WHERE is_active = 1').get() as { id: number }
    db.prepare(
      `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(layout.id, 'weather', JSON.stringify({ lat: 40.7, lon: -74.0, units: 'imperial' }), 0, 0, 4, 3, now, now)

    // Mock fetch to fail
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/refresh',
        headers: { cookie },
      })

      expect(response.statusCode).toBe(200)
      const data = response.json()
      expect(data.status).toBe('ok')
      expect(data.refreshed).toBe(0)
      expect(data.failed).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
