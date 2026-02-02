import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch
from server.app.services.weather import fetch_weather


MOCK_OPEN_METEO_RESPONSE = {
    "current": {
        "temperature_2m": 22.5,
        "apparent_temperature": 21.0,
        "weather_code": 1,
        "wind_speed_10m": 12.3,
        "relative_humidity_2m": 65,
    },
    "daily": {
        "time": ["2026-02-01", "2026-02-02"],
        "temperature_2m_max": [24.0, 22.0],
        "temperature_2m_min": [15.0, 14.0],
        "weather_code": [1, 3],
    },
}


@pytest.mark.asyncio
async def test_fetch_weather_returns_normalized_data():
    mock_response = MagicMock()
    mock_response.json.return_value = MOCK_OPEN_METEO_RESPONSE
    mock_response.raise_for_status = MagicMock()

    with patch("server.app.services.weather.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.get.return_value = mock_response
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance

        result = await fetch_weather(lat=40.7, lon=-74.0, units="imperial")

    assert "current" in result
    assert "daily" in result
    assert result["current"]["temperature"] == 22.5
    assert len(result["daily"]) == 2


@pytest.mark.asyncio
async def test_fetch_weather_handles_api_error():
    with patch("server.app.services.weather.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.get.side_effect = httpx.HTTPError("Connection failed")
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance

        with pytest.raises(httpx.HTTPError):
            await fetch_weather(lat=40.7, lon=-74.0, units="imperial")
