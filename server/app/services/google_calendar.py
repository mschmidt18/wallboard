from datetime import datetime, timedelta, timezone

import httpx

CALENDAR_LIST_URL = "https://www.googleapis.com/calendar/v3/users/me/calendarList"
CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events"


async def fetch_calendars(access_token: str) -> list[dict]:
    """Fetch the user's Google Calendar list."""
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient() as client:
        response = await client.get(CALENDAR_LIST_URL, headers=headers, timeout=10.0)
        response.raise_for_status()
        data = response.json()

    return [
        {
            "id": cal["id"],
            "name": cal.get("summary", ""),
            "color": cal.get("backgroundColor", ""),
        }
        for cal in data.get("items", [])
    ]


async def fetch_events(
    access_token: str,
    calendar_ids: list[str],
    days_ahead: int = 7,
) -> list[dict]:
    """Fetch events from one or more Google Calendars."""
    headers = {"Authorization": f"Bearer {access_token}"}
    now = datetime.now(timezone.utc)
    time_min = now.isoformat()
    time_max = (now + timedelta(days=days_ahead)).isoformat()

    all_events: list[dict] = []

    async with httpx.AsyncClient() as client:
        for calendar_id in calendar_ids:
            url = CALENDAR_EVENTS_URL.format(calendar_id=calendar_id)
            params = {
                "timeMin": time_min,
                "timeMax": time_max,
                "singleEvents": "true",
                "orderBy": "startTime",
            }
            response = await client.get(url, headers=headers, params=params, timeout=10.0)
            response.raise_for_status()
            data = response.json()

            for item in data.get("items", []):
                start = item.get("start", {})
                end = item.get("end", {})
                all_day = "date" in start and "dateTime" not in start

                all_events.append({
                    "title": item.get("summary", "(No title)"),
                    "start": start.get("date") if all_day else start.get("dateTime"),
                    "end": end.get("date") if all_day else end.get("dateTime"),
                    "calendar_id": calendar_id,
                    "color": item.get("colorId", ""),
                    "all_day": all_day,
                })

    return all_events
