import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Config } from './config.js'
import { createDb } from './db/connection.js'
import { runMigrations } from './db/migrations/runner.js'
import { buildApp } from './app.js'
import type { FastifyInstance } from 'fastify'

describe('Server entrypoint integration', () => {
  let app: FastifyInstance | null = null

  afterEach(async () => {
    if (app) {
      await app.close()
      app = null
    }
  })

  it('starts and responds to health check', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wallboard-entry-test-'))
    const config = Config.forTesting(tmpDir)

    const db = createDb(join(tmpDir, 'test.db'))
    runMigrations(db)

    app = await buildApp({ config, db, skipRefreshLoop: true })

    // Listen on a random port
    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    expect(address).toContain('http://127.0.0.1:')

    // Verify health endpoint responds
    const resp = await app.inject({
      method: 'GET',
      url: '/api/health',
    })
    expect(resp.statusCode).toBe(200)
    expect(resp.json()).toEqual({ status: 'ok' })

    db.close()
  })
})
