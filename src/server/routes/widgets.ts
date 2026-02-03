import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { requireAuth } from '../middleware/auth.js'
import {
  createWidget,
  getWidget,
  updateWidget,
  deleteWidget,
  batchUpdatePositions,
  getWidgetsByLayout,
} from '../db/queries/widgets.js'
import { getLayout } from '../db/queries/layouts.js'
import { geocodeZip, GeocodingError } from '../services/geocoding.js'
import {
  WidgetCreateSchema,
  WidgetUpdateSchema,
  WidgetPositionUpdateSchema,
} from '@shared/types.js'
import type { WidgetCreate, WidgetUpdate, WidgetPositionUpdate } from '@shared/types.js'
import { Type } from '@sinclair/typebox'

async function resolveWeatherZip(
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!('zip_code' in config)) {
    return config
  }
  try {
    const geo = await geocodeZip(config.zip_code as string)
    return { ...config, lat: geo.lat, lon: geo.lon, location_name: geo.locationName }
  } catch (e) {
    if (e instanceof GeocodingError) {
      throw e
    }
    throw e
  }
}

export async function widgetRoutes(app: FastifyInstance): Promise<void> {
  const db = (app as unknown as { db: Database.Database }).db

  app.post<{ Params: { layoutId: string }; Body: WidgetCreate }>(
    '/api/layouts/:layoutId/widgets',
    {
      schema: { body: WidgetCreateSchema },
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const layoutId = Number(request.params.layoutId)
      const layout = getLayout(db, layoutId)
      if (!layout) {
        reply.code(404).send({ error: 'Layout not found' })
        return
      }

      let config = request.body.config
      if (request.body.widget_type === 'weather') {
        try {
          config = await resolveWeatherZip(config)
        } catch (e) {
          if (e instanceof GeocodingError) {
            reply.code(400).send({ error: e.message })
            return
          }
          throw e
        }
      }

      const widget = createWidget(db, layoutId, { ...request.body, config })
      app.log.info(
        `Widget added: ${widget.widget_type} (id=${widget.id}) to layout ${layoutId}`,
      )
      reply.code(201).send(widget)
    },
  )

  app.put<{ Params: { id: string }; Body: WidgetUpdate }>(
    '/api/widgets/:id',
    {
      schema: { body: WidgetUpdateSchema },
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const id = Number(request.params.id)
      const existing = getWidget(db, id)
      if (!existing) {
        reply.code(404).send({ error: 'Widget not found' })
        return
      }

      const updateData = { ...request.body }
      if (existing.widget_type === 'weather' && updateData.config) {
        try {
          updateData.config = await resolveWeatherZip(updateData.config)
        } catch (e) {
          if (e instanceof GeocodingError) {
            reply.code(400).send({ error: e.message })
            return
          }
          throw e
        }
      }

      const widget = updateWidget(db, id, updateData)
      return widget
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/api/widgets/:id',
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const id = Number(request.params.id)
      const existing = getWidget(db, id)
      if (!existing) {
        reply.code(404).send({ error: 'Widget not found' })
        return
      }
      app.log.info(
        `Widget removed: ${existing.widget_type} (id=${existing.id}) from layout ${existing.layout_id}`,
      )
      deleteWidget(db, id)
      reply.code(204).send()
    },
  )

  app.put<{ Params: { layoutId: string }; Body: WidgetPositionUpdate[] }>(
    '/api/layouts/:layoutId/widgets/positions',
    {
      schema: { body: Type.Array(WidgetPositionUpdateSchema) },
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const layoutId = Number(request.params.layoutId)
      const layout = getLayout(db, layoutId)
      if (!layout) {
        reply.code(404).send({ error: 'Layout not found' })
        return
      }

      // Verify all widget IDs belong to the layout
      const layoutWidgets = getWidgetsByLayout(db, layoutId)
      const layoutWidgetIds = new Set(layoutWidgets.map((w) => w.id))
      for (const pos of request.body) {
        if (!layoutWidgetIds.has(pos.id)) {
          reply
            .code(404)
            .send({ error: `Widget ${pos.id} not found in layout` })
          return
        }
      }

      batchUpdatePositions(db, layoutId, request.body)
      const updated = getWidgetsByLayout(db, layoutId)
      return updated
    },
  )
}
