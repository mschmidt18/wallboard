import type { LoggerOptions } from 'pino'

/**
 * Build pino logger options for Fastify.
 * Uses structlog-compatible key names: event (message), level, timestamp.
 */
export function buildLoggerOptions(level: string): LoggerOptions {
  return {
    level: level.toLowerCase(),
    messageKey: 'event',
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  }
}
