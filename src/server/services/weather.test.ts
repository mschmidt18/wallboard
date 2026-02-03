import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWeather, WEATHER_CODES } from './weather.js'

const MOCK_OPEN_METEO_RESPONSE = {
  current: {
    temperature_2m: 22.5,
    apparent_temperature: 21.0,
    weather_code: 1,
    wind_speed_10m: 12.3,
    relative_humidity_2m: 65,
  },
  daily: {
    time: ['2026-02-01', '2026-02-02'],
    temperature_2m_max: [24.0, 22.0],
    temperature_2m_min: [15.0, 14.0],
    weather_code: [1, 3],
  },
}

describe('weather service', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns normalized weather data with metric units', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_OPEN_METEO_RESPONSE),
    })

    const result = await fetchWeather(40.7, -74.0, 'metric')

    expect(result.current.temperature).toBe(22.5)
    expect(result.current.feels_like).toBe(21.0)
    expect(result.current.condition).toBe('Mainly clear')
    expect(result.current.weather_code).toBe(1)
    expect(result.current.wind_speed).toBe(12.3)
    expect(result.current.humidity).toBe(65)
    expect(result.current.units).toBe('metric')

    expect(result.daily).toHaveLength(2)
    expect(result.daily[0]).toEqual({
      date: '2026-02-01',
      high: 24.0,
      low: 15.0,
      condition: 'Mainly clear',
      weather_code: 1,
    })
    expect(result.daily[1]).toEqual({
      date: '2026-02-02',
      high: 22.0,
      low: 14.0,
      condition: 'Overcast',
      weather_code: 3,
    })

    // Verify correct API URL and params
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = new URL(call[0])
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(url.searchParams.get('latitude')).toBe('40.7')
    expect(url.searchParams.get('longitude')).toBe('-74')
    expect(url.searchParams.get('temperature_unit')).toBe('celsius')
    expect(url.searchParams.get('wind_speed_unit')).toBe('kmh')
  })

  it('uses imperial units when specified', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_OPEN_METEO_RESPONSE),
    })

    await fetchWeather(40.7, -74.0, 'imperial')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = new URL(call[0])
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit')
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph')
  })

  it('throws on API error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(fetchWeather(40.7, -74.0)).rejects.toThrow()
  })

  it('WEATHER_CODES maps known codes to descriptions', () => {
    expect(WEATHER_CODES[0]).toBe('Clear sky')
    expect(WEATHER_CODES[95]).toBe('Thunderstorm')
    expect(WEATHER_CODES[999]).toBeUndefined()
  })
})
