import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

const SKIP_PATHS = new Set(['/api/display', '/api/health'])

async function requestLoggerPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onResponse', (request, reply, done) => {
    if (SKIP_PATHS.has(request.url)) {
      done()
      return
    }

    const duration_ms = reply.elapsedTime

    app.log.info({
      method: request.method,
      path: request.url,
      status: reply.statusCode,
      duration_ms: Math.round(duration_ms * 10) / 10,
    }, 'request')

    done()
  })
}

export const requestLogger = fp(requestLoggerPlugin)
