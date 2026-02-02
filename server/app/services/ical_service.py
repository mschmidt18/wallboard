"""ICS calendar parsing service.

Fetches and parses ICS feeds, expanding recurring events within a date range.
"""

from datetime import date, datetime, timedelta, timezone

import httpx
import icalendar
import recurring_ical_events


def _utcnow() -> datetime:
    """Return current UTC time. Extracted for testability."""
    return datetime.now(timezone.utc)


async def fetch_ics_events(
    url: str,
    days_ahead: int,
    calendar_name: str,
    color: str,
) -> list[dict]:
    """Fetch and parse events from an ICS calendar URL.

    Args:
        url: The ICS feed URL to fetch.
        days_ahead: Number of days ahead to include events for.
        calendar_name: Display name for the calendar source.
        color: Hex color string to assign to events.

    Returns:
        List of normalized event dicts with keys:
        title, start, end, calendar_name, color, all_day.
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=15.0)
        response.raise_for_status()
        ics_text = response.text

    try:
        cal = icalendar.Calendar.from_ical(ics_text)
    except Exception:
        return []

    now = _utcnow()
    start_date = now.date()
    end_date = (now + timedelta(days=days_ahead)).date()

    try:
        recurring = recurring_ical_events.of(cal).between(start_date, end_date)
    except Exception:
        return []

    events: list[dict] = []
    for component in recurring:
        if component.name != "VEVENT":
            continue

        title = str(component.get("SUMMARY", "(No title)"))
        dtstart = component.get("DTSTART")
        dtend = component.get("DTEND")

        if dtstart is None:
            continue

        dtstart_val = dtstart.dt if hasattr(dtstart, "dt") else dtstart
        dtend_val = dtend.dt if dtend and hasattr(dtend, "dt") else dtend

        all_day = isinstance(dtstart_val, date) and not isinstance(dtstart_val, datetime)

        if all_day:
            start_str = dtstart_val.isoformat()
            end_str = dtend_val.isoformat() if dtend_val else start_str
        else:
            # Ensure datetime has timezone info
            if isinstance(dtstart_val, datetime) and dtstart_val.tzinfo is None:
                dtstart_val = dtstart_val.replace(tzinfo=timezone.utc)
            if isinstance(dtend_val, datetime) and dtend_val.tzinfo is None:
                dtend_val = dtend_val.replace(tzinfo=timezone.utc)
            start_str = dtstart_val.isoformat()
            end_str = dtend_val.isoformat() if dtend_val else start_str

        events.append({
            "title": title,
            "start": start_str,
            "end": end_str,
            "calendar_name": calendar_name,
            "color": color,
            "all_day": all_day,
        })

    return events
