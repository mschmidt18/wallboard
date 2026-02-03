import { describe, test, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { runMigrations } from './runner.js'

const TEST_MIGRATIONS_DIR = path.join(
  __dirname,
  '__test_migrations__',
)

function createTestMigrationFiles(dir: string, files: Record<string, string>): void {
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content)
  }
}

function cleanupTestMigrations(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true })
  }
}

describe('migration runner', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    cleanupTestMigrations(TEST_MIGRATIONS_DIR)
  })

  test('applies migrations on fresh database', () => {
    createTestMigrationFiles(TEST_MIGRATIONS_DIR, {
      '001_create_users.sql': 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);',
      '002_create_posts.sql': 'CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), title TEXT NOT NULL);',
    })

    runMigrations(db, TEST_MIGRATIONS_DIR)

    // Both tables should exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('users')
    expect(tableNames).toContain('posts')
    expect(tableNames).toContain('_migrations')

    cleanupTestMigrations(TEST_MIGRATIONS_DIR)
  })

  test('is idempotent — running twice does not error', () => {
    createTestMigrationFiles(TEST_MIGRATIONS_DIR, {
      '001_create_users.sql': 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);',
    })

    runMigrations(db, TEST_MIGRATIONS_DIR)
    runMigrations(db, TEST_MIGRATIONS_DIR)

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('users')

    cleanupTestMigrations(TEST_MIGRATIONS_DIR)
  })

  test('tracks applied migrations in _migrations table', () => {
    createTestMigrationFiles(TEST_MIGRATIONS_DIR, {
      '001_create_users.sql': 'CREATE TABLE users (id INTEGER PRIMARY KEY);',
      '002_create_posts.sql': 'CREATE TABLE posts (id INTEGER PRIMARY KEY);',
    })

    runMigrations(db, TEST_MIGRATIONS_DIR)

    const migrations = db.prepare('SELECT name, applied_at FROM _migrations ORDER BY name').all() as { name: string; applied_at: string }[]
    expect(migrations).toHaveLength(2)
    expect(migrations[0].name).toBe('001_create_users.sql')
    expect(migrations[1].name).toBe('002_create_posts.sql')
    // applied_at should be ISO-ish date strings
    expect(migrations[0].applied_at).toMatch(/^\d{4}-\d{2}-\d{2}/)
    expect(migrations[1].applied_at).toMatch(/^\d{4}-\d{2}-\d{2}/)

    cleanupTestMigrations(TEST_MIGRATIONS_DIR)
  })

  test('applies migrations in correct filename order', () => {
    createTestMigrationFiles(TEST_MIGRATIONS_DIR, {
      '002_second.sql': 'CREATE TABLE second (id INTEGER PRIMARY KEY);',
      '001_first.sql': 'CREATE TABLE first (id INTEGER PRIMARY KEY);',
      '003_third.sql': 'CREATE TABLE third (id INTEGER PRIMARY KEY);',
    })

    runMigrations(db, TEST_MIGRATIONS_DIR)

    const migrations = db.prepare('SELECT name FROM _migrations ORDER BY rowid').all() as { name: string }[]
    expect(migrations.map(m => m.name)).toEqual([
      '001_first.sql',
      '002_second.sql',
      '003_third.sql',
    ])

    cleanupTestMigrations(TEST_MIGRATIONS_DIR)
  })

  test('only applies new migrations on subsequent runs', () => {
    createTestMigrationFiles(TEST_MIGRATIONS_DIR, {
      '001_create_users.sql': 'CREATE TABLE users (id INTEGER PRIMARY KEY);',
    })

    runMigrations(db, TEST_MIGRATIONS_DIR)

    // Add a second migration
    createTestMigrationFiles(TEST_MIGRATIONS_DIR, {
      '002_create_posts.sql': 'CREATE TABLE posts (id INTEGER PRIMARY KEY);',
    })

    runMigrations(db, TEST_MIGRATIONS_DIR)

    const migrations = db.prepare('SELECT name FROM _migrations ORDER BY name').all() as { name: string }[]
    expect(migrations).toHaveLength(2)

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('users')
    expect(tableNames).toContain('posts')

    cleanupTestMigrations(TEST_MIGRATIONS_DIR)
  })
})
