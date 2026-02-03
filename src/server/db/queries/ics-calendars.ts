import type Database from 'better-sqlite3'
import type { IcsCalendar } from '@shared/types.js'

interface IcsCalendarCreateData {
  name: string
  url: string
  color?: string
}

interface IcsCalendarUpdateData {
  name?: string
  url?: string
  color?: string
}

export function listIcsCalendars(db: Database.Database): IcsCalendar[] {
  return db.prepare('SELECT * FROM ics_calendars ORDER BY id').all() as IcsCalendar[]
}

export function createIcsCalendar(db: Database.Database, data: IcsCalendarCreateData): IcsCalendar {
  const now = new Date().toISOString()
  const color = data.color ?? '#6366f1'

  const result = db.prepare(
    `INSERT INTO ics_calendars (name, url, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(data.name, data.url, color, now, now)

  return db.prepare('SELECT * FROM ics_calendars WHERE id = ?').get(result.lastInsertRowid) as IcsCalendar
}

export function updateIcsCalendar(
  db: Database.Database,
  id: number,
  data: IcsCalendarUpdateData
): IcsCalendar | null {
  const existing = db.prepare('SELECT * FROM ics_calendars WHERE id = ?').get(id) as IcsCalendar | undefined
  if (!existing) return null

  const now = new Date().toISOString()
  const name = data.name ?? existing.name
  const url = data.url ?? existing.url
  const color = data.color ?? existing.color

  db.prepare(
    'UPDATE ics_calendars SET name = ?, url = ?, color = ?, updated_at = ? WHERE id = ?'
  ).run(name, url, color, now, id)

  return db.prepare('SELECT * FROM ics_calendars WHERE id = ?').get(id) as IcsCalendar
}

export function deleteIcsCalendar(db: Database.Database, id: number): boolean {
  const result = db.prepare('DELETE FROM ics_calendars WHERE id = ?').run(id)
  return result.changes > 0
}
