import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from server.app.services.geocoding import geocode_zip, GeocodingError


MOCK_RESPONSE_JSON = {
    "post code": "10001",
    "country": "United States",
    "country abbreviation": "US",
    "places": [
        {
            "place name": "New York",
            "longitude": "-73.9967",
            "state": "New York",
            "state abbreviation": "NY",
            "latitude": "40.7484",
        }
    ],
}


@pytest.mark.asyncio
async def test_geocode_zip_success():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = MOCK_RESPONSE_JSON

    with patch("server.app.services.geocoding.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await geocode_zip("10001")

    assert result["lat"] == 40.7484
    assert result["lon"] == -73.9967
    assert result["location_name"] == "New York, NY"


@pytest.mark.asyncio
async def test_geocode_zip_not_found():
    mock_response = MagicMock()
    mock_response.status_code = 404

    with patch("server.app.services.geocoding.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        with pytest.raises(GeocodingError, match="No location found for zip code: 99999"):
            await geocode_zip("99999")


@pytest.mark.asyncio
async def test_geocode_zip_api_error():
    with patch("server.app.services.geocoding.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get.side_effect = httpx.ConnectError("Connection refused")
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        with pytest.raises(GeocodingError, match="Geocoding service unavailable"):
            await geocode_zip("10001")
