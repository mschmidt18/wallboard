import type Database from 'better-sqlite3'
import type {
  LayoutResponse,
  LayoutListItem,
  WidgetResponse,
} from '@shared/types.js'

interface LayoutRow {
  id: number
  name: string
  columns: number
  row_height: number
  is_active: number
  theme: string
  created_at: string
  updated_at: string
}

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

interface LayoutListRow extends LayoutRow {
  widget_count: number
}

function rowToLayout(row: LayoutRow, widgets: WidgetResponse[] = []): LayoutResponse {
  return {
    id: row.id,
    name: row.name,
    columns: row.columns,
    row_height: row.row_height,
    is_active: row.is_active === 1,
    theme: JSON.parse(row.theme),
    widgets,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
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

interface CreateLayoutData {
  name: string
  columns?: number
  row_height?: number
  theme?: Record<string, unknown>
}

export function createLayout(db: Database.Database, data: CreateLayoutData): LayoutResponse {
  const now = new Date().toISOString()
  const columns = data.columns ?? 12
  const row_height = data.row_height ?? 80
  const theme = JSON.stringify(data.theme ?? {})

  const result = db.prepare(
    `INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)`
  ).run(data.name, columns, row_height, theme, now, now)

  return getLayout(db, Number(result.lastInsertRowid))!
}

export function listLayouts(db: Database.Database): LayoutListItem[] {
  const rows = db.prepare(
    `SELECT l.*, COUNT(w.id) as widget_count
     FROM layouts l
     LEFT JOIN widgets w ON w.layout_id = l.id
     GROUP BY l.id
     ORDER BY l.created_at`
  ).all() as LayoutListRow[]

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    columns: row.columns,
    row_height: row.row_height,
    is_active: row.is_active === 1,
    theme: JSON.parse(row.theme),
    widget_count: row.widget_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}

export function getLayout(db: Database.Database, id: number): LayoutResponse | null {
  const row = db.prepare('SELECT * FROM layouts WHERE id = ?').get(id) as LayoutRow | undefined
  if (!row) return null

  const widgetRows = db.prepare('SELECT * FROM widgets WHERE layout_id = ?').all(id) as WidgetRow[]
  return rowToLayout(row, widgetRows.map(rowToWidget))
}

export function updateLayout(
  db: Database.Database,
  id: number,
  data: Partial<{ name: string; columns: number; row_height: number; theme: Record<string, unknown> }>
): LayoutResponse | null {
  const existing = db.prepare('SELECT * FROM layouts WHERE id = ?').get(id) as LayoutRow | undefined
  if (!existing) return null

  const now = new Date().toISOString()
  const setClauses: string[] = ['updated_at = ?']
  const values: unknown[] = [now]

  if (data.name !== undefined) {
    setClauses.push('name = ?')
    values.push(data.name)
  }
  if (data.columns !== undefined) {
    setClauses.push('columns = ?')
    values.push(data.columns)
  }
  if (data.row_height !== undefined) {
    setClauses.push('row_height = ?')
    values.push(data.row_height)
  }
  if (data.theme !== undefined) {
    setClauses.push('theme = ?')
    values.push(JSON.stringify(data.theme))
  }

  values.push(id)
  db.prepare(`UPDATE layouts SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)

  return getLayout(db, id)
}

export function deleteLayout(db: Database.Database, id: number): boolean {
  const result = db.prepare('DELETE FROM layouts WHERE id = ?').run(id)
  return result.changes > 0
}

export function activateLayout(db: Database.Database, id: number): LayoutResponse | null {
  const existing = db.prepare('SELECT * FROM layouts WHERE id = ?').get(id) as LayoutRow | undefined
  if (!existing) return null

  db.prepare('UPDATE layouts SET is_active = 0 WHERE is_active = 1 AND id != ?').run(id)
  db.prepare('UPDATE layouts SET is_active = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id)

  return getLayout(db, id)
}
