import type { ScheduleRuleResponse } from '@shared/types.js'

export interface ScheduleResult {
  rule_id: number
  layout_id: number | null
  display_power: 'on' | 'off'
}

/**
 * Evaluate schedule rules against the current time.
 * Rules are expected to be sorted by sort_order (first match wins).
 * Returns null if no rule matches.
 */
export function evaluateSchedule(rules: ScheduleRuleResponse[], now: Date): ScheduleResult | null {
  // Convert JS getDay() (0=Sun) to ISO day (1=Mon..7=Sun)
  const jsDay = now.getDay()
  const day = jsDay === 0 ? 7 : jsDay
  const prevDay = day === 1 ? 7 : day - 1

  const minutes = now.getHours() * 60 + now.getMinutes()

  for (const rule of rules) {
    const startMinutes = parseTime(rule.start_time)
    const endMinutes = parseTime(rule.end_time)

    let matches = false

    if (startMinutes === endMinutes) {
      // All-day rule: match if day is in days_of_week
      matches = rule.days_of_week.includes(day)
    } else if (startMinutes < endMinutes) {
      // Normal range (e.g., 09:00-17:00)
      matches = rule.days_of_week.includes(day) && minutes >= startMinutes && minutes < endMinutes
    } else {
      // Midnight-spanning (e.g., 22:00-06:00)
      // Match if: (day in days AND time >= start) OR (prev day in days AND time < end)
      matches =
        (rule.days_of_week.includes(day) && minutes >= startMinutes) ||
        (rule.days_of_week.includes(prevDay) && minutes < endMinutes)
    }

    if (matches) {
      return {
        rule_id: rule.id,
        layout_id: rule.layout_id,
        display_power: rule.layout_id === null ? 'off' : 'on',
      }
    }
  }

  return null
}

function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
