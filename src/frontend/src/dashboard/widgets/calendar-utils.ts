export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  calendar_name?: string;
  color?: string;
  all_day: boolean;
}

export function parseEventDate(event: CalendarEvent): Date {
  // All-day events have date-only strings like "2026-02-14".
  // new Date("2026-02-14") parses as UTC midnight, which shifts to the
  // previous day in western timezones.  Parse the parts manually so the
  // Date is created in local time instead.
  if (event.all_day && /^\d{4}-\d{2}-\d{2}$/.test(event.start)) {
    const [y, m, d] = event.start.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(event.start);
}

export function getDayLabel(date: Date, today: Date): string {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = dateStart.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const today = new Date();
  const groups = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const eventDate = parseEventDate(event);
    const label = getDayLabel(eventDate, today);
    const existing = groups.get(label);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(label, [event]);
    }
  }

  return groups;
}

export function generateWeekGrid(weeks: number, today?: Date): Date[][] {
  const ref = today ?? new Date();
  // Find Sunday of the week containing `ref`
  const sunday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ref.getDay());

  const grid: Date[][] = [];
  for (let w = 0; w < weeks; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(sunday);
      date.setDate(sunday.getDate() + w * 7 + d);
      week.push(date);
    }
    grid.push(week);
  }
  return grid;
}

export function getWorkWeekDays(today?: Date): Date[] {
  const ref = today ?? new Date();
  // Monday of the week containing `ref`; on weekends roll forward to next
  // week's Monday (past events aren't fetched, so the finished week would
  // render empty).
  let mondayOffset: number;
  if (ref.getDay() === 0) {
    mondayOffset = 1; // Sunday -> tomorrow
  } else if (ref.getDay() === 6) {
    mondayOffset = 2; // Saturday -> day after tomorrow
  } else {
    mondayOffset = 1 - ref.getDay();
  }
  const monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + mondayOffset);

  const days: Date[] = [];
  for (let d = 0; d < 5; d++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + d);
    days.push(date);
  }
  return days;
}

export function getEventsForDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();

  return events.filter((event) => {
    const eventDate = parseEventDate(event);
    return eventDate.getFullYear() === y && eventDate.getMonth() === m && eventDate.getDate() === d;
  });
}

export function isToday(date: Date, today: Date): boolean {
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function isPast(date: Date, today: Date): boolean {
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return dateStart.getTime() < todayStart.getTime();
}
