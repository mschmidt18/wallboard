import { useState, useEffect, useCallback } from "react";
import type { Widget } from "../shared/types";
import { api } from "../shared/api";
import ClockConfig from "./widget-configs/ClockConfig";
import NotesConfig from "./widget-configs/NotesConfig";
import WeatherConfig from "./widget-configs/WeatherConfig";
import CalendarConfig from "./widget-configs/CalendarConfig";
import PhotosConfig from "./widget-configs/PhotosConfig";

const TYPE_LABELS: Record<string, string> = {
  clock: "Clock",
  weather: "Weather",
  calendar: "Calendar",
  photos: "Photos",
  notes: "Notes",
};

interface Props {
  widget: Widget;
  onClose: () => void;
  onSaved: () => void;
}

export default function WidgetConfig({ widget, onClose, onSaved }: Props) {
  const [config, setConfig] = useState<Record<string, any>>(widget.config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setConfig(widget.config);
    setDirty(false);
    setError(null);
  }, [widget.id, widget.config]);

  const handleChange = useCallback((newConfig: Record<string, any>) => {
    setConfig(newConfig);
    setDirty(true);
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateWidget(widget.id, { config });
      setDirty(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  }

  function renderConfigForm() {
    switch (widget.widget_type) {
      case "clock":
        return <ClockConfig config={config} onChange={handleChange} />;
      case "notes":
        return <NotesConfig config={config} onChange={handleChange} />;
      case "weather":
        return <WeatherConfig config={config} onChange={handleChange} />;
      case "calendar":
        return <CalendarConfig config={config} onChange={handleChange} />;
      case "photos":
        return <PhotosConfig config={config} onChange={handleChange} />;
      default:
        return (
          <p className="text-sm text-gray-500">
            No configuration available for this widget type.
          </p>
        );
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">
          {TYPE_LABELS[widget.widget_type] ?? widget.widget_type} Configuration
        </h2>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        {renderConfigForm()}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 pb-2">
          <div className="rounded-md bg-red-50 border border-red-200 p-2">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
        <button
          onClick={onClose}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
