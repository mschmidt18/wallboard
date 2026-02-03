import { describe, test, expect, afterEach } from 'vitest'
import { createDb, getDb, setDb } from './connection.js'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('createDb', () => {
  let db: Database.Database
  let tmpDir: string | null = null

  afterEach(() => {
    if (db) db.close()
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = null
  })

  test('opens an in-memory database successfully', () => {
    db = createDb(':memory:')
    expect(db.open).toBe(true)
  })

  test('enables WAL mode on file-based database', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wallboard-test-'))
    db = createDb(join(tmpDir, 'test.db'))
    const result = db.pragma('journal_mode', { simple: true })
    expect(result).toBe('wal')
  })

  test('enables foreign keys', () => {
    db = createDb(':memory:')
    const result = db.pragma('foreign_keys', { simple: true })
    expect(result).toBe(1)
  })

  test('foreign key constraint is enforced', () => {
    db = createDb(':memory:')

    // Create tables to test FK enforcement
    db.exec(`
      CREATE TABLE layouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      CREATE TABLE widgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        layout_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
        name TEXT NOT NULL
      );
    `)

    // Inserting a widget with a nonexistent layout_id should fail
    expect(() => {
      db.prepare('INSERT INTO widgets (layout_id, name) VALUES (999, ?)').run('test')
    }).toThrow(/FOREIGN KEY constraint failed/)
  })
})

describe('getDb / setDb', () => {
  let db: Database.Database

  afterEach(() => {
    if (db) db.close()
  })

  test('setDb stores and getDb retrieves the singleton', () => {
    db = createDb(':memory:')
    setDb(db)
    expect(getDb()).toBe(db)
  })

  test('getDb throws when no database is set', () => {
    setDb(null as unknown as Database.Database)
    expect(() => getDb()).toThrow()
  })
})
