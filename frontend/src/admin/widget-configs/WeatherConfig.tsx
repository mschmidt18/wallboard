import { useState, useEffect } from "react";

interface Props {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

export default function WeatherConfig({ config, onChange }: Props) {
  const [latitude, setLatitude] = useState<string>(String(config.latitude ?? ""));
  const [longitude, setLongitude] = useState<string>(String(config.longitude ?? ""));
  const [units, setUnits] = useState<string>(config.units ?? "imperial");

  useEffect(() => {
    setLatitude(String(config.latitude ?? ""));
    setLongitude(String(config.longitude ?? ""));
    setUnits(config.units ?? "imperial");
  }, [config]);

  function handleChange(updates: Partial<{ latitude: string; longitude: string; units: string }>) {
    const lat = updates.latitude ?? latitude;
    const lon = updates.longitude ?? longitude;
    const u = updates.units ?? units;

    if (updates.latitude !== undefined) setLatitude(lat);
    if (updates.longitude !== undefined) setLongitude(lon);
    if (updates.units !== undefined) setUnits(u);

    const next: Record<string, any> = { ...config, units: u };
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (!isNaN(latNum)) next.latitude = latNum;
    if (!isNaN(lonNum)) next.longitude = lonNum;

    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="weather-lat" className="block text-sm font-medium text-gray-700 mb-1">
          Latitude
        </label>
        <input
          id="weather-lat"
          type="text"
          inputMode="decimal"
          value={latitude}
          onChange={(e) => handleChange({ latitude: e.target.value })}
          placeholder="e.g. 40.7128"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="weather-lon" className="block text-sm font-medium text-gray-700 mb-1">
          Longitude
        </label>
        <input
          id="weather-lon"
          type="text"
          inputMode="decimal"
          value={longitude}
          onChange={(e) => handleChange({ longitude: e.target.value })}
          placeholder="e.g. -74.0060"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
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
              onChange={() => handleChange({ units: "imperial" })}
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
              onChange={() => handleChange({ units: "metric" })}
              className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Metric (C)
          </label>
        </div>
      </fieldset>
    </div>
  );
}
