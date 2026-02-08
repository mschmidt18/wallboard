import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import type Database from 'better-sqlite3'
import { Config } from './config.js'
import { buildLoggerOptions } from './logging.js'
import { setDb } from './db/connection.js'
import { healthRoutes } from './routes/health.js'
import { settingsRoutes } from './routes/settings.js'
import { layoutRoutes } from './routes/layouts.js'
import { widgetRoutes } from './routes/widgets.js'
import { icsCalendarRoutes } from './routes/ics-calendars.js'
import { integrationRoutes } from './routes/integrations.js'
import { googleDataRoutes } from './routes/google-data.js'
import { displayRoutes } from './routes/display.js'
import { scheduleRoutes } from './routes/schedule.js'
import { systemRoutes } from './routes/system.js'
import { requestLogger } from './middleware/request-logger.js'
import { startRefreshLoop, type RefreshHandle } from './services/refresh.js'

export interface BuildAppOptions {
  config: Config
  db: Database.Database
  skipRefreshLoop?: boolean
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, db } = options

  const app = Fastify({
    logger: buildLoggerOptions(config.logLevel),
  })

  // Store config and db on the app instance
  app.decorate('config', config)
  app.decorate('db', db)

  // Set the module-level db singleton
  setDb(db)

  // Register plugins
  await app.register(cookie)

  // Register middleware
  await app.register(requestLogger)

  // Register routes
  await app.register(healthRoutes)
  await app.register(settingsRoutes)
  await app.register(layoutRoutes)
  await app.register(widgetRoutes)
  await app.register(icsCalendarRoutes)
  await app.register(integrationRoutes)
  await app.register(googleDataRoutes)
  await app.register(scheduleRoutes)
  await app.register(displayRoutes)
  await app.register(systemRoutes)

  // Register refresh loop lifecycle (skip in tests)
  if (!options.skipRefreshLoop) {
    let refreshHandle: RefreshHandle | null = null

    app.addHook('onReady', async () => {
      refreshHandle = startRefreshLoop(db, config, app.log as never)
    })

    app.addHook('onClose', async () => {
      if (refreshHandle) {
        refreshHandle.stop()
        refreshHandle = null
      }
    })
  }

  return app
}
