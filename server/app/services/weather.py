import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with heavy hail",
}


async def fetch_weather(lat: float, lon: float, units: str = "metric") -> dict:
    """Fetch current weather and 7-day forecast from Open-Meteo."""
    temperature_unit = "fahrenheit" if units == "imperial" else "celsius"
    wind_unit = "mph" if units == "imperial" else "kmh"

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m",
        "daily": "temperature_2m_max,temperature_2m_min,weather_code",
        "temperature_unit": temperature_unit,
        "wind_speed_unit": wind_unit,
        "timezone": "auto",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(OPEN_METEO_URL, params=params, timeout=10.0)
        response.raise_for_status()
        raw = response.json()

    current = raw["current"]
    daily = raw["daily"]

    return {
        "current": {
            "temperature": current["temperature_2m"],
            "feels_like": current["apparent_temperature"],
            "condition": WEATHER_CODES.get(current["weather_code"], "Unknown"),
            "weather_code": current["weather_code"],
            "wind_speed": current["wind_speed_10m"],
            "humidity": current["relative_humidity_2m"],
            "units": units,
        },
        "daily": [
            {
                "date": daily["time"][i],
                "high": daily["temperature_2m_max"][i],
                "low": daily["temperature_2m_min"][i],
                "condition": WEATHER_CODES.get(daily["weather_code"][i], "Unknown"),
                "weather_code": daily["weather_code"][i],
            }
            for i in range(len(daily["time"]))
        ],
    }
