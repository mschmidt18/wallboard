import type Database from 'better-sqlite3'
import type {
  WidgetResponse,
  WidgetPositionUpdate,
} from '@shared/types.js'

interface WidgetRow {
  id: number
  layout_id: number
  widget_type: string
  config: string
  position_x: number
  position_y: number
  width: number
  height: number
  created_at: string
  updated_at: string
}

function rowToWidget(row: WidgetRow): WidgetResponse {
  return {
    id: row.id,
    layout_id: row.layout_id,
    widget_type: row.widget_type as WidgetResponse['widget_type'],
    config: JSON.parse(row.config),
    position_x: row.position_x,
    position_y: row.position_y,
    width: row.width,
    height: row.height,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

interface CreateWidgetData {
  widget_type: string
  config: Record<string, unknown>
  position_x: number
  position_y: number
  width: number
  height: number
}

export function createWidget(
  db: Database.Database,
  layoutId: number,
  data: CreateWidgetData
): WidgetResponse {
  const now = new Date().toISOString()
  const config = JSON.stringify(data.config)

  const result = db.prepare(
    `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(layoutId, data.widget_type, config, data.position_x, data.position_y, data.width, data.height, now, now)

  return getWidget(db, Number(result.lastInsertRowid))!
}

export function getWidget(db: Database.Database, id: number): WidgetResponse | null {
  const row = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as WidgetRow | undefined
  if (!row) return null
  return rowToWidget(row)
}

export function updateWidget(
  db: Database.Database,
  id: number,
  data: Partial<{ config: Record<string, unknown>; position_x: number; position_y: number; width: number; height: number }>
): WidgetResponse | null {
  const existing = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as WidgetRow | undefined
  if (!existing) return null

  const now = new Date().toISOString()
  const setClauses: string[] = ['updated_at = ?']
  const values: unknown[] = [now]

  if (data.config !== undefined) {
    setClauses.push('config = ?')
    values.push(JSON.stringify(data.config))
  }
  if (data.position_x !== undefined) {
    setClauses.push('position_x = ?')
    values.push(data.position_x)
  }
  if (data.position_y !== undefined) {
    setClauses.push('position_y = ?')
    values.push(data.position_y)
  }
  if (data.width !== undefined) {
    setClauses.push('width = ?')
    values.push(data.width)
  }
  if (data.height !== undefined) {
    setClauses.push('height = ?')
    values.push(data.height)
  }

  values.push(id)
  db.prepare(`UPDATE widgets SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)

  return getWidget(db, id)
}

export function deleteWidget(db: Database.Database, id: number): boolean {
  const result = db.prepare('DELETE FROM widgets WHERE id = ?').run(id)
  return result.changes > 0
}

export function batchUpdatePositions(
  db: Database.Database,
  layoutId: number,
  positions: WidgetPositionUpdate[]
): void {
  const now = new Date().toISOString()
  const stmt = db.prepare(
    `UPDATE widgets SET position_x = ?, position_y = ?, width = ?, height = ?, updated_at = ?
     WHERE id = ? AND layout_id = ?`
  )

  const updateAll = db.transaction(() => {
    for (const pos of positions) {
      stmt.run(pos.position_x, pos.position_y, pos.width, pos.height, now, pos.id, layoutId)
    }
  })

  updateAll()
}

export function getWidgetsByLayout(db: Database.Database, layoutId: number): WidgetResponse[] {
  const rows = db.prepare('SELECT * FROM widgets WHERE layout_id = ?').all(layoutId) as WidgetRow[]
  return rows.map(rowToWidget)
}
