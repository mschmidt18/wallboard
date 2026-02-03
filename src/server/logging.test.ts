import { describe, expect, it } from 'vitest'
import { buildLoggerOptions } from '@server/logging.js'

describe('buildLoggerOptions', () => {
  it('returns pino options with correct log level', () => {
    const options = buildLoggerOptions('DEBUG')
    expect(options.level).toBe('debug')
  })

  it('uses structlog-compatible key names (event, level, timestamp)', () => {
    const options = buildLoggerOptions('INFO')
    // Pino uses messageKey for the main log message field
    expect(options.messageKey).toBe('event')
    // Pino uses timestamp function for custom timestamp key
    expect(options.timestamp).toBeTypeOf('function')
    // Invoke the timestamp function to verify it produces "timestamp" key with ISO format
    const ts = (options.timestamp as () => string)()
    expect(ts).toMatch(/^,"timestamp":"/)
    // Verify it's ISO format
    const value = ts.replace(/^,"timestamp":"/, '').replace(/"$/, '')
    expect(() => new Date(value)).not.toThrow()
    expect(new Date(value).toISOString()).toBe(value)
  })
})
