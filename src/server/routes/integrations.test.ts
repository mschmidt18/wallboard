import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAuthedApp, injectAuth } from '../test/helpers.js'
import type { AuthedTestApp } from '../test/helpers.js'
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

let testApp: AuthedTestApp

beforeEach(async () => {
  testApp = await createAuthedApp()
  // Set up Google client ID/secret in settings
  const settingsPath = join(dirname(testApp.config.dbPath), 'settings.json')
  const settings = JSON.parse(
    readFileSync(settingsPath, 'utf-8')
  )
  settings.google_client_id = 'test-client-id'
  settings.google_client_secret = 'test-client-secret'
  writeFileSync(settingsPath, JSON.stringify(settings))
})

afterEach(async () => {
  await testApp.app.close()
})

describe('integration routes', () => {
  it('lists integrations (empty)', async () => {
    const resp = await injectAuth(testApp.app, 'GET', '/api/integrations', undefined, testApp.cookie)
    expect(resp.statusCode).toBe(200)
    expect(resp.json()).toEqual([])
  })

  it('connect google returns auth url', async () => {
    const resp = await injectAuth(testApp.app, 'POST', '/api/integrations/google/connect', undefined, testApp.cookie)
    expect(resp.statusCode).toBe(200)
    const body = resp.json()
    expect(body.auth_url).toContain('accounts.google.com')
    expect(body.auth_url).toContain('test-client-id')
    expect(body.auth_url).toContain('calendar.readonly')
    expect(body.auth_url).toContain('photospicker.mediaitems.readonly')
  })

  it('connect google fails without client id configured', async () => {
    // Clear google_client_id from settings
    const settingsPath = join(dirname(testApp.config.dbPath), 'settings.json')
    const settings = JSON.parse(
      readFileSync(settingsPath, 'utf-8')
    )
    settings.google_client_id = ''
    writeFileSync(settingsPath, JSON.stringify(settings))

    const resp = await injectAuth(testApp.app, 'POST', '/api/integrations/google/connect', undefined, testApp.cookie)
    expect(resp.statusCode).toBe(400)
    expect(resp.json().error).toContain('Google client ID not configured')
  })

  it('google callback exchanges code and creates integration', async () => {
    const mockTokens = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockTokens), { status: 200 })
    )

    const resp = await testApp.app.inject({
      method: 'GET',
      url: '/api/integrations/google/callback?code=test-auth-code',
    })

    expect(resp.statusCode).toBe(302)
    expect(resp.headers.location).toBe('/admin/integrations?connected=true')

    // Verify integration was stored
    const listResp = await injectAuth(testApp.app, 'GET', '/api/integrations', undefined, testApp.cookie)
    const integrations = listResp.json()
    expect(integrations).toHaveLength(1)
    expect(integrations[0].provider).toBe('google')
    expect(integrations[0].status).toBe('connected')

    fetchSpy.mockRestore()
  })

  it('delete google integration', async () => {
    // First create an integration via callback
    const mockTokens = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockTokens), { status: 200 })
    )

    await testApp.app.inject({
      method: 'GET',
      url: '/api/integrations/google/callback?code=test-auth-code',
    })

    fetchSpy.mockRestore()

    // Now delete it
    const deleteResp = await injectAuth(testApp.app, 'DELETE', '/api/integrations/google', undefined, testApp.cookie)
    expect(deleteResp.statusCode).toBe(204)

    // Verify it's gone
    const listResp = await injectAuth(testApp.app, 'GET', '/api/integrations', undefined, testApp.cookie)
    expect(listResp.json()).toEqual([])
  })

  it('delete nonexistent google integration returns 404', async () => {
    const resp = await injectAuth(testApp.app, 'DELETE', '/api/integrations/google', undefined, testApp.cookie)
    expect(resp.statusCode).toBe(404)
  })

  it('requires auth for protected endpoints', async () => {
    const listResp = await testApp.app.inject({ method: 'GET', url: '/api/integrations' })
    expect(listResp.statusCode).toBe(401)

    const connectResp = await testApp.app.inject({ method: 'POST', url: '/api/integrations/google/connect' })
    expect(connectResp.statusCode).toBe(401)

    const deleteResp = await testApp.app.inject({ method: 'DELETE', url: '/api/integrations/google' })
    expect(deleteResp.statusCode).toBe(401)
  })

  it('should return 400 for callback without code parameter', async () => {
    const resp = await testApp.app.inject({
      method: 'GET',
      url: '/api/integrations/google/callback',
    })
    expect(resp.statusCode).toBe(400)
    expect(resp.json().error).toBe('Missing code parameter')
  })
})
