import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { requireAuth } from '../middleware/auth.js'
import {
  listIcsCalendars,
  createIcsCalendar,
  updateIcsCalendar,
  deleteIcsCalendar,
} from '../db/queries/ics-calendars.js'
import {
  IcsCalendarCreateSchema,
  IcsCalendarUpdateSchema,
} from '@shared/types.js'
import type { IcsCalendarCreate, IcsCalendarUpdate } from '@shared/types.js'

export async function icsCalendarRoutes(app: FastifyInstance): Promise<void> {
  const db = (app as unknown as { db: Database.Database }).db

  app.get('/api/ics-calendars', {
    preHandler: [requireAuth],
  }, async () => {
    return listIcsCalendars(db)
  })

  app.post<{ Body: IcsCalendarCreate }>('/api/ics-calendars', {
    schema: { body: IcsCalendarCreateSchema },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const calendar = createIcsCalendar(db, request.body)
    reply.code(201).send(calendar)
  })

  app.put<{ Params: { id: string }; Body: IcsCalendarUpdate }>('/api/ics-calendars/:id', {
    schema: { body: IcsCalendarUpdateSchema },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const calendar = updateIcsCalendar(db, id, request.body)
    if (!calendar) {
      reply.code(404).send({ error: 'ICS calendar not found' })
      return
    }
    return calendar
  })

  app.delete<{ Params: { id: string } }>('/api/ics-calendars/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const deleted = deleteIcsCalendar(db, id)
    if (!deleted) {
      reply.code(404).send({ error: 'ICS calendar not found' })
      return
    }
    reply.code(204).send()
  })
}
