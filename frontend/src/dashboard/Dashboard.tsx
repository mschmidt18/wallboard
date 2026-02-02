import { useEffect, useState } from "react";
import { api } from "../shared/api";
import type { DisplayResponse, Widget } from "../shared/types";
import ClockWidget from "./widgets/ClockWidget";
import NotesWidget from "./widgets/NotesWidget";
import WeatherWidget from "./widgets/WeatherWidget";
import CalendarWidget from "./widgets/CalendarWidget";
import PhotosWidget from "./widgets/PhotosWidget";

const POLL_INTERVAL = 60_000;
const LOCALSTORAGE_KEY = "wallboard_display_cache";

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
        <div className="h-full flex items-center justify-center text-white/50 text-sm">
          Unknown widget: {widget.widget_type}
        </div>
      );
  }
}

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

  useEffect(() => {
    const fetchDisplay = async () => {
      try {
        const data = await api.getDisplay();
        setDisplay(data);
        setError(false);
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(data));
      } catch {
        setError(true);
      }
    };

    fetchDisplay();
    const interval = setInterval(fetchDisplay, POLL_INTERVAL);
    return () => clearInterval(interval);
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

  const { layout, widgets } = display;

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: layout.theme?.background || "#1a1a2e" }}
    >
      <div
        className="grid h-full w-full p-4 gap-4"
        style={{
          gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
          gridAutoRows: `${layout.row_height}px`,
        }}
      >
        {widgets.map((widget) => (
          <div
            key={widget.id}
            style={{
              gridColumn: `${widget.position_x + 1} / span ${widget.width}`,
              gridRow: `${widget.position_y + 1} / span ${widget.height}`,
            }}
            className="rounded-lg overflow-hidden"
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
