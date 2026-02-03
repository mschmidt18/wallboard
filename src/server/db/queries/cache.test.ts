import { describe, test, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from '@server/db/connection.js'
import {
  getCache,
  getCacheMultiple,
  upsertCache,
  isCacheFresh,
} from './cache.js'

describe('cache queries', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  test('getCache returns null for nonexistent source', () => {
    const result = getCache(db, 'weather_40.7_-74.0')
    expect(result).toBeNull()
  })

  test('upsert creates new cache entry', () => {
    const data = { current: { temperature: 72 } }
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    upsertCache(db, 'weather_40.7_-74.0', data, expiresAt)

    const row = getCache(db, 'weather_40.7_-74.0')
    expect(row).not.toBeNull()
    expect(row!.source).toBe('weather_40.7_-74.0')
    expect(JSON.parse(row!.data)).toEqual(data)
    expect(row!.fetched_at).toBeTruthy()
    expect(row!.expires_at).toBe(expiresAt)
  })

  test('upsert updates existing cache entry', () => {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    upsertCache(db, 'weather_40.7_-74.0', { temp: 70 }, expiresAt)

    const newData = { temp: 75 }
    const newExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    upsertCache(db, 'weather_40.7_-74.0', newData, newExpires)

    const row = getCache(db, 'weather_40.7_-74.0')
    expect(row).not.toBeNull()
    expect(JSON.parse(row!.data)).toEqual(newData)
    expect(row!.expires_at).toBe(newExpires)

    // Should still be only one row
    const count = db.prepare('SELECT COUNT(*) as cnt FROM cache WHERE source = ?')
      .get('weather_40.7_-74.0') as { cnt: number }
    expect(count.cnt).toBe(1)
  })

  test('getCacheMultiple returns only matching keys', () => {
    upsertCache(db, 'weather_40.7_-74.0', { temp: 72 }, null)
    upsertCache(db, 'google_calendar_primary_7', { events: [] }, null)
    upsertCache(db, 'ics_calendar_1', { events: [{ title: 'Meeting' }] }, null)

    const result = getCacheMultiple(db, ['weather_40.7_-74.0', 'ics_calendar_1', 'nonexistent_key'])
    expect(result.size).toBe(2)
    expect(result.get('weather_40.7_-74.0')).toEqual({ temp: 72 })
    expect(result.get('ics_calendar_1')).toEqual({ events: [{ title: 'Meeting' }] })
    expect(result.has('nonexistent_key')).toBe(false)
  })

  test('getCacheMultiple returns empty map for empty input', () => {
    const result = getCacheMultiple(db, [])
    expect(result.size).toBe(0)
  })

  test('isCacheFresh returns true for future expiry', () => {
    const futureExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    upsertCache(db, 'weather_40.7_-74.0', { temp: 72 }, futureExpiry)

    expect(isCacheFresh(db, 'weather_40.7_-74.0')).toBe(true)
  })

  test('isCacheFresh returns false for past expiry', () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString()
    upsertCache(db, 'weather_40.7_-74.0', { temp: 72 }, pastExpiry)

    expect(isCacheFresh(db, 'weather_40.7_-74.0')).toBe(false)
  })

  test('isCacheFresh returns false for nonexistent source', () => {
    expect(isCacheFresh(db, 'nonexistent')).toBe(false)
  })

  test('isCacheFresh returns false for null expires_at', () => {
    upsertCache(db, 'weather_40.7_-74.0', { temp: 72 }, null)

    expect(isCacheFresh(db, 'weather_40.7_-74.0')).toBe(false)
  })
})
