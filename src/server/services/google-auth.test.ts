import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as crypto from 'node:crypto'
import { createTestDb } from '@server/db/connection.js'
import { upsertIntegration } from '@server/db/queries/integrations.js'
import { encrypt } from '@server/services/encryption.js'
import {
  buildAuthUrl,
  exchangeCode,
  getValidAccessToken,
} from '@server/services/google-auth.js'
import type Database from 'better-sqlite3'

describe('google-auth', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('buildAuthUrl', () => {
    it('includes correct scopes and params', () => {
      const url = buildAuthUrl(
        'test-client-id',
        'http://localhost:8000/api/integrations/google/callback',
      )

      expect(url).toContain('test-client-id')
      expect(url).toContain('calendar.readonly')
      expect(url).toContain('photospicker.mediaitems.readonly')
      expect(url).toContain('redirect_uri=')
      expect(url).toContain('access_type=offline')
      expect(url).toContain('prompt=consent')
      expect(url).toContain('response_type=code')
      expect(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true)
    })
  })

  describe('exchangeCode', () => {
    it('sends correct params and returns tokens', async () => {
      const mockTokens = {
        access_token: 'access123',
        refresh_token: 'refresh456',
        expires_in: 3600,
        token_type: 'Bearer',
      }

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockTokens), { status: 200 }),
      )

      const tokens = await exchangeCode(
        'auth-code',
        'test-id',
        'test-secret',
        'http://localhost:8000/api/integrations/google/callback',
      )

      expect(tokens.access_token).toBe('access123')
      expect(tokens.refresh_token).toBe('refresh456')

      // Verify fetch was called with correct URL and body
      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://oauth2.googleapis.com/token')
      expect(opts.method).toBe('POST')
      const body = opts.body as URLSearchParams
      expect(body.get('code')).toBe('auth-code')
      expect(body.get('grant_type')).toBe('authorization_code')
    })

    it('throws on non-200 response', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Bad Request', { status: 400, statusText: 'Bad Request' }),
      )

      await expect(
        exchangeCode('bad-code', 'id', 'secret', 'http://localhost/callback'),
      ).rejects.toThrow('Token exchange failed')
    })
  })

  describe('getValidAccessToken', () => {
    let db: Database.Database
    let key: Buffer

    beforeEach(() => {
      db = createTestDb()
      key = crypto.randomBytes(32)
    })

    afterEach(() => {
      db.close()
    })

    it('returns null when no integration exists', async () => {
      const token = await getValidAccessToken(db, key, 'id', 'secret')
      expect(token).toBeNull()
    })

    it('returns cached token if not expired', async () => {
      const tokens = {
        access_token: 'valid-token',
        refresh_token: 'refresh-token',
        expires_at: Date.now() / 1000 + 3600, // 1 hour from now
      }
      const encrypted = encrypt(JSON.stringify(tokens), key)
      upsertIntegration(db, 'google', encrypted, 'connected')

      const token = await getValidAccessToken(db, key, 'id', 'secret')
      expect(token).toBe('valid-token')

      // No fetch calls should have been made
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('refreshes expired token', async () => {
      const tokens = {
        access_token: 'expired-token',
        refresh_token: 'refresh-token',
        expires_at: Date.now() / 1000 - 100, // expired
      }
      const encrypted = encrypt(JSON.stringify(tokens), key)
      upsertIntegration(db, 'google', encrypted, 'connected')

      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'new-access-token',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
          { status: 200 },
        ),
      )

      const token = await getValidAccessToken(db, key, 'client-id', 'client-secret')
      expect(token).toBe('new-access-token')

      // Verify the token was saved to the database
      const { getIntegrationByProvider } = await import(
        '@server/db/queries/integrations.js'
      )
      const integration = getIntegrationByProvider(db, 'google')!
      const { decrypt: dec } = await import('@server/services/encryption.js')
      const saved = JSON.parse(dec(integration.credentials, key))
      expect(saved.access_token).toBe('new-access-token')
      expect(saved.refresh_token).toBe('refresh-token') // preserved
    })

    it('returns null when refresh fails', async () => {
      const tokens = {
        access_token: 'expired-token',
        refresh_token: 'refresh-token',
        expires_at: Date.now() / 1000 - 100, // expired
      }
      const encrypted = encrypt(JSON.stringify(tokens), key)
      upsertIntegration(db, 'google', encrypted, 'connected')

      mockFetch.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
      )

      const token = await getValidAccessToken(db, key, 'id', 'secret')
      expect(token).toBeNull()
    })

    it('returns null when no refresh token available', async () => {
      const tokens = {
        access_token: 'expired-token',
        expires_at: Date.now() / 1000 - 100, // expired, no refresh_token
      }
      const encrypted = encrypt(JSON.stringify(tokens), key)
      upsertIntegration(db, 'google', encrypted, 'connected')

      const token = await getValidAccessToken(db, key, 'id', 'secret')
      expect(token).toBeNull()
    })
  })
})
