import type { FastifyRequest, FastifyReply } from 'fastify'
import { SESSION_TTL } from '@shared/constants.js'

/** In-memory session store: token → expiry Unix timestamp (seconds). */
const sessions = new Map<string, number>()

/** Add a session token with an optional custom TTL in seconds. */
export function addSession(token: string, ttlSeconds: number = SESSION_TTL): void {
  sessions.set(token, Math.floor(Date.now() / 1000) + ttlSeconds)
}

/** Remove a single session (used for logout). */
export function removeSession(token: string): void {
  sessions.delete(token)
}

/** Clear all sessions (used in test cleanup). */
export function clearSessions(): void {
  sessions.clear()
}

/** Fastify preHandler hook that requires a valid session cookie. */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = (request.cookies as Record<string, string | undefined>)?.session

  if (!token || !sessions.has(token)) {
    reply.code(401).send({ error: 'Not authenticated' })
    return
  }

  const expiry = sessions.get(token)!
  if (expiry < Math.floor(Date.now() / 1000)) {
    sessions.delete(token)
    reply.code(401).send({ error: 'Session expired' })
    return
  }
}
