import { useEffect, useRef, useState } from "react";
import { api } from "../shared/api";
import type { DisplayResponse, Widget } from "../shared/types";
import ClockWidget from "./widgets/ClockWidget";
import NotesWidget from "./widgets/NotesWidget";
import WeatherWidget from "./widgets/WeatherWidget";
import CalendarWidget from "./widgets/CalendarWidget";
import PhotosWidget from "./widgets/PhotosWidget";
import BackgroundSlideshow from "./BackgroundSlideshow";

const DEFAULT_POLL_INTERVAL = 60_000;
const DISPLAY_OFF_POLL_INTERVAL = 60_000;
const LOCALSTORAGE_KEY = "wallboard_display_cache";

const FONT_FAMILY_CSS: Record<string, string> = {
  system: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  monospace: "ui-monospace, monospace",
  rounded: "'Nunito', 'Varela Round', ui-sans-serif, sans-serif",
};

const FONT_SCALE_CSS: Record<string, number> = {
  small: 0.875,
  medium: 1,
  large: 1.125,
};

const WIDGET_BG_CSS: Record<string, string> = {
  transparent: "transparent",
  "semi-transparent": "rgba(0,0,0,0.4)",
  solid: "#000000",
};

function WidgetRenderer({ widget }: { widget: Widget }) {
  switch (widget.widget_type) {
    case "clock":
      return <ClockWidget config={widget.config} />;
    case "notes":
      return <NotesWidget config={widget.config} />;
    case "weather":
      return <WeatherWidget config={widget.config} data={widget.data} />;
    case "calendar":
      return <CalendarWidget config={widget.config} data={widget.data} />;
    case "photos":
      return <PhotosWidget config={widget.config} data={widget.data} />;
    default:
      return (
        <div className="h-full flex items-center justify-center opacity-50 text-sm">
          Unknown widget: {widget.widget_type}
        </div>
      );
  }
}

const CURSOR_HIDE_DELAY = 3_000;

export default function Dashboard() {
  const [display, setDisplay] = useState<DisplayResponse | null>(() => {
    try {
      const cached = localStorage.getItem(LOCALSTORAGE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(true);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pollIntervalMs = useRef(DEFAULT_POLL_INTERVAL);

  useEffect(() => {
    const handleMouseMove = () => {
      setCursorHidden(false);
      clearTimeout(cursorTimerRef.current);
      cursorTimerRef.current = setTimeout(() => setCursorHidden(true), CURSOR_HIDE_DELAY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      clearTimeout(cursorTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const fetchAndSchedule = async () => {
      try {
        const data = await api.getDisplay();
        setDisplay(data);
        setError(false);
        const baseInterval = (data.refresh_interval ?? 60) * 1000;
        pollIntervalMs.current = data.display_power === 'off'
          ? Math.max(baseInterval, DISPLAY_OFF_POLL_INTERVAL)
          : baseInterval;
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(data));
      } catch {
        setError(true);
      }
      if (!cancelled) {
        timeoutId = setTimeout(fetchAndSchedule, pollIntervalMs.current);
      }
    };

    fetchAndSchedule();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  if (!display) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <h1 className="text-3xl mb-4">Wallboard</h1>
          <p className="text-gray-400">
            Visit <code>http://&lt;device-ip&gt;:8000/admin</code> to get started.
          </p>
        </div>
      </div>
    );
  }

  // Display off: render black screen
  if (display.display_power === 'off' || !display.layout) {
    return (
      <div
        className="h-screen w-screen"
        style={{
          background: "#000000",
          cursor: cursorHidden ? "none" : "auto",
        }}
      />
    );
  }

  const { layout, widgets } = display;
  const theme = layout.theme || {};
  const textColor = theme.text_color === "dark" ? "#1a1a1a" : "#ffffff";
  const fontFamily = FONT_FAMILY_CSS[theme.font_family] || FONT_FAMILY_CSS.system;
  const fontScale = FONT_SCALE_CSS[theme.font_scale] || 1;
  const widgetBg = WIDGET_BG_CSS[theme.widget_background] || WIDGET_BG_CSS["semi-transparent"];

  const hasPhotoBg = theme.background_type === "photos" && display.background_photos && display.background_photos.length > 0;

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{
        background: hasPhotoBg ? "#000000" : (theme.background || "#1a1a2e"),
        color: textColor,
        fontFamily,
        fontSize: `${fontScale}rem`,
        textShadow: hasPhotoBg
          ? "0 0 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.4)"
          : undefined,
        cursor: cursorHidden ? "none" : "auto",
      }}
    >
      {hasPhotoBg && (
        <BackgroundSlideshow
          photos={display.background_photos!}
          intervalSeconds={theme.background_interval_seconds ?? 30}
        />
      )}
      <div
        className="grid h-full w-full p-2 gap-2"
        style={{
          gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
          gridAutoRows: `${layout.row_height}px`,
          position: hasPhotoBg ? "relative" : undefined,
          zIndex: hasPhotoBg ? 1 : undefined,
        }}
      >
        {widgets.map((widget) => (
          <div
            key={widget.id}
            style={{
              gridColumn: `${widget.position_x + 1} / span ${widget.width}`,
              gridRow: `${widget.position_y + 1} / span ${widget.height}`,
              backgroundColor: widgetBg,
            }}
            className="@container rounded-lg overflow-hidden"
          >
            <WidgetRenderer widget={widget} />
          </div>
        ))}
      </div>
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-900/80 text-white px-3 py-1 rounded text-sm">
          Connection lost - showing cached data
        </div>
      )}
    </div>
  );
}
