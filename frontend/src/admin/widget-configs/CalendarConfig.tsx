import { useState, useEffect } from "react";
import { api } from "../../shared/api";

interface CalendarEntry {
  id: string;
  name: string;
  color: string;
}

interface Props {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export default function CalendarConfig({ config, onChange }: Props) {
  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>((config.calendar_ids as string[] | undefined) ?? []);
  const [daysAhead, setDaysAhead] = useState<number>((config.days_ahead as number | undefined) ?? 7);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect -- synchronous loading state before async fetch is standard React pattern
    api
      .getGoogleCalendars()
      .then((data) => {
        if (!cancelled) {
          setCalendars(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load calendars");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleToggleCalendar(calId: string) {
    const next = selectedIds.includes(calId)
      ? selectedIds.filter((id) => id !== calId)
      : [...selectedIds, calId];
    setSelectedIds(next);
    onChange({ ...config, calendar_ids: next, days_ahead: daysAhead });
  }

  function handleDaysChange(value: number) {
    setDaysAhead(value);
    onChange({ ...config, calendar_ids: selectedIds, days_ahead: value });
  }

  if (error) {
    return (
      <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
        <p className="text-sm text-yellow-800">
          Google Calendar is not connected. Please connect your Google account in the Integrations settings to configure calendar widgets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Calendars</label>
        {loading ? (
          <p className="text-sm text-gray-500">Loading calendars...</p>
        ) : calendars.length === 0 ? (
          <p className="text-sm text-gray-500">No calendars found.</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {calendars.map((cal) => (
              <label key={cal.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(cal.id)}
                  onChange={() => handleToggleCalendar(cal.id)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span
                  className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cal.color || "#6366f1" }}
                />
                {cal.name}
              </label>
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
}
