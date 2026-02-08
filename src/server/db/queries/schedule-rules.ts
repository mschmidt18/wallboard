import type Database from 'better-sqlite3'
import type { ScheduleRuleResponse } from '@shared/types.js'

interface ScheduleRuleRow {
  id: number
  layout_id: number | null
  days_of_week: string
  start_time: string
  end_time: string
  sort_order: number
  enabled: number
  created_at: string
  updated_at: string
}

interface ScheduleRuleCreateData {
  layout_id: number | null
  days_of_week: number[]
  start_time: string
  end_time: string
  enabled?: boolean
}

interface ScheduleRuleUpdateData {
  layout_id?: number | null
  days_of_week?: number[]
  start_time?: string
  end_time?: string
  enabled?: boolean
}

function rowToResponse(row: ScheduleRuleRow): ScheduleRuleResponse {
  return {
    id: row.id,
    layout_id: row.layout_id,
    days_of_week: JSON.parse(row.days_of_week) as number[],
    start_time: row.start_time,
    end_time: row.end_time,
    sort_order: row.sort_order,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function listScheduleRules(db: Database.Database): ScheduleRuleResponse[] {
  const rows = db.prepare('SELECT * FROM schedule_rules ORDER BY sort_order, id').all() as ScheduleRuleRow[]
  return rows.map(rowToResponse)
}

export function listEnabledScheduleRules(db: Database.Database): ScheduleRuleResponse[] {
  const rows = db.prepare('SELECT * FROM schedule_rules WHERE enabled = 1 ORDER BY sort_order, id').all() as ScheduleRuleRow[]
  return rows.map(rowToResponse)
}

export function getScheduleRule(db: Database.Database, id: number): ScheduleRuleResponse | null {
  const row = db.prepare('SELECT * FROM schedule_rules WHERE id = ?').get(id) as ScheduleRuleRow | undefined
  return row ? rowToResponse(row) : null
}

export function createScheduleRule(db: Database.Database, data: ScheduleRuleCreateData): ScheduleRuleResponse {
  const now = new Date().toISOString()
  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1

  // Auto-assign sort_order = MAX(sort_order) + 1
  const maxRow = db.prepare('SELECT MAX(sort_order) as max_order FROM schedule_rules').get() as { max_order: number | null }
  const sortOrder = maxRow.max_order !== null ? maxRow.max_order + 1 : 0

  const result = db.prepare(
    `INSERT INTO schedule_rules (layout_id, days_of_week, start_time, end_time, sort_order, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(data.layout_id, JSON.stringify(data.days_of_week), data.start_time, data.end_time, sortOrder, enabled, now, now)

  return getScheduleRule(db, Number(result.lastInsertRowid))!
}

export function updateScheduleRule(
  db: Database.Database,
  id: number,
  data: ScheduleRuleUpdateData
): ScheduleRuleResponse | null {
  const existing = db.prepare('SELECT * FROM schedule_rules WHERE id = ?').get(id) as ScheduleRuleRow | undefined
  if (!existing) return null

  const now = new Date().toISOString()
  const layoutId = data.layout_id !== undefined ? data.layout_id : existing.layout_id
  const daysOfWeek = data.days_of_week !== undefined ? JSON.stringify(data.days_of_week) : existing.days_of_week
  const startTime = data.start_time ?? existing.start_time
  const endTime = data.end_time ?? existing.end_time
  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled

  db.prepare(
    `UPDATE schedule_rules SET layout_id = ?, days_of_week = ?, start_time = ?, end_time = ?, enabled = ?, updated_at = ? WHERE id = ?`
  ).run(layoutId, daysOfWeek, startTime, endTime, enabled, now, id)

  return getScheduleRule(db, id)
}

export function deleteScheduleRule(db: Database.Database, id: number): boolean {
  const result = db.prepare('DELETE FROM schedule_rules WHERE id = ?').run(id)
  return result.changes > 0
}

export function reorderScheduleRules(
  db: Database.Database,
  items: { id: number; sort_order: number }[]
): void {
  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE schedule_rules SET sort_order = ?, updated_at = ? WHERE id = ?')

  const updateAll = db.transaction(() => {
    for (const item of items) {
      stmt.run(item.sort_order, now, item.id)
    }
  })

  updateAll()
}
