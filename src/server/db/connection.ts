import Database from 'better-sqlite3'
import { runMigrations } from './migrations/runner.js'

let _db: Database.Database | null = null

export function createDb(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export function getDb(): Database.Database {
  if (!_db) {
    throw new Error('Database not initialized. Call setDb() first.')
  }
  return _db
}

export function setDb(db: Database.Database): void {
  _db = db
}

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}
