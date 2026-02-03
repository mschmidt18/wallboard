import ical from 'node-ical';
import type { VEvent, CalendarComponent, EventInstance } from 'node-ical';

export interface IcsEvent {
  title: string;
  start: string;
  end: string;
  calendar_name: string;
  color: string;
  all_day: boolean;
}

function getSummaryText(summary: VEvent['summary']): string {
  if (!summary) return '(No title)';
  return typeof summary === 'string' ? summary : summary.val;
}

function formatDate(date: Date, allDay: boolean): string {
  if (allDay) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return date.toISOString();
}

export async function fetchIcsEvents(
  url: string,
  daysAhead: number,
  calendarName: string,
  color: string,
): Promise<IcsEvent[]> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`ICS fetch error: ${response.status} ${response.statusText}`);
  }

  const icsText = await response.text();

  let parsed: Record<string, CalendarComponent>;
  try {
    parsed = ical.parseICS(icsText);
  } catch {
    return [];
  }

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDate = new Date(startDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const events: IcsEvent[] = [];

  for (const component of Object.values(parsed)) {
    if (component.type !== 'VEVENT') continue;
    const vevent = component as VEvent;

    if (vevent.rrule) {
      // Expand recurring event into instances
      let instances: EventInstance[];
      try {
        instances = ical.expandRecurringEvent(vevent, {
          from: startDate,
          to: endDate,
        });
      } catch {
        continue;
      }

      for (const instance of instances) {
        events.push({
          title: getSummaryText(instance.summary),
          start: formatDate(instance.start, instance.isFullDay),
          end: formatDate(instance.end, instance.isFullDay),
          calendar_name: calendarName,
          color,
          all_day: instance.isFullDay,
        });
      }
    } else {
      // Non-recurring event — check if it falls in date range
      if (!vevent.start) continue;

      const eventStart = new Date(vevent.start);
      const allDay = vevent.datetype === 'date';

      // Check date range
      if (eventStart >= endDate) continue;
      const eventEnd = vevent.end ? new Date(vevent.end) : eventStart;
      if (eventEnd < startDate) continue;

      events.push({
        title: getSummaryText(vevent.summary),
        start: formatDate(vevent.start, allDay),
        end: formatDate(vevent.end ?? vevent.start, allDay),
        calendar_name: calendarName,
        color,
        all_day: allDay,
      });
    }
  }

  return events;
}
