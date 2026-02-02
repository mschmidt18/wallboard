"""Tests for ICS calendar parsing service (Task 2.3)."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

# Fixed "now" for all tests: Jan 10, 2025 — before all test events
FAKE_NOW = datetime(2025, 1, 10, tzinfo=timezone.utc)

import httpx
import pytest


# --- Sample ICS data ---

SIMPLE_ICS = """\
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:Team Standup
END:VEVENT
BEGIN:VEVENT
DTSTART:20250116T140000Z
DTEND:20250116T150000Z
SUMMARY:Design Review
END:VEVENT
END:VCALENDAR
"""

ALL_DAY_ICS = """\
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:20250120
DTEND;VALUE=DATE:20250121
SUMMARY:Company Holiday
END:VEVENT
END:VCALENDAR
"""

RECURRING_ICS = """\
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART:20250113T090000Z
DTEND:20250113T093000Z
SUMMARY:Daily Scrum
RRULE:FREQ=DAILY;COUNT=10
END:VEVENT
END:VCALENDAR
"""

TIMEZONE_ICS = """\
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:STANDARD
DTSTART:19701101T020000
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700308T020000
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20250115T100000
DTEND;TZID=America/New_York:20250115T110000
SUMMARY:NYC Meeting
END:VEVENT
END:VCALENDAR
"""

INVALID_ICS = "This is not valid ICS content at all."


def _mock_httpx_response(content: str, status_code: int = 200):
    """Create a mock httpx response with given ICS content."""
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.text = content
    response.raise_for_status = MagicMock()
    if status_code >= 400:
        response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error", request=MagicMock(), response=response
        )
    return response


def _make_async_client(response):
    """Create a mock async httpx client context manager."""
    client_instance = AsyncMock()
    client_instance.get.return_value = response
    client_instance.__aenter__ = AsyncMock(return_value=client_instance)
    client_instance.__aexit__ = AsyncMock(return_value=False)
    return client_instance


@pytest.mark.asyncio
async def test_parse_simple_events():
    """Fetching an ICS URL with two simple events returns correctly shaped output."""
    from server.app.services.ical_service import fetch_ics_events

    response = _mock_httpx_response(SIMPLE_ICS)
    client_instance = _make_async_client(response)

    with patch("server.app.services.ical_service.httpx.AsyncClient") as MockClient, \
         patch("server.app.services.ical_service._utcnow", return_value=FAKE_NOW):
        MockClient.return_value = client_instance

        events = await fetch_ics_events(
            url="https://example.com/cal.ics",
            days_ahead=30,
            calendar_name="Work",
            color="#ff5733",
        )

    assert len(events) == 2
    # Check event shape
    for event in events:
        assert "title" in event
        assert "start" in event
        assert "end" in event
        assert "calendar_name" in event
        assert "color" in event
        assert "all_day" in event

    titles = {e["title"] for e in events}
    assert "Team Standup" in titles
    assert "Design Review" in titles

    # Verify calendar_name and color are set from arguments
    for event in events:
        assert event["calendar_name"] == "Work"
        assert event["color"] == "#ff5733"
        assert event["all_day"] is False


@pytest.mark.asyncio
async def test_parse_all_day_event():
    """DATE-only events should have all_day set to True."""
    from server.app.services.ical_service import fetch_ics_events

    response = _mock_httpx_response(ALL_DAY_ICS)
    client_instance = _make_async_client(response)

    with patch("server.app.services.ical_service.httpx.AsyncClient") as MockClient, \
         patch("server.app.services.ical_service._utcnow", return_value=FAKE_NOW):
        MockClient.return_value = client_instance

        events = await fetch_ics_events(
            url="https://example.com/cal.ics",
            days_ahead=30,
            calendar_name="Holidays",
            color="#22c55e",
        )

    assert len(events) == 1
    event = events[0]
    assert event["title"] == "Company Holiday"
    assert event["all_day"] is True
    # all-day events should have date strings (YYYY-MM-DD), not datetime
    assert "T" not in event["start"]


@pytest.mark.asyncio
async def test_parse_recurring_event():
    """ICS with RRULE should expand instances within the date range."""
    from server.app.services.ical_service import fetch_ics_events

    response = _mock_httpx_response(RECURRING_ICS)
    client_instance = _make_async_client(response)

    with patch("server.app.services.ical_service.httpx.AsyncClient") as MockClient, \
         patch("server.app.services.ical_service._utcnow", return_value=FAKE_NOW):
        MockClient.return_value = client_instance

        # Date range covers all 10 occurrences (Jan 13–22)
        events = await fetch_ics_events(
            url="https://example.com/cal.ics",
            days_ahead=30,
            calendar_name="Scrum",
            color="#6366f1",
        )

    # RRULE FREQ=DAILY;COUNT=10 starting Jan 13 => 10 instances
    assert len(events) == 10
    for event in events:
        assert event["title"] == "Daily Scrum"


@pytest.mark.asyncio
async def test_timezone_handling():
    """Events with TZID should produce ISO-format output."""
    from server.app.services.ical_service import fetch_ics_events

    response = _mock_httpx_response(TIMEZONE_ICS)
    client_instance = _make_async_client(response)

    with patch("server.app.services.ical_service.httpx.AsyncClient") as MockClient, \
         patch("server.app.services.ical_service._utcnow", return_value=FAKE_NOW):
        MockClient.return_value = client_instance

        events = await fetch_ics_events(
            url="https://example.com/cal.ics",
            days_ahead=30,
            calendar_name="NYC",
            color="#0ea5e9",
        )

    assert len(events) == 1
    event = events[0]
    assert event["title"] == "NYC Meeting"
    # Start should be in ISO format
    # The event is 10:00 EST = 15:00 UTC
    assert "2025-01-15" in event["start"]


@pytest.mark.asyncio
async def test_network_error():
    """Network errors during fetch should raise an appropriate exception."""
    from server.app.services.ical_service import fetch_ics_events

    client_instance = AsyncMock()
    client_instance.get.side_effect = httpx.ConnectError("Connection refused")
    client_instance.__aenter__ = AsyncMock(return_value=client_instance)
    client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("server.app.services.ical_service.httpx.AsyncClient") as MockClient:
        MockClient.return_value = client_instance

        with pytest.raises(httpx.ConnectError):
            await fetch_ics_events(
                url="https://example.com/cal.ics",
                days_ahead=7,
                calendar_name="Down",
                color="#ef4444",
            )


@pytest.mark.asyncio
async def test_invalid_ics_content():
    """Garbage ICS content should be handled gracefully (return empty list)."""
    from server.app.services.ical_service import fetch_ics_events

    response = _mock_httpx_response(INVALID_ICS)
    client_instance = _make_async_client(response)

    with patch("server.app.services.ical_service.httpx.AsyncClient") as MockClient:
        MockClient.return_value = client_instance

        events = await fetch_ics_events(
            url="https://example.com/cal.ics",
            days_ahead=7,
            calendar_name="Bad",
            color="#ef4444",
        )

    # Invalid content should return empty list, not crash
    assert events == []
