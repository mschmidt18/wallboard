import type Database from 'better-sqlite3'
import type { Integration } from '@shared/types.js'

interface IntegrationRow {
  id: number
  provider: string
  credentials: string
  status: string
  created_at: string
  updated_at: string
}

export function listIntegrations(db: Database.Database): Integration[] {
  const rows = db.prepare(
    'SELECT id, provider, status, created_at FROM integrations'
  ).all() as Pick<IntegrationRow, 'id' | 'provider' | 'status' | 'created_at'>[]

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    status: row.status,
    created_at: row.created_at,
  }))
}

export function getIntegrationByProvider(db: Database.Database, provider: string): IntegrationRow | null {
  const row = db.prepare(
    'SELECT * FROM integrations WHERE provider = ?'
  ).get(provider) as IntegrationRow | undefined

  return row ?? null
}

export function upsertIntegration(
  db: Database.Database,
  provider: string,
  credentials: string,
  status: string
): IntegrationRow {
  const now = new Date().toISOString()
  const existing = getIntegrationByProvider(db, provider)

  if (existing) {
    db.prepare(
      'UPDATE integrations SET credentials = ?, status = ?, updated_at = ? WHERE provider = ?'
    ).run(credentials, status, now, provider)
  } else {
    db.prepare(
      `INSERT INTO integrations (provider, credentials, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(provider, credentials, status, now, now)
  }

  return getIntegrationByProvider(db, provider)!
}

export function deleteIntegrationByProvider(db: Database.Database, provider: string): boolean {
  const result = db.prepare('DELETE FROM integrations WHERE provider = ?').run(provider)
  return result.changes > 0
}
