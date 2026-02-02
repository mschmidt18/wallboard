import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from server.app.services.google_calendar import fetch_calendars, fetch_events


@pytest.mark.asyncio
async def test_fetch_calendars():
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "items": [
            {"id": "primary", "summary": "My Calendar", "backgroundColor": "#4285f4"},
            {"id": "other", "summary": "Work", "backgroundColor": "#0b8043"},
        ]
    }
    mock_response.raise_for_status = MagicMock()

    with patch("server.app.services.google_calendar.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.get.return_value = mock_response
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance
        calendars = await fetch_calendars(access_token="test-token")

    assert len(calendars) == 2
    assert calendars[0]["id"] == "primary"
    assert calendars[0]["name"] == "My Calendar"


@pytest.mark.asyncio
async def test_fetch_events():
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "items": [
            {"summary": "Team Meeting",
             "start": {"dateTime": "2026-02-01T10:00:00-05:00"},
             "end": {"dateTime": "2026-02-01T11:00:00-05:00"}},
            {"summary": "All Day Event",
             "start": {"date": "2026-02-02"},
             "end": {"date": "2026-02-03"}},
        ]
    }
    mock_response.raise_for_status = MagicMock()

    with patch("server.app.services.google_calendar.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.get.return_value = mock_response
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance
        events = await fetch_events(access_token="test-token", calendar_ids=["primary"], days_ahead=7)

    assert len(events) == 2
    assert events[0]["title"] == "Team Meeting"
    assert events[1]["title"] == "All Day Event"
    assert events[1]["all_day"] is True
