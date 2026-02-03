import type Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

export function runMigrations(db: Database.Database, migrationsDir?: string): void {
  const dir = migrationsDir ?? path.join(import.meta.dirname, 'sql')

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(r => r.name),
  )

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const pending = files.filter(f => !applied.has(f))

  if (pending.length === 0) return

  const applyMigration = db.transaction((fileName: string) => {
    const sql = fs.readFileSync(path.join(dir, fileName), 'utf-8')
    db.exec(sql)
    db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
      fileName,
      new Date().toISOString(),
    )
  })

  for (const fileName of pending) {
    applyMigration(fileName)
  }
}
