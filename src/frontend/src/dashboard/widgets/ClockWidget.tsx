import { useEffect, useState } from "react";

interface ClockWidgetProps {
  config: {
    timezone?: string;
    format_24h?: boolean;
  };
}

export default function ClockWidget({ config }: ClockWidgetProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString("en-US", {
    timeZone: config.timezone || undefined,
    hour12: !config.format_24h,
    hour: "2-digit",
    minute: "2-digit",
  });

  const dateStr = now.toLocaleDateString("en-US", {
    timeZone: config.timezone || undefined,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="text-6xl font-light tracking-wide">{timeStr}</div>
      <div className="text-xl mt-2 opacity-70">{dateStr}</div>
    </div>
  );
}
