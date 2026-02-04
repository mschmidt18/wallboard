import type Database from 'better-sqlite3'
import { getIntegrationByProvider, upsertIntegration } from '@server/db/queries/integrations.js'
import { decrypt, encrypt } from '@server/services/encryption.js'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
]

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
}

/**
 * Build a Google OAuth authorization URL.
 */
export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${errorBody}`)
  }

  return response.json() as Promise<TokenResponse>
}

/**
 * Refresh an access token using a refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorBody}`)
  }

  return response.json() as Promise<TokenResponse>
}

/**
 * Get a valid Google access token, refreshing if expired.
 * Returns the access token string, or null if no integration exists
 * or the token cannot be refreshed.
 */
export async function getValidAccessToken(
  db: Database.Database,
  encryptionKey: Buffer,
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  const integration = getIntegrationByProvider(db, 'google')
  if (!integration || integration.status !== 'connected') {
    return null
  }

  let tokens: Record<string, unknown>
  try {
    tokens = JSON.parse(decrypt(integration.credentials, encryptionKey))
  } catch {
    return null
  }

  const accessToken = tokens.access_token as string | undefined
  const expiresAt = tokens.expires_at as number | undefined

  // Check if token is expired (or missing expiry = treat as expired)
  const isExpired = expiresAt == null || Date.now() / 1000 >= expiresAt

  if (!isExpired) {
    return accessToken ?? null
  }

  // Token is expired, try to refresh
  const refreshToken = tokens.refresh_token as string | undefined
  if (!refreshToken) {
    return null
  }

  let newTokens: TokenResponse
  try {
    newTokens = await refreshAccessToken(refreshToken, clientId, clientSecret)
  } catch {
    return null
  }

  // Update stored tokens
  tokens.access_token = newTokens.access_token
  if (newTokens.refresh_token) {
    tokens.refresh_token = newTokens.refresh_token
  }
  tokens.expires_at = Date.now() / 1000 + (newTokens.expires_in ?? 3600)

  const encryptedCredentials = encrypt(JSON.stringify(tokens), encryptionKey)
  upsertIntegration(db, 'google', encryptedCredentials, 'connected')

  return newTokens.access_token
}
