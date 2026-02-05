import type Database from 'better-sqlite3'

interface CacheRow {
  id: number
  source: string
  data: string
  fetched_at: string
  expires_at: string | null
}

export function getCache(db: Database.Database, source: string): CacheRow | null {
  const row = db.prepare('SELECT * FROM cache WHERE source = ?').get(source) as CacheRow | undefined
  return row ?? null
}

export function getCacheMultiple(db: Database.Database, sources: string[]): Map<string, unknown> {
  if (sources.length === 0) return new Map()

  const placeholders = sources.map(() => '?').join(', ')
  const rows = db.prepare(
    `SELECT source, data FROM cache WHERE source IN (${placeholders})`
  ).all(...sources) as Pick<CacheRow, 'source' | 'data'>[]

  const result = new Map<string, unknown>()
  for (const row of rows) {
    result.set(row.source, JSON.parse(row.data))
  }
  return result
}

export function upsertCache(
  db: Database.Database,
  source: string,
  data: unknown,
  expiresAt: string | null
): void {
  const now = new Date().toISOString()
  const jsonData = JSON.stringify(data)

  const existing = db.prepare('SELECT id FROM cache WHERE source = ?').get(source) as { id: number } | undefined

  if (existing) {
    db.prepare(
      'UPDATE cache SET data = ?, fetched_at = ?, expires_at = ? WHERE source = ?'
    ).run(jsonData, now, expiresAt, source)
  } else {
    db.prepare(
      `INSERT INTO cache (source, data, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`
    ).run(source, jsonData, now, expiresAt)
  }
}

export function isCacheFresh(db: Database.Database, source: string): boolean {
  const row = db.prepare(
    'SELECT expires_at FROM cache WHERE source = ?'
  ).get(source) as Pick<CacheRow, 'expires_at'> | undefined

  if (!row || !row.expires_at) return false

  return new Date() < new Date(row.expires_at)
}

/**
 * Clear all cache entries by setting expires_at to the past.
 * This forces the next refresh cycle to re-fetch all data.
 */
export function invalidateAllCache(db: Database.Database): number {
  const pastDate = new Date(0).toISOString()
  const result = db.prepare('UPDATE cache SET expires_at = ?').run(pastDate)
  return result.changes
}
