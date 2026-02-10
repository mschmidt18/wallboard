import { useEffect, useRef, useState } from "react";

interface DayForecast {
  date: string;
  high: number;
  low: number;
  weather_code: number;
  condition: string;
}

interface WeatherData {
  current: {
    temperature: number;
    feels_like: number;
    humidity: number;
    wind_speed: number;
    weather_code: number;
    condition: string;
    units: string;
  };
  daily: DayForecast[];
}

interface WeatherWidgetProps {
  config: {
    lat?: number;
    lon?: number;
    units?: string;
    forecast_days?: number;
  };
  data?: Record<string, unknown> | null;
}

function getDayName(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === tomorrow.getTime()) return "Tmrw";
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

// WMO weather codes → Bas Milius animated weather icon filenames
// https://github.com/basmilius/weather-icons (MIT license)
function weatherIconName(code: number): string {
  if (code === 0) return "clear-day";
  if (code <= 2) return "partly-cloudy-day";
  if (code === 3) return "overcast";
  if (code <= 48) return "fog";
  if (code <= 55) return "drizzle";
  if (code <= 57) return "sleet";
  if (code <= 65) return "rain";
  if (code <= 67) return "sleet";
  if (code <= 77) return "snow";
  if (code <= 82) return "overcast-rain";
  if (code <= 86) return "overcast-snow";
  if (code === 95) return "thunderstorms";
  if (code >= 96) return "thunderstorms-rain";
  return "not-available";
}

function WeatherIcon({ code, className }: { code: number; className?: string }) {
  return (
    <img
      src={`/weather-icons/${weatherIconName(code)}.svg`}
      alt=""
      className={className}
      style={{ filter: "drop-shadow(0 0 3px rgba(0,0,0,0.8)) drop-shadow(0 0 8px rgba(0,0,0,0.5))" }}
      draggable={false}
    />
  );
}

export default function WeatherWidget({ config, data }: WeatherWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setPortrait(height > width * 1.4);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!data || !data.current) {
    return (
      <div className="h-full flex items-center justify-center opacity-50 text-lg">
        Waiting for data...
      </div>
    );
  }

  const { current, daily } = data as unknown as WeatherData;
  const unitSymbol = current.units === "metric" ? "\u00B0C" : "\u00B0F";
  const speedUnit = current.units === "metric" ? "km/h" : "mph";
  const forecastDays = config.forecast_days ?? 3;
  const today = daily?.[0];
  const showForecast = forecastDays > 1 && daily && daily.length > 0;
  const visibleDays = showForecast ? daily.slice(0, forecastDays) : [];

  return (
    <div
      ref={containerRef}
      className={[
        "h-full flex flex-col p-4 overflow-hidden",
        showForecast && !portrait ? "@sm:flex-row" : "",
      ].join(" ")}
    >
      {/* Current conditions */}
      <div
        className={[
          "flex flex-col items-center justify-center min-h-0",
          showForecast ? "flex-1 @sm:flex-[2]" : "flex-1",
        ].join(" ")}
      >
        <div className="mb-1">
          <WeatherIcon
            code={current.weather_code}
            className="w-[clamp(48px,15cqi,80px)] h-[clamp(48px,15cqi,80px)]"
          />
        </div>
        <div
          className="font-light tracking-tight"
          style={{ fontSize: "clamp(2rem, 12cqi, 4rem)" }}
        >
          {Math.round(current.temperature)}{unitSymbol}
        </div>
        <div
          className="opacity-90 mt-1"
          style={{ fontSize: "clamp(0.75rem, 4cqi, 1.125rem)" }}
        >
          {current.condition}
        </div>
        <div
          className="flex gap-4 mt-2 opacity-80 flex-wrap justify-center"
          style={{ fontSize: "clamp(0.625rem, 3cqi, 0.875rem)" }}
        >
          <span>Feels {Math.round(current.feels_like)}{unitSymbol}</span>
          <span>Humidity {current.humidity}%</span>
          <span className="hidden @xs:inline">Wind {Math.round(current.wind_speed)} {speedUnit}</span>
        </div>
        {forecastDays === 1 && today && (
          <div
            className="flex gap-3 mt-2 opacity-80"
            style={{ fontSize: "clamp(0.625rem, 3cqi, 0.875rem)" }}
          >
            <span>Hi {Math.round(today.high)}&deg;</span>
            <span>Lo {Math.round(today.low)}&deg;</span>
          </div>
        )}
      </div>

      {/* Multi-day forecast */}
      {showForecast && (
        <div
          className={
            portrait
              ? "flex flex-col gap-2 mt-3 pt-3 border-t border-current/10 flex-1 justify-center"
              : [
                  "flex gap-1 justify-around shrink-0",
                  "mt-3 pt-3 border-t border-current/10",
                  "@sm:mt-0 @sm:pt-0 @sm:border-t-0 @sm:ml-3 @sm:pl-3 @sm:border-l @sm:border-current/10",
                  "@sm:flex-[3] @sm:items-center",
                ].join(" ")
          }
        >
          {visibleDays.map((day: DayForecast) => (
            <div
              key={day.date}
              className={
                portrait
                  ? "flex items-center gap-3"
                  : "flex flex-col items-center min-w-0"
              }
              style={{ fontSize: "clamp(0.625rem, 3cqi, 0.875rem)" }}
            >
              <span
                className={
                  portrait
                    ? "font-medium opacity-90 w-12 shrink-0"
                    : "font-medium opacity-90"
                }
              >
                {getDayName(day.date)}
              </span>
              <WeatherIcon
                code={day.weather_code}
                className={
                  portrait
                    ? "w-8 h-8 shrink-0"
                    : "my-0.5 w-[clamp(24px,8cqi,48px)] h-[clamp(24px,8cqi,48px)]"
                }
              />
              <span className="shrink-0">{Math.round(day.high)}&deg;</span>
              <span className="opacity-70 shrink-0">{Math.round(day.low)}&deg;</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
