interface CalendarWidgetProps {
  config: Record<string, any>;
  data?: Record<string, any> | null;
}

interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  calendar_name?: string;
  color?: string;
  all_day: boolean;
}

function getDayLabel(date: Date, today: Date): string {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = dateStart.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const today = new Date();
  const groups = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const eventDate = new Date(event.start);
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

export default function CalendarWidget({ data }: CalendarWidgetProps) {
  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-white/50 text-lg">
        Waiting for data...
      </div>
    );
  }

  const events: CalendarEvent[] = data.events ?? [];

  if (events.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-white/50 text-lg">
        No upcoming events
      </div>
    );
  }

  const grouped = groupEventsByDay(events);

  return (
    <div className="h-full overflow-y-auto p-4 text-white">
      {Array.from(grouped.entries()).map(([dayLabel, dayEvents]) => (
        <div key={dayLabel} className="mb-4 last:mb-0">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/60 mb-2">
            {dayLabel}
          </h3>
          <ul className="space-y-1.5">
            {dayEvents.map((event, i) => (
              <li key={`${event.start}-${i}`} className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: event.color || "#4285f4" }}
                />
                <div className="min-w-0">
                  <span className="text-sm text-white/70 mr-2">
                    {event.all_day ? "All day" : formatTime(event.start)}
                  </span>
                  <span className="text-sm">{event.title}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
