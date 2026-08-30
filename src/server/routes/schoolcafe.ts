import type { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { requireAuth } from '../middleware/auth.js'
import { lookupDistrict, fetchServingLines, SchoolCafeError } from '../services/schoolcafe.js'

export async function schoolCafeRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { district: string } }>(
    '/api/schoolcafe/lookup',
    {
      schema: { querystring: Type.Object({ district: Type.String({ minLength: 1 }) }) },
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      try {
        return await lookupDistrict(request.query.district)
      } catch (err) {
        if (err instanceof SchoolCafeError) {
          reply.code(404).send({ error: err.message })
          return
        }
        request.log.warn(`SchoolCafe lookup failed: ${err}`)
        reply.code(502).send({ error: 'SchoolCafe lookup failed' })
      }
    },
  )

  app.get<{ Querystring: { school_id: string; meal_type: string } }>(
    '/api/schoolcafe/serving-lines',
    {
      schema: {
        querystring: Type.Object({
          school_id: Type.String({ minLength: 1 }),
          meal_type: Type.String({ minLength: 1 }),
        }),
      },
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      try {
        const lines = await fetchServingLines(request.query.school_id, request.query.meal_type)
        return { serving_lines: lines }
      } catch (err) {
        request.log.warn(`SchoolCafe serving line lookup failed: ${err}`)
        reply.code(502).send({ error: 'SchoolCafe lookup failed' })
      }
    },
  )
}
