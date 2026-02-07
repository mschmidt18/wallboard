import type { FastifyInstance } from 'fastify'
import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Registers Vite dev server as middleware in Fastify.
 * Only used when NODE_ENV !== 'production'.
 */
export async function registerViteDev(app: FastifyInstance): Promise<void> {
  const { createServer } = await import('vite')

  // Register @fastify/middie to support connect-style middleware
  const middie = await import('@fastify/middie')
  await app.register(middie.default)

  // Create Vite dev server in middleware mode
  // Use configFile to load vite.config.ts which contains the @shared alias
  const vite = await createServer({
    configFile: path.resolve(__dirname, '../../vite.config.ts'),
    server: { middlewareMode: true },
  })

  // Wrap Vite's middleware to skip API routes (let Fastify handle them)
  const viteMiddleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    // Skip Vite for API routes - let Fastify handle them
    if (req.url?.startsWith('/api/')) {
      return next()
    }
    vite.middlewares(req, res, next)
  }

  // Register wrapped Vite middleware with Fastify
  app.use(viteMiddleware)

  // Clean up Vite server when Fastify closes
  app.addHook('onClose', async () => {
    await vite.close()
  })
}
