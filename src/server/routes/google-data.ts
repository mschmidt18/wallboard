import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth.js'
import { loadOrCreateKey } from '../services/encryption.js'
import { getValidAccessToken } from '../services/google-auth.js'
import { fetchCalendars } from '../services/google-calendar.js'
import {
  createPickerSession,
  getPickerSession,
  getSessionMediaItems,
  deletePickerSession,
} from '../services/google-photos.js'

function loadSettings(config: { dbPath: string }): Record<string, unknown> {
  const path = join(dirname(config.dbPath), 'settings.json')
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8'))
  }
  return {}
}

async function getAccessToken(
  db: import('better-sqlite3').Database,
  config: { dbPath: string; secretKeyPath: string },
): Promise<string> {
  const settings = loadSettings(config)
  const clientId = (settings.google_client_id as string) || ''
  const clientSecret = (settings.google_client_secret as string) || ''
  const key = loadOrCreateKey(config.secretKeyPath)

  const token = await getValidAccessToken(db, key, clientId, clientSecret)
  if (!token) {
    throw new Error('Google not connected')
  }
  return token
}

export async function googleDataRoutes(app: FastifyInstance): Promise<void> {
  const config = (app as unknown as { config: { dbPath: string; secretKeyPath: string } }).config
  const db = (app as unknown as { db: import('better-sqlite3').Database }).db

  app.get('/api/google/calendars', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    let accessToken: string
    try {
      accessToken = await getAccessToken(db, config)
    } catch {
      reply.code(400).send({ error: 'Google not connected' })
      return
    }
    return fetchCalendars(accessToken)
  })

  app.post('/api/google/photos/picker-session', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    let accessToken: string
    try {
      accessToken = await getAccessToken(db, config)
    } catch {
      reply.code(400).send({ error: 'Google not connected' })
      return
    }
    const sessionData = await createPickerSession(accessToken)
    return {
      session_id: sessionData.id,
      picker_uri: sessionData.pickerUri,
      polling_config: sessionData.pollingConfig ?? {},
    }
  })

  app.get<{ Params: { id: string } }>('/api/google/photos/picker-session/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    let accessToken: string
    try {
      accessToken = await getAccessToken(db, config)
    } catch {
      reply.code(400).send({ error: 'Google not connected' })
      return
    }
    const sessionData = await getPickerSession(accessToken, request.params.id)
    const mediaItemsSet = sessionData.mediaItemsSet
    const result: Record<string, unknown> = { media_items_set: mediaItemsSet }
    if (mediaItemsSet) {
      const items = await getSessionMediaItems(accessToken, request.params.id)
      result.photos = items.map((item) => ({
        id: item.id,
        url: `/api/photos/proxy?url=${encodeURIComponent(item.baseUrl)}`,
        mimeType: item.mimeType,
      }))
    }
    return result
  })

  app.delete<{ Params: { id: string } }>('/api/google/photos/picker-session/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    let accessToken: string
    try {
      accessToken = await getAccessToken(db, config)
    } catch {
      reply.code(400).send({ error: 'Google not connected' })
      return
    }
    await deletePickerSession(accessToken, request.params.id)
    return { ok: true }
  })
}
