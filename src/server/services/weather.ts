const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

export const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
}

export interface WeatherData {
  current: {
    temperature: number
    feels_like: number
    condition: string
    weather_code: number
    wind_speed: number
    humidity: number
    units: string
  }
  daily: Array<{
    date: string
    high: number
    low: number
    condition: string
    weather_code: number
  }>
}

export async function fetchWeather(
  lat: number,
  lon: number,
  units: string = 'metric',
): Promise<WeatherData> {
  const temperatureUnit = units === 'imperial' ? 'fahrenheit' : 'celsius'
  const windUnit = units === 'imperial' ? 'mph' : 'kmh'

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code',
    temperature_unit: temperatureUnit,
    wind_speed_unit: windUnit,
    timezone: 'auto',
  })

  const response = await fetch(`${OPEN_METEO_URL}?${params}`, {
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(
      `Weather API error: ${response.status} ${response.statusText}`,
    )
  }

  const raw = await response.json()
  const current = raw.current
  const daily = raw.daily

  return {
    current: {
      temperature: current.temperature_2m,
      feels_like: current.apparent_temperature,
      condition: WEATHER_CODES[current.weather_code] ?? 'Unknown',
      weather_code: current.weather_code,
      wind_speed: current.wind_speed_10m,
      humidity: current.relative_humidity_2m,
      units,
    },
    daily: daily.time.map((_: string, i: number) => ({
      date: daily.time[i],
      high: daily.temperature_2m_max[i],
      low: daily.temperature_2m_min[i],
      condition: WEATHER_CODES[daily.weather_code[i]] ?? 'Unknown',
      weather_code: daily.weather_code[i],
    })),
  }
}
