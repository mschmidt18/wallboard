import { describe, test, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from '@server/db/connection.js'
import { createLayout } from './layouts.js'
import {
  createWidget,
  getWidget,
  updateWidget,
  deleteWidget,
  batchUpdatePositions,
  getWidgetsByLayout,
} from './widgets.js'

describe('widget queries', () => {
  let db: Database.Database
  let layoutId: number

  beforeEach(() => {
    db = createTestDb()
    const layout = createLayout(db, { name: 'Test Layout' })
    layoutId = layout.id
  })

  test('create widget in layout', () => {
    const widget = createWidget(db, layoutId, {
      widget_type: 'clock',
      config: {},
      position_x: 0,
      position_y: 0,
      width: 3,
      height: 2,
    })
    expect(widget.id).toBeDefined()
    expect(widget.layout_id).toBe(layoutId)
    expect(widget.widget_type).toBe('clock')
    expect(widget.config).toEqual({})
    expect(widget.position_x).toBe(0)
    expect(widget.position_y).toBe(0)
    expect(widget.width).toBe(3)
    expect(widget.height).toBe(2)
    expect(widget.created_at).toBeDefined()
    expect(widget.updated_at).toBeDefined()
  })

  test('create widget fails for nonexistent layout', () => {
    expect(() =>
      createWidget(db, 999, {
        widget_type: 'clock',
        config: {},
        position_x: 0,
        position_y: 0,
        width: 3,
        height: 2,
      })
    ).toThrow()
  })

  test('get widget by id', () => {
    const widget = createWidget(db, layoutId, {
      widget_type: 'weather',
      config: { units: 'metric' },
      position_x: 1,
      position_y: 2,
      width: 4,
      height: 3,
    })
    const found = getWidget(db, widget.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(widget.id)
    expect(found!.widget_type).toBe('weather')
    expect(found!.config).toEqual({ units: 'metric' })
  })

  test('get nonexistent widget returns null', () => {
    expect(getWidget(db, 999)).toBeNull()
  })

  test('update widget config', () => {
    const widget = createWidget(db, layoutId, {
      widget_type: 'weather',
      config: { units: 'metric' },
      position_x: 0,
      position_y: 0,
      width: 4,
      height: 3,
    })
    const updated = updateWidget(db, widget.id, {
      config: { units: 'imperial', zip_code: '10001' },
    })
    expect(updated).not.toBeNull()
    expect(updated!.config).toEqual({ units: 'imperial', zip_code: '10001' })
    expect(updated!.position_x).toBe(0) // unchanged
  })

  test('update nonexistent widget returns null', () => {
    expect(updateWidget(db, 999, { config: {} })).toBeNull()
  })

  test('batch update positions', () => {
    const w1 = createWidget(db, layoutId, {
      widget_type: 'clock',
      config: {},
      position_x: 0,
      position_y: 0,
      width: 3,
      height: 2,
    })
    const w2 = createWidget(db, layoutId, {
      widget_type: 'notes',
      config: {},
      position_x: 3,
      position_y: 0,
      width: 3,
      height: 2,
    })

    batchUpdatePositions(db, layoutId, [
      { id: w1.id, position_x: 6, position_y: 1, width: 4, height: 3 },
      { id: w2.id, position_x: 0, position_y: 4, width: 6, height: 4 },
    ])

    const updated1 = getWidget(db, w1.id)!
    expect(updated1.position_x).toBe(6)
    expect(updated1.position_y).toBe(1)
    expect(updated1.width).toBe(4)
    expect(updated1.height).toBe(3)

    const updated2 = getWidget(db, w2.id)!
    expect(updated2.position_x).toBe(0)
    expect(updated2.position_y).toBe(4)
    expect(updated2.width).toBe(6)
    expect(updated2.height).toBe(4)
  })

  test('delete widget', () => {
    const widget = createWidget(db, layoutId, {
      widget_type: 'clock',
      config: {},
      position_x: 0,
      position_y: 0,
      width: 3,
      height: 2,
    })
    expect(deleteWidget(db, widget.id)).toBe(true)
    expect(getWidget(db, widget.id)).toBeNull()
  })

  test('delete nonexistent widget returns false', () => {
    expect(deleteWidget(db, 999)).toBe(false)
  })

  test('get widgets by layout', () => {
    createWidget(db, layoutId, {
      widget_type: 'clock',
      config: {},
      position_x: 0,
      position_y: 0,
      width: 3,
      height: 2,
    })
    createWidget(db, layoutId, {
      widget_type: 'weather',
      config: { units: 'metric' },
      position_x: 3,
      position_y: 0,
      width: 4,
      height: 3,
    })

    const widgets = getWidgetsByLayout(db, layoutId)
    expect(widgets).toHaveLength(2)
    expect(widgets.map((w) => w.widget_type).sort()).toEqual(['clock', 'weather'])
  })

  test('get widgets by layout returns empty for no widgets', () => {
    const widgets = getWidgetsByLayout(db, layoutId)
    expect(widgets).toHaveLength(0)
  })

  test('update widget position fields individually', () => {
    const widget = createWidget(db, layoutId, {
      widget_type: 'clock',
      config: {},
      position_x: 0,
      position_y: 0,
      width: 3,
      height: 2,
    })

    const u1 = updateWidget(db, widget.id, { position_x: 5 })
    expect(u1!.position_x).toBe(5)
    expect(u1!.position_y).toBe(0)

    const u2 = updateWidget(db, widget.id, { position_y: 3 })
    expect(u2!.position_y).toBe(3)
    expect(u2!.position_x).toBe(5)

    const u3 = updateWidget(db, widget.id, { width: 6 })
    expect(u3!.width).toBe(6)

    const u4 = updateWidget(db, widget.id, { height: 4 })
    expect(u4!.height).toBe(4)
  })
})
