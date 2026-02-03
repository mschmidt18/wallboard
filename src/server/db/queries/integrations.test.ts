import { describe, test, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from '@server/db/connection.js'
import {
  listIntegrations,
  getIntegrationByProvider,
  upsertIntegration,
  deleteIntegrationByProvider,
} from './integrations.js'

describe('integration queries', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  test('list integrations returns empty array initially', () => {
    const result = listIntegrations(db)
    expect(result).toEqual([])
  })

  test('upsert creates new integration', () => {
    const row = upsertIntegration(db, 'google', '{"token":"abc"}', 'connected')
    expect(row.provider).toBe('google')
    expect(row.credentials).toBe('{"token":"abc"}')
    expect(row.status).toBe('connected')
    expect(row.id).toBeTypeOf('number')
    expect(row.created_at).toBeTruthy()
    expect(row.updated_at).toBeTruthy()
  })

  test('upsert updates existing integration', () => {
    const first = upsertIntegration(db, 'google', '{"token":"abc"}', 'connected')
    const second = upsertIntegration(db, 'google', '{"token":"xyz"}', 'refreshed')
    expect(second.id).toBe(first.id)
    expect(second.credentials).toBe('{"token":"xyz"}')
    expect(second.status).toBe('refreshed')
  })

  test('list integrations excludes credentials', () => {
    upsertIntegration(db, 'google', '{"token":"secret"}', 'connected')
    const list = listIntegrations(db)
    expect(list).toHaveLength(1)
    expect(list[0].provider).toBe('google')
    expect(list[0].status).toBe('connected')
    expect(list[0]).not.toHaveProperty('credentials')
  })

  test('get integration by provider returns row with credentials', () => {
    upsertIntegration(db, 'google', '{"token":"abc"}', 'connected')
    const row = getIntegrationByProvider(db, 'google')
    expect(row).not.toBeNull()
    expect(row!.provider).toBe('google')
    expect(row!.credentials).toBe('{"token":"abc"}')
  })

  test('get integration by provider returns null for nonexistent', () => {
    const row = getIntegrationByProvider(db, 'google')
    expect(row).toBeNull()
  })

  test('delete integration by provider returns true', () => {
    upsertIntegration(db, 'google', '{"token":"abc"}', 'connected')
    const deleted = deleteIntegrationByProvider(db, 'google')
    expect(deleted).toBe(true)
    expect(getIntegrationByProvider(db, 'google')).toBeNull()
  })

  test('delete nonexistent provider returns false', () => {
    const deleted = deleteIntegrationByProvider(db, 'google')
    expect(deleted).toBe(false)
  })
})
