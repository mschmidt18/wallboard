import { useEffect, useState } from "react";
import { api } from "../shared/api";
import type { DisplayResponse } from "../shared/types";

const POLL_INTERVAL = 60_000;
const LOCALSTORAGE_KEY = "wallboard_display_cache";

export default function Dashboard() {
  const [display, setDisplay] = useState<DisplayResponse | null>(() => {
    const cached = localStorage.getItem(LOCALSTORAGE_KEY);
    return cached ? JSON.parse(cached) : null;
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
            {/* Widget components will be added in subsequent tasks */}
            <div className="h-full w-full flex items-center justify-center text-white text-sm opacity-50">
              {widget.widget_type}
            </div>
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
