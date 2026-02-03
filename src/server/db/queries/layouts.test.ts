import { describe, test, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from '@server/db/connection.js'
import {
  createLayout,
  listLayouts,
  getLayout,
  updateLayout,
  deleteLayout,
  activateLayout,
} from './layouts.js'

describe('layout queries', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  test('create layout with defaults', () => {
    const layout = createLayout(db, { name: 'Test Layout' })
    expect(layout.id).toBeDefined()
    expect(layout.name).toBe('Test Layout')
    expect(layout.columns).toBe(12)
    expect(layout.row_height).toBe(80)
    expect(layout.is_active).toBe(false)
    expect(layout.theme).toEqual({})
    expect(layout.widgets).toEqual([])
    expect(layout.created_at).toBeDefined()
    expect(layout.updated_at).toBeDefined()
  })

  test('create layout with custom values', () => {
    const layout = createLayout(db, {
      name: 'Custom',
      columns: 6,
      row_height: 100,
      theme: { background: '#000000' },
    })
    expect(layout.name).toBe('Custom')
    expect(layout.columns).toBe(6)
    expect(layout.row_height).toBe(100)
    expect(layout.theme).toEqual({ background: '#000000' })
  })

  test('list layouts returns widget_count', () => {
    const layout = createLayout(db, { name: 'Layout 1' })
    // Insert a widget directly
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
       VALUES (?, 'clock', '{}', 0, 0, 3, 2, ?, ?)`
    ).run(layout.id, now, now)

    createLayout(db, { name: 'Layout 2' })

    const list = listLayouts(db)
    expect(list).toHaveLength(2)
    const first = list.find((l) => l.name === 'Layout 1')!
    const second = list.find((l) => l.name === 'Layout 2')!
    expect(first.widget_count).toBe(1)
    expect(second.widget_count).toBe(0)
  })

  test('get layout includes nested widgets', () => {
    const layout = createLayout(db, { name: 'With Widgets' })
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
       VALUES (?, 'weather', '{"units":"metric"}', 0, 0, 4, 3, ?, ?)`
    ).run(layout.id, now, now)

    const result = getLayout(db, layout.id)
    expect(result).not.toBeNull()
    expect(result!.widgets).toHaveLength(1)
    expect(result!.widgets[0].widget_type).toBe('weather')
    expect(result!.widgets[0].config).toEqual({ units: 'metric' })
  })

  test('update layout partial fields', () => {
    const layout = createLayout(db, { name: 'Original', columns: 12 })
    const updated = updateLayout(db, layout.id, { name: 'Renamed' })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('Renamed')
    expect(updated!.columns).toBe(12) // unchanged
  })

  test('update sets updated_at', () => {
    const layout = createLayout(db, { name: 'Test' })
    // Manually set created_at/updated_at to an old timestamp
    db.prepare('UPDATE layouts SET created_at = ?, updated_at = ? WHERE id = ?')
      .run('2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', layout.id)
    const updated = updateLayout(db, layout.id, { name: 'Changed' })
    expect(updated!.updated_at).not.toBe('2020-01-01T00:00:00.000Z')
  })

  test('delete layout cascades to widgets', () => {
    const layout = createLayout(db, { name: 'To Delete' })
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
       VALUES (?, 'clock', '{}', 0, 0, 3, 2, ?, ?)`
    ).run(layout.id, now, now)

    const deleted = deleteLayout(db, layout.id)
    expect(deleted).toBe(true)

    const widgetCount = db.prepare('SELECT COUNT(*) as count FROM widgets WHERE layout_id = ?').get(layout.id) as { count: number }
    expect(widgetCount.count).toBe(0)
  })

  test('delete nonexistent returns false', () => {
    expect(deleteLayout(db, 999)).toBe(false)
  })

  test('activate layout deactivates others', () => {
    const layout1 = createLayout(db, { name: 'Layout 1' })
    const layout2 = createLayout(db, { name: 'Layout 2' })

    const activated1 = activateLayout(db, layout1.id)
    expect(activated1!.is_active).toBe(true)

    const activated2 = activateLayout(db, layout2.id)
    expect(activated2!.is_active).toBe(true)

    // layout1 should now be inactive
    const refreshed1 = getLayout(db, layout1.id)
    expect(refreshed1!.is_active).toBe(false)
  })

  test('get nonexistent returns null', () => {
    expect(getLayout(db, 999)).toBeNull()
  })

  test('update layout row_height only', () => {
    const layout = createLayout(db, { name: 'Test', columns: 12, row_height: 80 })
    const updated = updateLayout(db, layout.id, { row_height: 120 })
    expect(updated).not.toBeNull()
    expect(updated!.row_height).toBe(120)
    expect(updated!.name).toBe('Test')
    expect(updated!.columns).toBe(12)
  })

  test('update layout theme only', () => {
    const layout = createLayout(db, { name: 'Test' })
    const updated = updateLayout(db, layout.id, { theme: { background: '#111' } })
    expect(updated).not.toBeNull()
    expect(updated!.theme).toEqual({ background: '#111' })
    expect(updated!.name).toBe('Test')
  })
})
