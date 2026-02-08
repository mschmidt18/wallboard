import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { requireAuth } from '../middleware/auth.js'
import { loadSettings, saveSettings } from '../services/settings-store.js'
import { listLayouts, getLayout } from '../db/queries/layouts.js'
import { listIcsCalendars } from '../db/queries/ics-calendars.js'
import { listScheduleRules } from '../db/queries/schedule-rules.js'
import { BackupImportSchema } from '@shared/types.js'
import type { BackupImport, BackupImportResponse } from '@shared/types.js'
import type { Config } from '../config.js'

const EXPORTABLE_SETTINGS = [
  'google_client_id',
  'display_refresh_interval',
  'log_level',
  'scheduling_enabled',
] as const

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  const config = (app as unknown as { config: Config }).config
  const db = (app as unknown as { db: Database.Database }).db

  app.get('/api/backup/export', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    // Gather layouts with nested widgets
    const layoutList = listLayouts(db)
    const layouts = layoutList.map((item) => {
      const full = getLayout(db, item.id)!
      return {
        _export_id: full.id,
        name: full.name,
        columns: full.columns,
        row_height: full.row_height,
        is_active: full.is_active,
        theme: full.theme,
        widgets: full.widgets.map((w) => ({
          widget_type: w.widget_type,
          config: w.config,
          position_x: w.position_x,
          position_y: w.position_y,
          width: w.width,
          height: w.height,
        })),
      }
    })

    // Gather ICS calendars
    const icsCalendars = listIcsCalendars(db).map((c) => ({
      name: c.name,
      url: c.url,
      color: c.color,
    }))

    // Gather schedule rules
    const scheduleRules = listScheduleRules(db).map((r) => ({
      _export_layout_id: r.layout_id,
      days_of_week: r.days_of_week,
      start_time: r.start_time,
      end_time: r.end_time,
      sort_order: r.sort_order,
      enabled: r.enabled,
    }))

    // Gather exportable settings
    const allSettings = loadSettings(config)
    const settings: Record<string, unknown> = {}
    for (const key of EXPORTABLE_SETTINGS) {
      if (allSettings[key] !== undefined) {
        settings[key] = allSettings[key]
      }
    }

    const backup = {
      version: 1,
      exported_at: new Date().toISOString(),
      layouts,
      ics_calendars: icsCalendars,
      schedule_rules: scheduleRules,
      settings,
    }

    const dateStr = new Date().toISOString().split('T')[0]
    reply.header('Content-Disposition', `attachment; filename="wallboard-backup-${dateStr}.json"`)
    reply.header('Content-Type', 'application/json')
    return backup
  })

  app.post<{ Body: BackupImport }>('/api/backup/import', {
    schema: { body: BackupImportSchema },
    preHandler: [requireAuth],
    config: { rawBody: false },
    bodyLimit: 5 * 1024 * 1024,
  }, async (request) => {
    const data = request.body

    let totalWidgets = 0

    const importData = db.transaction(() => {
      // Delete existing data (cascades handle widgets + schedule_rules via FK)
      db.prepare('DELETE FROM schedule_rules').run()
      db.prepare('DELETE FROM widgets').run()
      db.prepare('DELETE FROM layouts').run()
      db.prepare('DELETE FROM ics_calendars').run()

      // Insert layouts and build ID map
      const layoutIdMap = new Map<number, number>()
      const now = new Date().toISOString()

      for (const layout of data.layouts) {
        const result = db.prepare(
          `INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(layout.name, layout.columns, layout.row_height, layout.is_active ? 1 : 0, JSON.stringify(layout.theme), now, now)

        const newId = Number(result.lastInsertRowid)
        layoutIdMap.set(layout._export_id, newId)

        // Insert widgets for this layout
        for (const widget of layout.widgets) {
          db.prepare(
            `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(newId, widget.widget_type, JSON.stringify(widget.config), widget.position_x, widget.position_y, widget.width, widget.height, now, now)
          totalWidgets++
        }
      }

      // Insert ICS calendars
      for (const cal of data.ics_calendars) {
        db.prepare(
          `INSERT INTO ics_calendars (name, url, color, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`
        ).run(cal.name, cal.url, cal.color, now, now)
      }

      // Insert schedule rules with remapped layout IDs
      for (const rule of data.schedule_rules) {
        let newLayoutId: number | null = null
        if (rule._export_layout_id !== null) {
          newLayoutId = layoutIdMap.get(rule._export_layout_id) ?? null
        }

        db.prepare(
          `INSERT INTO schedule_rules (layout_id, days_of_week, start_time, end_time, sort_order, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(newLayoutId, JSON.stringify(rule.days_of_week), rule.start_time, rule.end_time, rule.sort_order, rule.enabled ? 1 : 0, now, now)
      }
    })

    importData()

    // Update settings outside transaction (file-based, not DB)
    const currentSettings = loadSettings(config)
    for (const key of EXPORTABLE_SETTINGS) {
      if (data.settings[key as keyof typeof data.settings] !== undefined) {
        currentSettings[key] = data.settings[key as keyof typeof data.settings]
      }
    }
    saveSettings(config, currentSettings)

    const response: BackupImportResponse = {
      layouts: data.layouts.length,
      widgets: totalWidgets,
      ics_calendars: data.ics_calendars.length,
      schedule_rules: data.schedule_rules.length,
    }

    return response
  })
}
