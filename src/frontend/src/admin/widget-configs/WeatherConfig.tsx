import { useState } from "react";

interface Props {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

const FORECAST_OPTIONS = [
  { value: 1, label: "1 (today only)" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
] as const;

function normalizeForecastDays(value: number): number {
  const allowed = FORECAST_OPTIONS.map((o) => o.value);
  if (allowed.includes(value as (typeof allowed)[number])) return value;
  return allowed.reduce((closest, v) =>
    Math.abs(v - value) < Math.abs(closest - value) ? v : closest,
  );
}

export default function WeatherConfig({ config, onChange }: Props) {
  const [zipCode, setZipCode] = useState<string>((config.zip_code as string | undefined) ?? "");
  const [units, setUnits] = useState<string>((config.units as string | undefined) ?? "imperial");
  const [forecastDays, setForecastDays] = useState<number>(
    normalizeForecastDays((config.forecast_days as number | undefined) ?? 3),
  );

  function emit(patch: Record<string, unknown>) {
    onChange({ ...config, zip_code: zipCode, units, forecast_days: forecastDays, ...patch });
  }

  function handleZipChange(value: string) {
    setZipCode(value);
    emit({ zip_code: value });
  }

  function handleUnitsChange(value: string) {
    setUnits(value);
    emit({ units: value });
  }

  function handleForecastDaysChange(value: number) {
    setForecastDays(value);
    emit({ forecast_days: value });
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="weather-zip" className="block text-sm font-medium text-gray-700 mb-1">
          Zip Code
        </label>
        <input
          id="weather-zip"
          type="text"
          inputMode="numeric"
          maxLength={5}
          value={zipCode}
          onChange={(e) => handleZipChange(e.target.value)}
          placeholder="e.g. 10001"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
        {(config.location_name as string | undefined) && (
          <p className="mt-1 text-sm text-gray-500">{config.location_name as string}</p>
        )}
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-2">Units</legend>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="weather-units"
              value="imperial"
              checked={units === "imperial"}
              onChange={() => handleUnitsChange("imperial")}
              className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Imperial (F)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="weather-units"
              value="metric"
              checked={units === "metric"}
              onChange={() => handleUnitsChange("metric")}
              className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Metric (C)
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-2">Forecast days</legend>
        <div className="flex items-center gap-4">
          {FORECAST_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="weather-forecast-days"
                value={opt.value}
                checked={forecastDays === opt.value}
                onChange={() => handleForecastDaysChange(opt.value)}
                className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
