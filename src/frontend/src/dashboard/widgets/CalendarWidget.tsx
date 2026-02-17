import {
  type CalendarEvent,
  groupEventsByDay,
  formatTime,
  generateWeekGrid,
  getEventsForDate,
  isToday,
  isPast,
} from "./calendar-utils";

interface CalendarWidgetProps {
  config: Record<string, unknown>;
  data?: Record<string, unknown> | null;
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_EVENTS_PER_CELL = 3;

function MonthlyGrid({ events, weeks }: { events: CalendarEvent[]; weeks: number }) {
  const today = new Date();
  const grid = generateWeekGrid(weeks, today);

  return (
    <div className="h-full flex flex-col">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((d, i) => (
          <div key={i} className="text-left text-d-xs font-semibold uppercase opacity-50 pl-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="grid flex-1" style={{ gridTemplateRows: `repeat(${weeks}, 1fr)` }}>
        {grid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 min-h-0">
            {week.map((date, di) => {
              const dayEvents = getEventsForDate(events, date);
              const past = isPast(date, today);
              const todayCell = isToday(date, today);
              const overflow = dayEvents.length > MAX_EVENTS_PER_CELL;
              const shown = dayEvents.slice(0, MAX_EVENTS_PER_CELL);

              return (
                <div
                  key={di}
                  className={`flex flex-col px-0.5 py-0.5 overflow-hidden border-t border-r border-white/30 last:border-r-0 ${past ? "opacity-40" : ""}`}
                >
                  {/* Date number */}
                  <div
                    className={`text-d-sm text-left leading-tight ${
                      todayCell
                        ? "font-bold"
                        : ""
                    }`}
                  >
                    {todayCell ? (
                      <span className="inline-flex items-center justify-center min-w-6 h-6 px-1 rounded-full bg-red-600 font-bold">
                        {date.getDate()}
                      </span>
                    ) : (
                      date.getDate()
                    )}
                  </div>

                  {/* Event labels */}
                  <div className="flex-1 min-h-0 overflow-hidden space-y-px mt-px">
                    {shown.map((event, ei) => (
                      <div
                        key={ei}
                        className="flex items-center gap-0.5 min-w-0"
                      >
                        <span
                          className="w-0.5 h-3 shrink-0 rounded-full"
                          style={{ backgroundColor: event.color || "#4285f4" }}
                        />
                        <span className="text-d-xs truncate leading-tight">
                          {event.title}
                        </span>
                      </div>
                    ))}
                    {overflow && (
                      <div className="text-d-xs opacity-50 leading-tight pl-1">
                        +{dayEvents.length - MAX_EVENTS_PER_CELL} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CalendarWidget({ config, data }: CalendarWidgetProps) {
  if (!data) {
    return (
      <div className="h-full flex items-center justify-center opacity-50 text-d-lg">
        Waiting for data...
      </div>
    );
  }

  const events: CalendarEvent[] = (data.events as CalendarEvent[] | undefined) ?? [];

  if (events.length === 0) {
    return (
      <div className="h-full flex items-center justify-center opacity-50 text-d-lg">
        No upcoming events
      </div>
    );
  }

  const isMonthly = config.view === "monthly";

  if (isMonthly) {
    const weeks = (config.weeks as number | undefined) ?? 4;
    return (
      <div className="h-full overflow-hidden p-4 flex flex-col">
        {config.title ? (
          <h2 className="text-d-lg font-semibold mb-2">{String(config.title)}</h2>
        ) : null}
        <div className="flex-1 min-h-0">
          <MonthlyGrid events={events} weeks={weeks} />
        </div>
      </div>
    );
  }

  // List view (default)
  const grouped = groupEventsByDay(events);

  return (
    <div className="h-full overflow-y-auto scrollbar-hide p-4">
      {config.title ? (
        <h2 className="text-d-lg font-semibold mb-3">{String(config.title)}</h2>
      ) : null}
      {Array.from(grouped.entries()).map(([dayLabel, dayEvents]) => (
        <div key={dayLabel} className="mb-4 last:mb-0">
          <h3 className="text-d-sm font-semibold uppercase tracking-wider opacity-60 mb-2">
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
                  <span className="text-d-sm opacity-70 mr-2">
                    {event.all_day ? "All day" : formatTime(event.start)}
                  </span>
                  <span className="text-d-sm">{event.title}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
