import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Fastify from 'fastify'
import { spaRoutes } from './spa.js'

describe('SPA middleware', () => {
  let distPath: string
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'spa-test-'))
    distPath = join(tmpDir, 'dist', 'frontend')
    mkdirSync(distPath, { recursive: true })
    mkdirSync(join(distPath, 'assets'), { recursive: true })

    // Create a minimal index.html
    writeFileSync(join(distPath, 'index.html'), '<html><body>SPA App</body></html>')

    // Create a static asset
    writeFileSync(join(distPath, 'assets', 'main.js'), 'console.log("app")')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('serves index.html for SPA routes', async () => {
    const app = Fastify()
    await app.register(spaRoutes, { distPath })

    const response = await app.inject({ method: 'GET', url: '/admin/layouts' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('SPA App')
    expect(response.headers['content-type']).toContain('text/html')

    // Root path also serves index.html
    const rootResp = await app.inject({ method: 'GET', url: '/' })
    expect(rootResp.statusCode).toBe(200)
    expect(rootResp.body).toContain('SPA App')
  })

  it('serves static assets', async () => {
    const app = Fastify()
    await app.register(spaRoutes, { distPath })

    const response = await app.inject({ method: 'GET', url: '/assets/main.js' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toBe('console.log("app")')
  })

  it('path traversal attempt returns index.html', async () => {
    // Create a file outside dist that should NOT be served
    writeFileSync(join(tmpDir, 'secret.txt'), 'TOP SECRET')

    const app = Fastify()
    await app.register(spaRoutes, { distPath })

    // Encoded path traversal attempts
    const resp1 = await app.inject({ method: 'GET', url: '/..%2F..%2Fsecret.txt' })
    expect(resp1.statusCode).toBe(200)
    expect(resp1.body).toContain('SPA App')
    expect(resp1.body).not.toContain('TOP SECRET')

    // Double dot traversal
    const resp2 = await app.inject({ method: 'GET', url: '/%2e%2e/%2e%2e/secret.txt' })
    expect(resp2.statusCode).toBe(200)
    expect(resp2.body).toContain('SPA App')
    expect(resp2.body).not.toContain('TOP SECRET')

    // Regular .. traversal
    const resp3 = await app.inject({ method: 'GET', url: '/../../secret.txt' })
    expect(resp3.statusCode).toBe(200)
    expect(resp3.body).toContain('SPA App')
    expect(resp3.body).not.toContain('TOP SECRET')
  })

  it('returns 404 JSON for API routes hitting notFoundHandler', async () => {
    const app = Fastify()
    await app.register(spaRoutes, { distPath })

    const response = await app.inject({ method: 'GET', url: '/api/nonexistent' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'Not found' })
  })

  it('serves an existing file within dist directly', async () => {
    // Create a file at the dist root (not in assets/)
    writeFileSync(join(distPath, 'favicon.ico'), 'ICON_DATA')

    const app = Fastify()
    await app.register(spaRoutes, { distPath })

    const response = await app.inject({ method: 'GET', url: '/favicon.ico' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toBe('ICON_DATA')
  })

  it('is a no-op when dist directory does not exist', async () => {
    const nonExistentDist = join(tmpDir, 'does-not-exist', 'frontend')

    const app = Fastify()
    await app.register(spaRoutes, { distPath: nonExistentDist })

    // Without the SPA plugin registering a notFoundHandler, Fastify returns its default 404
    const response = await app.inject({ method: 'GET', url: '/some-page' })
    expect(response.statusCode).toBe(404)
    // Should NOT contain SPA content since plugin was a no-op
    expect(response.body).not.toContain('SPA App')
  })
})
