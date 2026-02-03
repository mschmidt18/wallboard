import { describe, test, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from '@server/db/connection.js'
import {
  listIcsCalendars,
  createIcsCalendar,
  updateIcsCalendar,
  deleteIcsCalendar,
} from './ics-calendars.js'

describe('ics calendar queries', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  test('list returns empty array initially', () => {
    const result = listIcsCalendars(db)
    expect(result).toEqual([])
  })

  test('create ics calendar with all fields', () => {
    const cal = createIcsCalendar(db, {
      name: 'Work Calendar',
      url: 'https://example.com/cal.ics',
      color: '#ff0000',
    })
    expect(cal.id).toBeTypeOf('number')
    expect(cal.name).toBe('Work Calendar')
    expect(cal.url).toBe('https://example.com/cal.ics')
    expect(cal.color).toBe('#ff0000')
    expect(cal.created_at).toBeTruthy()
    expect(cal.updated_at).toBeTruthy()
  })

  test('create ics calendar with default color', () => {
    const cal = createIcsCalendar(db, {
      name: 'Personal',
      url: 'https://example.com/personal.ics',
    })
    expect(cal.color).toBe('#6366f1')
  })

  test('list returns all calendars', () => {
    createIcsCalendar(db, { name: 'Cal 1', url: 'https://example.com/1.ics' })
    createIcsCalendar(db, { name: 'Cal 2', url: 'https://example.com/2.ics' })
    const list = listIcsCalendars(db)
    expect(list).toHaveLength(2)
    expect(list[0].name).toBe('Cal 1')
    expect(list[1].name).toBe('Cal 2')
  })

  test('update ics calendar partial fields', () => {
    const cal = createIcsCalendar(db, {
      name: 'Old Name',
      url: 'https://example.com/old.ics',
    })
    const updated = updateIcsCalendar(db, cal.id, { name: 'New Name' })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('New Name')
    expect(updated!.url).toBe('https://example.com/old.ics')
  })

  test('update nonexistent returns null', () => {
    const result = updateIcsCalendar(db, 9999, { name: 'No Such' })
    expect(result).toBeNull()
  })

  test('delete ics calendar returns true', () => {
    const cal = createIcsCalendar(db, {
      name: 'To Delete',
      url: 'https://example.com/del.ics',
    })
    const deleted = deleteIcsCalendar(db, cal.id)
    expect(deleted).toBe(true)
    expect(listIcsCalendars(db)).toHaveLength(0)
  })

  test('delete nonexistent returns false', () => {
    const deleted = deleteIcsCalendar(db, 9999)
    expect(deleted).toBe(false)
  })
})
