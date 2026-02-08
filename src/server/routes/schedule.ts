import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { requireAuth } from '../middleware/auth.js'
import {
  listScheduleRules,
  createScheduleRule,
  updateScheduleRule,
  deleteScheduleRule,
  reorderScheduleRules,
} from '../db/queries/schedule-rules.js'
import {
  ScheduleRuleCreateSchema,
  ScheduleRuleUpdateSchema,
  ScheduleReorderSchema,
} from '@shared/types.js'
import type { ScheduleRuleCreate, ScheduleRuleUpdate, ScheduleReorder } from '@shared/types.js'

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  const db = (app as unknown as { db: Database.Database }).db

  app.get('/api/schedule', {
    preHandler: [requireAuth],
  }, async () => {
    return listScheduleRules(db)
  })

  app.post<{ Body: ScheduleRuleCreate }>('/api/schedule', {
    schema: { body: ScheduleRuleCreateSchema },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    // Validate layout_id exists if not null
    if (request.body.layout_id !== null) {
      const layout = db.prepare('SELECT id FROM layouts WHERE id = ?').get(request.body.layout_id)
      if (!layout) {
        reply.code(400).send({ error: 'Layout not found' })
        return
      }
    }

    const rule = createScheduleRule(db, request.body)
    reply.code(201).send(rule)
  })

  // Reorder must be registered before /:id so Fastify matches it as static
  app.put<{ Body: ScheduleReorder }>('/api/schedule/reorder', {
    schema: { body: ScheduleReorderSchema },
    preHandler: [requireAuth],
  }, async (request) => {
    reorderScheduleRules(db, request.body)
    return listScheduleRules(db)
  })

  app.put<{ Params: { id: string }; Body: ScheduleRuleUpdate }>('/api/schedule/:id', {
    schema: { body: ScheduleRuleUpdateSchema },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const rule = updateScheduleRule(db, id, request.body)
    if (!rule) {
      reply.code(404).send({ error: 'Schedule rule not found' })
      return
    }
    return rule
  })

  app.delete<{ Params: { id: string } }>('/api/schedule/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const deleted = deleteScheduleRule(db, id)
    if (!deleted) {
      reply.code(404).send({ error: 'Schedule rule not found' })
      return
    }
    reply.code(204).send()
  })
}
