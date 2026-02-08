import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { hashPassword, verifyPassword, createSessionToken } from '../auth.js'
import { addSession, removeSession, requireAuth } from '../middleware/auth.js'
import { forceRefreshAll, getRefreshProgress } from '../services/refresh.js'
import { loadSettings, saveSettings } from '../services/settings-store.js'
import type { Config } from '../config.js'
import {
  PasswordBodySchema,
  ChangePasswordBodySchema,
  SettingsUpdateSchema,
} from '@shared/types.js'
import type { PasswordBody, ChangePasswordBody, SettingsUpdate } from '@shared/types.js'

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const config = (app as unknown as { config: Config }).config
  const db = (app as unknown as { db: Database.Database }).db

  // --- Auth endpoints ---

  app.get('/api/auth/status', async () => {
    const settings = loadSettings(config)
    return { setup_required: !settings.admin_password_hash }
  })

  app.post<{ Body: PasswordBody }>('/api/auth/setup', {
    schema: { body: PasswordBodySchema },
  }, async (request, reply) => {
    const settings = loadSettings(config)
    if (settings.admin_password_hash) {
      reply.code(400).send({ error: 'Password already set' })
      return
    }
    settings.admin_password_hash = await hashPassword(request.body.password)
    saveSettings(config, settings)
    return { status: 'ok' }
  })

  app.post<{ Body: PasswordBody }>('/api/auth/login', {
    schema: { body: PasswordBodySchema },
  }, async (request, reply) => {
    const settings = loadSettings(config)
    const pwHash = settings.admin_password_hash as string
    if (!pwHash || !(await verifyPassword(request.body.password, pwHash))) {
      request.log.warn('Admin login failed')
      reply.code(401).send({ error: 'Invalid password' })
      return
    }
    const token = createSessionToken()
    addSession(token)
    request.log.info('Admin login successful')
    reply.setCookie('session', token, { httpOnly: true, path: '/' })
    return { status: 'ok' }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)?.session
    if (token) {
      removeSession(token)
    }
    reply.clearCookie('session', { path: '/' })
    return { status: 'ok' }
  })

  app.post<{ Body: ChangePasswordBody }>('/api/auth/change-password', {
    schema: { body: ChangePasswordBodySchema },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const settings = loadSettings(config)
    const pwHash = settings.admin_password_hash as string
    if (!pwHash || !(await verifyPassword(request.body.current_password, pwHash))) {
      reply.code(401).send({ error: 'Current password is incorrect' })
      return
    }
    settings.admin_password_hash = await hashPassword(request.body.new_password)
    saveSettings(config, settings)
    return { status: 'ok' }
  })

  // --- Settings endpoints ---

  app.get('/api/settings', {
    preHandler: [requireAuth],
  }, async (request) => {
    request.log.debug('Loading settings')
    const settings = loadSettings(config)
    return {
      google_client_id: settings.google_client_id || '',
      display_refresh_interval: settings.display_refresh_interval ?? 60,
      log_level: ((settings.log_level as string) ?? 'info').toUpperCase(),
      has_password: Boolean(settings.admin_password_hash),
      scheduling_enabled: settings.scheduling_enabled ?? false,
    }
  })

  app.put<{ Body: SettingsUpdate }>('/api/settings', {
    schema: { body: SettingsUpdateSchema },
    preHandler: [requireAuth],
  }, async (request) => {
    request.log.debug({ update: request.body }, 'Updating settings')
    const settings = loadSettings(config)
    const update = request.body
    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) {
        // Don't overwrite google_client_secret with empty string
        // (frontend doesn't receive it back for security, so would send "")
        if (key === 'google_client_secret' && value === '') {
          continue
        }
        if (key === 'log_level') {
          // Schema validates value is already a valid pino level
          settings[key] = value
          app.log.level = value as string // Runtime update to root logger
        } else {
          settings[key] = value
        }
      }
    }
    saveSettings(config, settings)
    return { status: 'ok' }
  })

  // --- Refresh endpoints ---

  app.get('/api/refresh/status', {
    preHandler: [requireAuth],
  }, async () => {
    return getRefreshProgress()
  })

  app.post('/api/refresh', {
    preHandler: [requireAuth],
  }, async (request) => {
    request.log.info('Force refresh requested')
    const result = await forceRefreshAll(db, config, {
      info: (msg) => request.log.info(msg),
      error: (msg) => request.log.error(msg),
      debug: (msg) => request.log.debug(msg),
    })
    request.log.info({ ...result }, 'Force refresh completed')
    return {
      status: 'ok',
      refreshed: result.refreshed,
      failed: result.failed,
    }
  })
}
