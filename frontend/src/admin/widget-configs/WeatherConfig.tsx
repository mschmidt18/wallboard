import { useState } from "react";

interface Props {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export default function WeatherConfig({ config, onChange }: Props) {
  const [zipCode, setZipCode] = useState<string>((config.zip_code as string | undefined) ?? "");
  const [units, setUnits] = useState<string>((config.units as string | undefined) ?? "imperial");

  function handleZipChange(value: string) {
    setZipCode(value);
    onChange({ ...config, zip_code: value, units });
  }

  function handleUnitsChange(value: string) {
    setUnits(value);
    onChange({ ...config, zip_code: zipCode, units: value });
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
    </div>
  );
}
