import { describe, it, expect } from 'vitest'
import { evaluateSchedule } from './schedule.js'
import type { ScheduleRuleResponse } from '@shared/types.js'

function makeRule(overrides: Partial<ScheduleRuleResponse> & { id: number }): ScheduleRuleResponse {
  return {
    layout_id: 1,
    days_of_week: [1, 2, 3, 4, 5],
    start_time: '09:00',
    end_time: '17:00',
    sort_order: 0,
    enabled: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('evaluateSchedule', () => {
  it('returns null for empty rules array', () => {
    const result = evaluateSchedule([], new Date('2026-02-03T12:00:00')) // Monday noon
    expect(result).toBeNull()
  })

  it('matches single rule on correct day and time', () => {
    const rules = [makeRule({ id: 1, days_of_week: [1], start_time: '09:00', end_time: '17:00', layout_id: 5 })]
    // Monday 12:00
    const result = evaluateSchedule(rules, new Date('2026-02-02T12:00:00'))
    expect(result).toEqual({ rule_id: 1, layout_id: 5, display_power: 'on' })
  })

  it('returns null when day does not match', () => {
    const rules = [makeRule({ id: 1, days_of_week: [1], start_time: '09:00', end_time: '17:00' })]
    // Tuesday 12:00
    const result = evaluateSchedule(rules, new Date('2026-02-03T12:00:00'))
    expect(result).toBeNull()
  })

  it('returns null when time does not match', () => {
    const rules = [makeRule({ id: 1, days_of_week: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '17:00' })]
    // Monday 08:00
    const result = evaluateSchedule(rules, new Date('2026-02-02T08:00:00'))
    expect(result).toBeNull()
  })

  // Boundary precision
  it('start time is inclusive', () => {
    const rules = [makeRule({ id: 1, days_of_week: [1], start_time: '09:00', end_time: '17:00', layout_id: 2 })]
    // Monday 09:00 exactly
    const result = evaluateSchedule(rules, new Date('2026-02-02T09:00:00'))
    expect(result).toEqual({ rule_id: 1, layout_id: 2, display_power: 'on' })
  })

  it('end time is exclusive', () => {
    const rules = [makeRule({ id: 1, days_of_week: [1], start_time: '09:00', end_time: '17:00' })]
    // Monday 17:00 exactly - should NOT match
    const result = evaluateSchedule(rules, new Date('2026-02-02T17:00:00'))
    expect(result).toBeNull()
  })

  it('16:59 matches but 17:00 does not', () => {
    const rules = [makeRule({ id: 1, days_of_week: [1], start_time: '09:00', end_time: '17:00', layout_id: 3 })]
    expect(evaluateSchedule(rules, new Date('2026-02-02T16:59:00'))).not.toBeNull()
    expect(evaluateSchedule(rules, new Date('2026-02-02T17:00:00'))).toBeNull()
  })

  // Midnight-spanning rules
  describe('midnight-spanning rules (start > end)', () => {
    const rules = [makeRule({
      id: 1, days_of_week: [1, 2, 3, 4, 5], start_time: '22:00', end_time: '06:00', layout_id: null,
    })]

    it('Mon 23:00 matches (current day Mon in days, time >= 22:00)', () => {
      const result = evaluateSchedule(rules, new Date('2026-02-02T23:00:00')) // Monday
      expect(result).toEqual({ rule_id: 1, layout_id: null, display_power: 'off' })
    })

    it('Tue 03:00 matches (previous day Mon in days, time < 06:00)', () => {
      const result = evaluateSchedule(rules, new Date('2026-02-03T03:00:00')) // Tuesday
      expect(result).toEqual({ rule_id: 1, layout_id: null, display_power: 'off' })
    })

    it('Sat 03:00 matches (previous day Fri in days, time < 06:00)', () => {
      const result = evaluateSchedule(rules, new Date('2026-02-07T03:00:00')) // Saturday
      expect(result).toEqual({ rule_id: 1, layout_id: null, display_power: 'off' })
    })

    it('Sun 23:00 does NOT match (Sun not in days)', () => {
      const result = evaluateSchedule(rules, new Date('2026-02-08T23:00:00')) // Sunday
      expect(result).toBeNull()
    })

    it('Mon 03:00 does NOT match (previous day Sun not in days)', () => {
      const result = evaluateSchedule(rules, new Date('2026-02-02T03:00:00')) // Monday, prev = Sunday
      expect(result).toBeNull()
    })

    it('Tue 06:00 does NOT match (end time exclusive)', () => {
      const result = evaluateSchedule(rules, new Date('2026-02-03T06:00:00')) // Tuesday
      expect(result).toBeNull()
    })
  })

  describe('midnight-spanning short rule', () => {
    const rules = [makeRule({
      id: 1, days_of_week: [7], start_time: '23:00', end_time: '01:00', layout_id: 10,
    })]

    it('Sun 23:30 matches', () => {
      const result = evaluateSchedule(rules, new Date('2026-02-08T23:30:00')) // Sunday
      expect(result).toEqual({ rule_id: 1, layout_id: 10, display_power: 'on' })
    })

    it('Mon 00:30 matches (previous day Sun in days)', () => {
      const result = evaluateSchedule(rules, new Date('2026-02-09T00:30:00')) // Monday
      expect(result).toEqual({ rule_id: 1, layout_id: 10, display_power: 'on' })
    })

    it('Sat 23:30 does NOT match', () => {
      const result = evaluateSchedule(rules, new Date('2026-02-07T23:30:00')) // Saturday
      expect(result).toBeNull()
    })
  })

  // All-day rules
  describe('all-day rules (start === end)', () => {
    const rules = [makeRule({
      id: 1, days_of_week: [6, 7], start_time: '00:00', end_time: '00:00', layout_id: 4,
    })]

    it('matches any time on Saturday', () => {
      expect(evaluateSchedule(rules, new Date('2026-02-07T14:30:00'))).not.toBeNull() // Saturday
    })

    it('matches any time on Sunday', () => {
      expect(evaluateSchedule(rules, new Date('2026-02-08T00:00:00'))).not.toBeNull() // Sunday
    })

    it('does not match weekday', () => {
      expect(evaluateSchedule(rules, new Date('2026-02-02T14:30:00'))).toBeNull() // Monday
    })
  })

  // Priority
  describe('priority (first match wins)', () => {
    it('lower sort_order takes precedence', () => {
      const rules = [
        makeRule({ id: 1, sort_order: 0, days_of_week: [1], start_time: '09:00', end_time: '17:00', layout_id: 10 }),
        makeRule({ id: 2, sort_order: 1, days_of_week: [1], start_time: '09:00', end_time: '17:00', layout_id: 20 }),
      ]
      const result = evaluateSchedule(rules, new Date('2026-02-02T12:00:00')) // Monday
      expect(result).toEqual({ rule_id: 1, layout_id: 10, display_power: 'on' })
    })

    it('higher priority rule wins even if second rule also matches', () => {
      const rules = [
        makeRule({ id: 1, sort_order: 0, days_of_week: [1], start_time: '10:00', end_time: '12:00', layout_id: 10 }),
        makeRule({ id: 2, sort_order: 1, days_of_week: [1], start_time: '09:00', end_time: '17:00', layout_id: 20 }),
      ]
      // 11:00 matches both, but rule 1 has lower sort_order
      const result = evaluateSchedule(rules, new Date('2026-02-02T11:00:00'))
      expect(result).toEqual({ rule_id: 1, layout_id: 10, display_power: 'on' })
    })
  })

  // Display power
  it('rule with layout_id: null returns display_power off', () => {
    const rules = [makeRule({ id: 1, days_of_week: [1], start_time: '00:00', end_time: '00:00', layout_id: null })]
    const result = evaluateSchedule(rules, new Date('2026-02-02T12:00:00'))
    expect(result).toEqual({ rule_id: 1, layout_id: null, display_power: 'off' })
  })

  it('rule with layout_id returns display_power on', () => {
    const rules = [makeRule({ id: 1, days_of_week: [1], start_time: '00:00', end_time: '00:00', layout_id: 5 })]
    const result = evaluateSchedule(rules, new Date('2026-02-02T12:00:00'))
    expect(result).toEqual({ rule_id: 1, layout_id: 5, display_power: 'on' })
  })

  // Day-of-week mapping
  describe('day-of-week mapping', () => {
    const rules = [makeRule({ id: 1, days_of_week: [7], start_time: '00:00', end_time: '00:00', layout_id: 1 })]

    it('JavaScript Sunday (getDay()=0) maps to day 7', () => {
      const result = evaluateSchedule(rules, new Date('2026-02-08T12:00:00')) // Sunday
      expect(result).not.toBeNull()
    })

    it('Monday=1 through Saturday=6 maps correctly', () => {
      const monRule = [makeRule({ id: 1, days_of_week: [1], start_time: '00:00', end_time: '00:00', layout_id: 1 })]
      expect(evaluateSchedule(monRule, new Date('2026-02-02T12:00:00'))).not.toBeNull() // Monday
      expect(evaluateSchedule(monRule, new Date('2026-02-03T12:00:00'))).toBeNull() // Tuesday

      const satRule = [makeRule({ id: 1, days_of_week: [6], start_time: '00:00', end_time: '00:00', layout_id: 1 })]
      expect(evaluateSchedule(satRule, new Date('2026-02-07T12:00:00'))).not.toBeNull() // Saturday
    })
  })
})
