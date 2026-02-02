interface WeatherWidgetProps {
  config: {
    lat?: number;
    lon?: number;
    units?: string;
  };
  data?: Record<string, any> | null;
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

function weatherIcon(code: number): string {
  // WMO weather codes mapped to simple emoji-like text symbols
  if (code === 0) return "\u2600"; // clear sky
  if (code <= 3) return "\u26C5"; // partly cloudy
  if (code <= 49) return "\u2601"; // fog/cloudy
  if (code <= 59) return "\uD83C\uDF27"; // drizzle
  if (code <= 69) return "\uD83C\uDF27"; // rain
  if (code <= 79) return "\uD83C\uDF28"; // snow
  if (code <= 82) return "\uD83C\uDF27"; // rain showers
  if (code <= 86) return "\uD83C\uDF28"; // snow showers
  if (code >= 95) return "\u26C8"; // thunderstorm
  return "\u2601";
}

export default function WeatherWidget({ data }: WeatherWidgetProps) {
  if (!data || !data.current) {
    return (
      <div className="h-full flex items-center justify-center text-white/50 text-lg">
        Waiting for data...
      </div>
    );
  }

  const { current, daily } = data;
  const unitSymbol = current.units === "metric" ? "\u00B0C" : "\u00B0F";
  const speedUnit = current.units === "metric" ? "km/h" : "mph";

  return (
    <div className="h-full flex flex-col text-white p-4 overflow-hidden">
      {/* Current conditions */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <div className="text-3xl mb-1">{weatherIcon(current.weather_code)}</div>
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
          {daily.map((day: Record<string, any>) => (
            <div
              key={day.date}
              className="flex flex-col items-center text-xs text-white/70 min-w-0"
            >
              <span className="font-medium text-white/90">{getDayName(day.date)}</span>
              <span className="text-base my-0.5">{weatherIcon(day.weather_code)}</span>
              <span className="text-white">{Math.round(day.high)}&deg;</span>
              <span className="text-white/50">{Math.round(day.low)}&deg;</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
