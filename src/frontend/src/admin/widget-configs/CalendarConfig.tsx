import { useState, useEffect } from "react";
import { api } from "../../shared/api";
import type { CalendarSource, IcsCalendar } from "../../shared/types";

interface GoogleCalendarEntry {
  id: string;
  name: string;
  color: string;
}

interface Props {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

type CalendarView = "list" | "monthly" | "workweek";

/** The work week view always covers the current (or upcoming) Mon-Fri. */
const WORK_WEEK_DAYS_AHEAD = 7;

function sourceKey(source: CalendarSource): string {
  return `${source.type}:${source.id}`;
}

/** Convert old calendar_ids config to calendar_sources format on load. */
function initSources(config: Record<string, unknown>): CalendarSource[] {
  const sources = config.calendar_sources as CalendarSource[] | undefined;
  if (sources) return sources;
  const oldIds = config.calendar_ids as string[] | undefined;
  if (oldIds) {
    return oldIds.map((id) => ({ type: "google" as const, id }));
  }
  return [];
}

function initColors(config: Record<string, unknown>): Record<string, string> {
  return (config.colors as Record<string, string> | undefined) ?? {};
}

export default function CalendarConfig({ config, onChange }: Props) {
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarEntry[]>([]);
  const [icsCalendars, setIcsCalendars] = useState<IcsCalendar[]>([]);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [icsLoading, setIcsLoading] = useState(true);
  const [googleError, setGoogleError] = useState(false);

  const [selectedSources, setSelectedSources] = useState<CalendarSource[]>(() => initSources(config));
  const [colors, setColors] = useState<Record<string, string>>(() => initColors(config));
  const [view, setView] = useState<CalendarView>((config.view as CalendarView | undefined) ?? "list");
  const [weeks, setWeeks] = useState<number>((config.weeks as number | undefined) ?? 4);
  const [daysAhead, setDaysAhead] = useState<number>((config.days_ahead as number | undefined) ?? 7);
  const [title, setTitle] = useState<string>((config.title as string | undefined) ?? "");

  useEffect(() => {
    let cancelled = false;
    api
      .getGoogleCalendars()
      .then((data) => {
        if (!cancelled) setGoogleCalendars(data);
      })
      .catch(() => {
        if (!cancelled) setGoogleError(true);
      })
      .finally(() => {
        if (!cancelled) setGoogleLoading(false);
      });
    api
      .getIcsCalendars()
      .then((data) => {
        if (!cancelled) setIcsCalendars(data);
      })
      .catch(() => {
        // ICS fetch failure is non-fatal; just show empty list
      })
      .finally(() => {
        if (!cancelled) setIcsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function isSelected(source: CalendarSource): boolean {
    return selectedSources.some((s) => s.type === source.type && String(s.id) === String(source.id));
  }

  function emitChange(
    nextSources: CalendarSource[],
    nextColors: Record<string, string>,
    nextDays: number,
    nextTitle?: string,
    nextView?: CalendarView,
    nextWeeks?: number,
  ) {
    const v = nextView ?? view;
    const w = nextWeeks ?? weeks;
    const cfg: Record<string, unknown> = {
      calendar_sources: nextSources,
      days_ahead: v === "monthly" ? w * 7 : v === "workweek" ? WORK_WEEK_DAYS_AHEAD : nextDays,
      colors: nextColors,
      view: v,
      weeks: w,
    };
    const t = nextTitle ?? title;
    if (t) cfg.title = t;
    onChange(cfg);
  }

  function handleToggle(source: CalendarSource, defaultColor: string) {
    let nextSources: CalendarSource[];
    const nextColors = { ...colors };
    if (isSelected(source)) {
      nextSources = selectedSources.filter((s) => !(s.type === source.type && String(s.id) === String(source.id)));
      delete nextColors[sourceKey(source)];
    } else {
      nextSources = [...selectedSources, source];
      if (!nextColors[sourceKey(source)]) {
        nextColors[sourceKey(source)] = defaultColor;
      }
    }
    setSelectedSources(nextSources);
    setColors(nextColors);
    emitChange(nextSources, nextColors, daysAhead);
  }

  function handleColorChange(source: CalendarSource, color: string) {
    const nextColors = { ...colors, [sourceKey(source)]: color };
    setColors(nextColors);
    emitChange(selectedSources, nextColors, daysAhead);
  }

  function handleDaysChange(value: number) {
    setDaysAhead(value);
    emitChange(selectedSources, colors, value);
  }

  const loading = googleLoading || icsLoading;

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label htmlFor="calendar-title" className="block text-sm font-medium text-gray-700 mb-1">
          Title (optional)
        </label>
        <input
          id="calendar-title"
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            emitChange(selectedSources, colors, daysAhead, e.target.value);
          }}
          placeholder="e.g. Family Calendar"
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>

      {/* Google Calendars Section */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Google Calendars</label>
        {googleLoading ? (
          <p className="text-sm text-gray-500">Loading Google calendars...</p>
        ) : googleError ? (
          <p className="text-sm text-gray-400">
            Google Calendar not connected. Connect in Integrations to add Google calendars.
          </p>
        ) : googleCalendars.length === 0 ? (
          <p className="text-sm text-gray-500">No Google calendars found.</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {googleCalendars.map((cal) => {
              const source: CalendarSource = { type: "google", id: cal.id };
              const key = sourceKey(source);
              const selected = isSelected(source);
              return (
                <label key={cal.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => handleToggle(source, cal.color || "#4285f4")}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {selected && (
                    <input
                      type="color"
                      value={colors[key] || cal.color || "#4285f4"}
                      onChange={(e) => handleColorChange(source, e.target.value)}
                      className="h-5 w-5 rounded border border-gray-300 cursor-pointer p-0"
                    />
                  )}
                  {!selected && (
                    <span
                      className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cal.color || "#4285f4" }}
                    />
                  )}
                  {cal.name}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* ICS Calendars Section */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">ICS Calendars</label>
        {icsLoading ? (
          <p className="text-sm text-gray-500">Loading ICS calendars...</p>
        ) : icsCalendars.length === 0 ? (
          <p className="text-sm text-gray-400">
            No ICS calendars configured. Add them in the Integrations page.
          </p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {icsCalendars.map((cal) => {
              const source: CalendarSource = { type: "ics", id: cal.id };
              const key = sourceKey(source);
              const selected = isSelected(source);
              return (
                <label key={cal.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => handleToggle(source, cal.color || "#6366f1")}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {selected && (
                    <input
                      type="color"
                      value={colors[key] || cal.color || "#6366f1"}
                      onChange={(e) => handleColorChange(source, e.target.value)}
                      className="h-5 w-5 rounded border border-gray-300 cursor-pointer p-0"
                    />
                  )}
                  {!selected && (
                    <span
                      className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cal.color || "#6366f1" }}
                    />
                  )}
                  {cal.name}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* No sources at all */}
      {!loading && googleError && icsCalendars.length === 0 && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
          <p className="text-sm text-yellow-800">
            No calendar sources available. Connect Google Calendar or add ICS calendars in the Integrations page.
          </p>
        </div>
      )}

      {/* View toggle */}
      <div>
        <label htmlFor="calendar-view" className="block text-sm font-medium text-gray-700 mb-1">
          View
        </label>
        <select
          id="calendar-view"
          value={view}
          onChange={(e) => {
            const v = e.target.value as CalendarView;
            setView(v);
            emitChange(selectedSources, colors, daysAhead, undefined, v);
          }}
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        >
          <option value="list">List</option>
          <option value="workweek">Work Week</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {/* Days ahead slider (list view) or Weeks slider (monthly view).
          Work week has nothing to configure: always the current Mon-Fri. */}
      {view === "workweek" ? null : view === "monthly" ? (
        <div>
          <label htmlFor="calendar-weeks" className="block text-sm font-medium text-gray-700 mb-1">
            Weeks to display: {weeks}
          </label>
          <input
            id="calendar-weeks"
            type="range"
            min={1}
            max={5}
            value={weeks}
            onChange={(e) => {
              const w = Number(e.target.value);
              setWeeks(w);
              emitChange(selectedSources, colors, daysAhead, undefined, undefined, w);
            }}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>1</span>
            <span>5</span>
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="calendar-days" className="block text-sm font-medium text-gray-700 mb-1">
            Days ahead: {daysAhead}
          </label>
          <input
            id="calendar-days"
            type="range"
            min={1}
            max={30}
            value={daysAhead}
            onChange={(e) => handleDaysChange(Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>1</span>
            <span>30</span>
          </div>
        </div>
      )}
    </div>
  );
}
