import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { Config } from './config.js'
import { createDb } from './db/connection.js'
import { runMigrations } from './db/migrations/runner.js'
import { buildApp } from './app.js'

const PORT = parseInt(process.env.PORT ?? '8000', 10)
const HOST = '0.0.0.0'

// Resolve migrations directory relative to this file's location
// In both dev (src/server/) and prod (dist/server/), go up to project root then to src/
const MIGRATIONS_DIR = resolve(import.meta.dirname, '..', '..', 'src', 'server', 'db', 'migrations', 'sql')

async function main(): Promise<void> {
  const config = Config.default()

  // Ensure database directory exists
  mkdirSync(dirname(config.dbPath), { recursive: true })

  // Open database and run migrations
  const db = createDb(config.dbPath)
  runMigrations(db, MIGRATIONS_DIR)

  // Build Fastify app
  const app = await buildApp({ config, db })

  // Register Vite dev or SPA static middleware
  if (process.env.NODE_ENV !== 'production') {
    const { registerViteDev } = await import('./vite-dev.js')
    await registerViteDev(app)
  } else {
    const { spaRoutes } = await import('./middleware/spa.js')
    await app.register(spaRoutes)
  }

  // Start listening
  await app.listen({ port: PORT, host: HOST })
  app.log.info({ event: 'server_started', port: PORT, host: HOST })

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info({ event: 'shutdown', signal })
    await app.close() // triggers onClose hooks (refresh loop stop, vite close)
    db.close()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
