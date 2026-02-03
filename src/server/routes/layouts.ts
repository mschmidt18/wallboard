import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { requireAuth } from '../middleware/auth.js'
import {
  createLayout,
  listLayouts,
  getLayout,
  updateLayout,
  deleteLayout,
  activateLayout,
} from '../db/queries/layouts.js'
import {
  LayoutCreateSchema,
  LayoutUpdateSchema,
} from '@shared/types.js'
import type { LayoutCreate, LayoutUpdate } from '@shared/types.js'

export async function layoutRoutes(app: FastifyInstance): Promise<void> {
  const db = (app as unknown as { db: Database.Database }).db

  app.post<{ Body: LayoutCreate }>('/api/layouts', {
    schema: { body: LayoutCreateSchema },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const layout = createLayout(db, request.body)
    reply.code(201).send(layout)
  })

  app.get('/api/layouts', {
    preHandler: [requireAuth],
  }, async () => {
    return listLayouts(db)
  })

  app.get<{ Params: { id: string } }>('/api/layouts/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const layout = getLayout(db, id)
    if (!layout) {
      reply.code(404).send({ error: 'Layout not found' })
      return
    }
    return layout
  })

  app.put<{ Params: { id: string }; Body: LayoutUpdate }>('/api/layouts/:id', {
    schema: { body: LayoutUpdateSchema },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const layout = updateLayout(db, id, request.body)
    if (!layout) {
      reply.code(404).send({ error: 'Layout not found' })
      return
    }
    return layout
  })

  app.delete<{ Params: { id: string } }>('/api/layouts/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const deleted = deleteLayout(db, id)
    if (!deleted) {
      reply.code(404).send({ error: 'Layout not found' })
      return
    }
    reply.code(204).send()
  })

  app.post<{ Params: { id: string } }>('/api/layouts/:id/activate', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const layout = activateLayout(db, id)
    if (!layout) {
      reply.code(404).send({ error: 'Layout not found' })
      return
    }
    return layout
  })
}
