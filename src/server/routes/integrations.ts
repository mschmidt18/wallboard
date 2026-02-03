import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth.js'
import { listIntegrations } from '../db/queries/integrations.js'
import { upsertIntegration, deleteIntegrationByProvider } from '../db/queries/integrations.js'
import { buildAuthUrl, exchangeCode } from '../services/google-auth.js'
import { loadOrCreateKey, encrypt } from '../services/encryption.js'

function loadSettings(config: { dbPath: string }): Record<string, unknown> {
  const path = join(dirname(config.dbPath), 'settings.json')
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8'))
  }
  return {}
}

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  const config = (app as unknown as { config: { dbPath: string; secretKeyPath: string } }).config
  const db = (app as unknown as { db: import('better-sqlite3').Database }).db

  app.get('/api/integrations', {
    preHandler: [requireAuth],
  }, async () => {
    return listIntegrations(db)
  })

  app.post('/api/integrations/google/connect', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const settings = loadSettings(config)
    const clientId = settings.google_client_id as string | undefined
    if (!clientId) {
      reply.code(400).send({ error: 'Google client ID not configured' })
      return
    }
    const protocol = (request.headers['x-forwarded-proto'] as string) || request.protocol
    const host = request.headers.host || 'localhost'
    const baseUrl = `${protocol}://${host}`
    const redirectUri = `${baseUrl}/api/integrations/google/callback`
    const url = buildAuthUrl(clientId, redirectUri)
    return { auth_url: url }
  })

  app.get<{ Querystring: { code: string } }>('/api/integrations/google/callback', async (request, reply) => {
    const { code } = request.query
    if (!code) {
      reply.code(400).send({ error: 'Missing code parameter' })
      return
    }

    const settings = loadSettings(config)
    const clientId = (settings.google_client_id as string) || ''
    const clientSecret = (settings.google_client_secret as string) || ''
    const protocol = (request.headers['x-forwarded-proto'] as string) || request.protocol
    const host = request.headers.host || 'localhost'
    const baseUrl = `${protocol}://${host}`
    const redirectUri = `${baseUrl}/api/integrations/google/callback`

    const tokens = await exchangeCode(code, clientId, clientSecret, redirectUri)

    // Store expires_at as absolute timestamp for refresh logic
    const tokenData: Record<string, unknown> = { ...tokens }
    if (tokens.expires_in && !tokenData.expires_at) {
      tokenData.expires_at = Date.now() / 1000 + tokens.expires_in
    }

    const key = loadOrCreateKey(config.secretKeyPath)
    const encrypted = encrypt(JSON.stringify(tokenData), key)
    upsertIntegration(db, 'google', encrypted, 'connected')

    request.log.info('Integration connected: google')
    reply.redirect('/admin/integrations?connected=true')
  })

  app.delete('/api/integrations/google', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const deleted = deleteIntegrationByProvider(db, 'google')
    if (!deleted) {
      reply.code(404).send({ error: 'Google integration not found' })
      return
    }
    request.log.info('Integration disconnected: google')
    reply.code(204).send()
  })
}
