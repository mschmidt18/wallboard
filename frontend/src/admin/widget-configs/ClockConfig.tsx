import { useState, useEffect } from "react";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Moscow",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "UTC",
];

interface Props {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

export default function ClockConfig({ config, onChange }: Props) {
  const [timezone, setTimezone] = useState<string>(config.timezone ?? "");
  const [format24h, setFormat24h] = useState<boolean>(config.format_24h ?? false);

  useEffect(() => {
    setTimezone(config.timezone ?? "");
    setFormat24h(config.format_24h ?? false);
  }, [config]);

  function handleChange(updates: Partial<{ timezone: string; format_24h: boolean }>) {
    const next = {
      ...config,
      timezone: updates.timezone ?? timezone,
      format_24h: updates.format_24h ?? format24h,
    };
    if (updates.timezone !== undefined) setTimezone(updates.timezone);
    if (updates.format_24h !== undefined) setFormat24h(updates.format_24h);
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="clock-timezone" className="block text-sm font-medium text-gray-700 mb-1">
          Timezone
        </label>
        <select
          id="clock-timezone"
          value={timezone}
          onChange={(e) => handleChange({ timezone: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">System default</option>
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="clock-24h"
          type="checkbox"
          checked={format24h}
          onChange={(e) => handleChange({ format_24h: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label htmlFor="clock-24h" className="text-sm font-medium text-gray-700">
          24-hour format
        </label>
      </div>
    </div>
  );
}
