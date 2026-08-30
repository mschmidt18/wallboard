import { describe, it, expect } from 'vitest'
import {
  localIsoDate,
  todaysMenu,
  weekdayName,
  monthDay,
  weekLineCount,
  type SchoolLunchDay,
} from './school-lunch-utils'

const DAYS: SchoolLunchDay[] = [
  { date: '2026-08-31', entrees: ['Turkey Corn Dog'], vegetables: ['Steamed Corn'] },
  { date: '2026-09-01', entrees: ['Black Bean and Cheddar Burrito'], vegetables: [] },
  { date: '2026-09-04', entrees: [], vegetables: [] },
]

describe('localIsoDate', () => {
  it('formats a date as zero-padded YYYY-MM-DD in local time', () => {
    expect(localIsoDate(new Date(2026, 8, 1, 7, 30))).toBe('2026-09-01')
    expect(localIsoDate(new Date(2026, 11, 25))).toBe('2026-12-25')
  })
})

describe('todaysMenu', () => {
  it('returns the day matching today', () => {
    const day = todaysMenu(DAYS, new Date(2026, 8, 1, 7, 30))
    expect(day?.entrees).toEqual(['Black Bean and Cheddar Burrito'])
  })

  it('returns null when today has no entrees (no school)', () => {
    expect(todaysMenu(DAYS, new Date(2026, 8, 4, 7, 30))).toBeNull()
  })

  it('returns null when today is not in the data (weekend)', () => {
    expect(todaysMenu(DAYS, new Date(2026, 8, 5, 7, 30))).toBeNull()
  })
})

describe('weekLineCount', () => {
  it('counts one line per entree', () => {
    expect(
      weekLineCount([
        { date: '2026-08-31', entrees: ['A', 'B', 'C'], vegetables: [] },
        { date: '2026-09-01', entrees: ['D'], vegetables: [] },
      ]),
    ).toBe(4)
  })

  it('counts an empty day as one line (the No school row)', () => {
    expect(
      weekLineCount([
        { date: '2026-08-31', entrees: ['A', 'B'], vegetables: [] },
        { date: '2026-09-04', entrees: [], vegetables: [] },
      ]),
    ).toBe(3)
  })
})

describe('weekdayName', () => {
  it('returns the full weekday name for an ISO date', () => {
    expect(weekdayName('2026-08-31')).toBe('Monday')
    expect(weekdayName('2026-09-04')).toBe('Friday')
  })
})

describe('monthDay', () => {
  it('returns a short month/day label', () => {
    expect(monthDay('2026-09-01')).toBe('Sep 1')
    expect(monthDay('2026-12-25')).toBe('Dec 25')
  })
})
