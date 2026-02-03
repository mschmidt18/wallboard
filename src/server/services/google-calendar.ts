const CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
const CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events';

export interface Calendar {
  id: string;
  name: string;
  color: string;
}

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  calendar_id: string;
  color: string;
  all_day: boolean;
}

export async function fetchCalendars(accessToken: string): Promise<Calendar[]> {
  const response = await fetch(CALENDAR_LIST_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Google Calendar API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return (data.items ?? []).map((cal: Record<string, string>) => ({
    id: cal.id,
    name: cal.summary ?? '',
    color: cal.backgroundColor ?? '',
  }));
}

export async function fetchEvents(
  accessToken: string,
  calendarIds: string[],
  daysAhead: number = 7,
): Promise<CalendarEvent[]> {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  const allEvents: CalendarEvent[] = [];

  for (const calendarId of calendarIds) {
    const encodedId = encodeURIComponent(calendarId);
    const url = CALENDAR_EVENTS_URL.replace('{calendar_id}', encodedId);
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const response = await fetch(`${url}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Google Calendar API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    for (const item of data.items ?? []) {
      const start = item.start ?? {};
      const end = item.end ?? {};
      const allDay = 'date' in start && !('dateTime' in start);

      allEvents.push({
        title: item.summary ?? '(No title)',
        start: allDay ? start.date : start.dateTime,
        end: allDay ? end.date : end.dateTime,
        calendar_id: calendarId,
        color: item.colorId ?? '',
        all_day: allDay,
      });
    }
  }

  return allEvents;
}
