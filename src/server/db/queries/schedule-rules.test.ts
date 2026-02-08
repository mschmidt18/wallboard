import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from '../connection.js'
import {
  listScheduleRules,
  listEnabledScheduleRules,
  getScheduleRule,
  createScheduleRule,
  updateScheduleRule,
  deleteScheduleRule,
  reorderScheduleRules,
} from './schedule-rules.js'

describe('schedule-rules queries', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  function createLayout(name = 'Test Layout'): number {
    const now = new Date().toISOString()
    const result = db.prepare(
      'INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at) VALUES (?, 12, 80, 0, ?, ?, ?)'
    ).run(name, '{}', now, now)
    return Number(result.lastInsertRowid)
  }

  it('listScheduleRules returns empty array on fresh DB', () => {
    expect(listScheduleRules(db)).toEqual([])
  })

  it('createScheduleRule returns correct response shape', () => {
    const layoutId = createLayout()
    const rule = createScheduleRule(db, {
      layout_id: layoutId,
      days_of_week: [1, 2, 3, 4, 5],
      start_time: '09:00',
      end_time: '17:00',
    })

    expect(rule.id).toBeDefined()
    expect(rule.layout_id).toBe(layoutId)
    expect(rule.days_of_week).toEqual([1, 2, 3, 4, 5])
    expect(rule.start_time).toBe('09:00')
    expect(rule.end_time).toBe('17:00')
    expect(rule.sort_order).toBe(0)
    expect(rule.enabled).toBe(true)
    expect(rule.created_at).toBeDefined()
    expect(rule.updated_at).toBeDefined()
  })

  it('createScheduleRule auto-increments sort_order', () => {
    const layoutId = createLayout()
    const r1 = createScheduleRule(db, { layout_id: layoutId, days_of_week: [1], start_time: '09:00', end_time: '17:00' })
    const r2 = createScheduleRule(db, { layout_id: layoutId, days_of_week: [2], start_time: '09:00', end_time: '17:00' })
    const r3 = createScheduleRule(db, { layout_id: layoutId, days_of_week: [3], start_time: '09:00', end_time: '17:00' })

    expect(r1.sort_order).toBe(0)
    expect(r2.sort_order).toBe(1)
    expect(r3.sort_order).toBe(2)
  })

  it('createScheduleRule with layout_id: null (display off)', () => {
    const rule = createScheduleRule(db, {
      layout_id: null,
      days_of_week: [6, 7],
      start_time: '22:00',
      end_time: '06:00',
    })

    expect(rule.layout_id).toBeNull()
    expect(rule.days_of_week).toEqual([6, 7])
  })

  it('getScheduleRule returns rule by ID', () => {
    const layoutId = createLayout()
    const created = createScheduleRule(db, { layout_id: layoutId, days_of_week: [1], start_time: '08:00', end_time: '12:00' })
    const fetched = getScheduleRule(db, created.id)
    expect(fetched).toEqual(created)
  })

  it('getScheduleRule returns null for nonexistent', () => {
    expect(getScheduleRule(db, 9999)).toBeNull()
  })

  it('updateScheduleRule partial update', () => {
    const layoutId = createLayout()
    const created = createScheduleRule(db, { layout_id: layoutId, days_of_week: [1, 2], start_time: '09:00', end_time: '17:00' })

    const updated = updateScheduleRule(db, created.id, { start_time: '10:00' })
    expect(updated).not.toBeNull()
    expect(updated!.start_time).toBe('10:00')
    expect(updated!.end_time).toBe('17:00') // unchanged
    expect(updated!.days_of_week).toEqual([1, 2]) // unchanged
  })

  it('updateScheduleRule returns null for nonexistent ID', () => {
    expect(updateScheduleRule(db, 9999, { start_time: '10:00' })).toBeNull()
  })

  it('deleteScheduleRule returns true for existing', () => {
    const layoutId = createLayout()
    const rule = createScheduleRule(db, { layout_id: layoutId, days_of_week: [1], start_time: '09:00', end_time: '17:00' })
    expect(deleteScheduleRule(db, rule.id)).toBe(true)
  })

  it('deleteScheduleRule returns false for nonexistent', () => {
    expect(deleteScheduleRule(db, 9999)).toBe(false)
  })

  it('deleteScheduleRule removes rule from list', () => {
    const layoutId = createLayout()
    const rule = createScheduleRule(db, { layout_id: layoutId, days_of_week: [1], start_time: '09:00', end_time: '17:00' })
    deleteScheduleRule(db, rule.id)
    expect(listScheduleRules(db)).toHaveLength(0)
  })

  it('reorderScheduleRules batch updates sort_order values', () => {
    const layoutId = createLayout()
    const r1 = createScheduleRule(db, { layout_id: layoutId, days_of_week: [1], start_time: '09:00', end_time: '17:00' })
    const r2 = createScheduleRule(db, { layout_id: layoutId, days_of_week: [2], start_time: '09:00', end_time: '17:00' })
    const r3 = createScheduleRule(db, { layout_id: layoutId, days_of_week: [3], start_time: '09:00', end_time: '17:00' })

    // Reverse order
    reorderScheduleRules(db, [
      { id: r3.id, sort_order: 0 },
      { id: r2.id, sort_order: 1 },
      { id: r1.id, sort_order: 2 },
    ])

    const list = listScheduleRules(db)
    expect(list[0].id).toBe(r3.id)
    expect(list[0].sort_order).toBe(0)
    expect(list[1].id).toBe(r2.id)
    expect(list[1].sort_order).toBe(1)
    expect(list[2].id).toBe(r1.id)
    expect(list[2].sort_order).toBe(2)
  })

  it('listEnabledScheduleRules excludes disabled rules', () => {
    const layoutId = createLayout()
    createScheduleRule(db, { layout_id: layoutId, days_of_week: [1], start_time: '09:00', end_time: '17:00' })
    const disabled = createScheduleRule(db, { layout_id: layoutId, days_of_week: [2], start_time: '09:00', end_time: '17:00', enabled: false })

    const all = listScheduleRules(db)
    expect(all).toHaveLength(2)

    const enabled = listEnabledScheduleRules(db)
    expect(enabled).toHaveLength(1)
    expect(enabled[0].id).not.toBe(disabled.id)
  })

  it('cascade: deleting layout removes associated rule', () => {
    const layoutId = createLayout()
    createScheduleRule(db, { layout_id: layoutId, days_of_week: [1], start_time: '09:00', end_time: '17:00' })
    expect(listScheduleRules(db)).toHaveLength(1)

    db.prepare('DELETE FROM layouts WHERE id = ?').run(layoutId)
    expect(listScheduleRules(db)).toHaveLength(0)
  })

  it('days_of_week round-trips correctly', () => {
    const layoutId = createLayout()
    const rule = createScheduleRule(db, { layout_id: layoutId, days_of_week: [1, 3, 5], start_time: '09:00', end_time: '17:00' })
    const fetched = getScheduleRule(db, rule.id)
    expect(fetched!.days_of_week).toEqual([1, 3, 5])
  })
})
