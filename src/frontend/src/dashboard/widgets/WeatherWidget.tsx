interface DayForecast {
  date: string;
  high: number;
  low: number;
  weather_code: number;
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

function WeatherIcon({ code, size }: { code: number; size: string }) {
  return (
    <img
      src={`/weather-icons/${weatherIconName(code)}.svg`}
      alt=""
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

export default function WeatherWidget({ data }: WeatherWidgetProps) {
  if (!data || !data.current) {
    return (
      <div className="h-full flex items-center justify-center text-white/50 text-lg">
        Waiting for data...
      </div>
    );
  }

  const { current, daily } = data as unknown as WeatherData;
  const unitSymbol = current.units === "metric" ? "\u00B0C" : "\u00B0F";
  const speedUnit = current.units === "metric" ? "km/h" : "mph";

  return (
    <div className="h-full flex flex-col text-white p-4 overflow-hidden">
      {/* Current conditions */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <div className="mb-1"><WeatherIcon code={current.weather_code} size="64px" /></div>
        <div className="text-6xl font-light tracking-tight">
          {Math.round(current.temperature)}{unitSymbol}
        </div>
        <div className="text-lg text-white/80 mt-1">{current.condition}</div>
        <div className="flex gap-4 mt-2 text-sm text-white/60">
          <span>Feels {Math.round(current.feels_like)}{unitSymbol}</span>
          <span>Humidity {current.humidity}%</span>
          <span>Wind {Math.round(current.wind_speed)} {speedUnit}</span>
        </div>
      </div>

      {/* 7-day forecast */}
      {daily && daily.length > 0 && (
        <div className="flex gap-1 justify-between mt-3 pt-3 border-t border-white/10 shrink-0">
          {daily.map((day: DayForecast) => (
            <div
              key={day.date}
              className="flex flex-col items-center text-xs text-white/70 min-w-0"
            >
              <span className="font-medium text-white/90">{getDayName(day.date)}</span>
              <span className="my-0.5"><WeatherIcon code={day.weather_code} size="28px" /></span>
              <span className="text-white">{Math.round(day.high)}&deg;</span>
              <span className="text-white/50">{Math.round(day.low)}&deg;</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
