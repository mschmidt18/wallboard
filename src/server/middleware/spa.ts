import { resolve, join, extname } from 'path'
import { existsSync, readFileSync } from 'fs'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import fastifyStatic from '@fastify/static'

const MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
}

export interface SpaOptions {
  /** Override the frontend dist directory path (for testing). */
  distPath?: string
}

/**
 * Resolves the default frontend dist directory path.
 */
function getDefaultDistPath(): string {
  return resolve(import.meta.dirname, '..', '..', '..', 'dist', 'frontend')
}

/**
 * SPA static file middleware for production.
 * Serves built frontend assets at /assets and falls back to index.html
 * for all non-API routes (client-side routing support).
 *
 * Ported from server/app/main.py lines 76-87.
 */
async function spaMiddleware(app: FastifyInstance, opts: SpaOptions): Promise<void> {
  const frontendDist = opts.distPath ?? getDefaultDistPath()

  if (!existsSync(frontendDist)) {
    return
  }

  const indexHtml = readFileSync(join(frontendDist, 'index.html'))

  // Serve static assets from dist/frontend/assets/
  const assetsDir = join(frontendDist, 'assets')
  if (existsSync(assetsDir)) {
    await app.register(fastifyStatic, {
      root: assetsDir,
      prefix: '/assets/',
      decorateReply: false,
    })
  }

  // SPA fallback: serve index.html for all non-API routes
  app.setNotFoundHandler((request, reply) => {
    // Don't intercept API routes — let them return their own 404s
    if (request.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'Not found' })
      return
    }

    // Security: resolve the requested path and verify it's within frontendDist
    // to prevent directory traversal attacks
    const stripped = request.url.replace(/^\//, '')
    if (stripped) {
      const requestedPath = resolve(frontendDist, stripped)
      const resolvedFrontendDist = resolve(frontendDist)

      if (
        requestedPath.startsWith(resolvedFrontendDist + '/') &&
        existsSync(requestedPath)
      ) {
        // Serve the actual file if it exists within the dist directory
        const mime = MIME_TYPES[extname(requestedPath)] ?? 'application/octet-stream'
        reply.type(mime).send(readFileSync(requestedPath))
        return
      }
    }

    // Default: serve index.html for client-side routing
    reply.type('text/html').send(indexHtml)
  })
}

export const spaRoutes = fp(spaMiddleware)
