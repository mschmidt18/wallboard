import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  GridLayout,
  cloneLayoutItem,
  sortLayoutItemsByRowCol,
  getFirstCollision,
} from "react-grid-layout";
import type { LayoutItem, Layout as RGLLayout, Compactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { api } from "../shared/api";
import type { Layout, Widget, WidgetType } from "../shared/types";
import WidgetConfig from "./WidgetConfig";
import ThemeEditor from "./ThemeEditor";
import { DEFAULT_THEME } from "../shared/types";
import type { ThemeValues } from "../shared/types";

const WIDGET_TYPES: { type: WidgetType; label: string; icon: string }[] = [
  { type: "clock", label: "Clock", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
  { type: "weather", label: "Weather", icon: "M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" },
  { type: "calendar", label: "Calendar", icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" },
  { type: "photos", label: "Photos", icon: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" },
  { type: "notes", label: "Notes", icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" },
  { type: "school_lunch", label: "School Lunch", icon: "M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" },
];

const DEFAULT_SIZES: Record<WidgetType, { w: number; h: number }> = {
  clock: { w: 2, h: 2 },
  weather: { w: 3, h: 3 },
  calendar: { w: 3, h: 4 },
  photos: { w: 4, h: 4 },
  notes: { w: 2, h: 3 },
  school_lunch: { w: 3, h: 3 },
};

// Free-form placement: resolve overlaps by pushing down,
// but never pull items upward to fill gaps.
const freeFormCompactor: Compactor = {
  type: "vertical",
  allowOverlap: false,
  compact(layout) {
    const sorted = sortLayoutItemsByRowCol(layout);
    const resolved: LayoutItem[] = [];
    const out = new Array<LayoutItem>(layout.length);
    for (const item of sorted) {
      if (!item) continue;
      const l = cloneLayoutItem(item);
      // Push down past any collision (skip the "move up" compaction step)
      let collision: LayoutItem | undefined;
      while ((collision = getFirstCollision(resolved, l)) !== undefined) {
        l.y = collision.y + collision.h;
      }
      resolved.push(l);
      out[layout.indexOf(item)] = l;
    }
    return out;
  },
};

function getGridBackground(width: number, cols: number, rowHeight: number) {
  const colWidth = width / cols;
  return {
    backgroundSize: `${colWidth}px ${rowHeight}px`,
    backgroundImage:
      `linear-gradient(to right, rgb(209 213 219 / 0.5) 1px, transparent 1px), ` +
      `linear-gradient(to bottom, rgb(209 213 219 / 0.5) 1px, transparent 1px)`,
    backgroundPosition: "0 0",
  };
}

function widgetsToGridLayout(widgets: Widget[]): LayoutItem[] {
  return widgets.map((w) => ({
    i: String(w.id),
    x: w.position_x,
    y: w.position_y,
    w: w.width,
    h: w.height,
    minW: 1,
    minH: 1,
  }));
}

export default function LayoutEditor() {
  const { id } = useParams<{ id: string }>();
  const layoutId = Number(id);

  const [layout, setLayout] = useState<Layout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedWidgetId, setSelectedWidgetId] = useState<number | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ name: "", columns: 12, row_height: 60 });
  const [themeForm, setThemeForm] = useState<ThemeValues>({ ...DEFAULT_THEME });
  const [dirty, setDirty] = useState(false);

  // Track current grid positions so drags are captured before save
  const gridLayoutRef = useRef<LayoutItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  const fetchLayout = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getLayout(layoutId);
      setLayout(data);
      setSettingsForm({
        name: data.name,
        columns: data.columns,
        row_height: data.row_height,
      });
      setThemeForm({
        ...data.theme,
        background: data.theme?.background ?? DEFAULT_THEME.background,
        text_color: data.theme?.text_color ?? DEFAULT_THEME.text_color,
        widget_background: data.theme?.widget_background ?? DEFAULT_THEME.widget_background,
        font_family: data.theme?.font_family ?? DEFAULT_THEME.font_family,
        font_scale: data.theme?.font_scale ?? DEFAULT_THEME.font_scale,
      });
      gridLayoutRef.current = widgetsToGridLayout(data.widgets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load layout");
    } finally {
      setLoading(false);
    }
  }, [layoutId]);

  useEffect(() => {
    fetchLayout();
  }, [fetchLayout]);

  // Measure container width for GridLayout
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  function handleLayoutChange(newLayout: RGLLayout) {
    gridLayoutRef.current = [...newLayout];
    setDirty(true);
  }

  async function handleSavePositions() {
    if (!layout) return;
    setSaving(true);
    setError(null);
    try {
      const positions = gridLayoutRef.current.map((item) => ({
        id: Number(item.i),
        position_x: item.x,
        position_y: item.y,
        width: item.w,
        height: item.h,
      }));
      await api.updatePositions(layout.id, positions);
      setDirty(false);
      await fetchLayout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save positions");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddWidget(widgetType: WidgetType) {
    if (!layout) return;
    setShowAddMenu(false);
    setError(null);
    try {
      const defaults = DEFAULT_SIZES[widgetType];
      await api.addWidget(layout.id, {
        widget_type: widgetType,
        position_x: 0,
        position_y: 0,
        width: defaults.w,
        height: defaults.h,
        config: {},
      });
      await fetchLayout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add widget");
    }
  }

  async function handleDeleteWidget() {
    if (selectedWidgetId === null || !layout) return;
    const widget = layout.widgets.find((w) => w.id === selectedWidgetId);
    if (!widget) return;
    if (!window.confirm(`Delete this ${widget.widget_type} widget?`)) return;
    setError(null);
    try {
      await api.deleteWidget(selectedWidgetId);
      setSelectedWidgetId(null);
      await fetchLayout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete widget");
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!layout) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateLayout(layout.id, {
        name: settingsForm.name,
        columns: settingsForm.columns,
        row_height: settingsForm.row_height,
        theme: { ...themeForm },
      });
      await fetchLayout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500 text-sm">Loading layout...</div>
      </div>
    );
  }

  if (error && !layout) {
    return (
      <div className="py-10">
        <div className="rounded-md bg-red-50 border border-red-200 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
        <Link
          to="/admin/layouts"
          className="text-sm text-indigo-600 hover:text-indigo-500"
        >
          Back to layouts
        </Link>
      </div>
    );
  }

  if (!layout) return null;

  const gridItems = widgetsToGridLayout(layout.widgets);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          to="/admin/layouts"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Layouts
        </Link>

        <div className="h-5 w-px bg-gray-300" />

        <h1 className="text-lg font-semibold text-gray-900 truncate">
          {layout.name}
        </h1>

        {layout.is_active && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Active
          </span>
        )}

        <div className="flex-1" />

        {/* Add widget */}
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="inline-flex items-center gap-1.5 rounded-md bg-white border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Widget
          </button>
          {showAddMenu && (
            <div className="absolute right-0 mt-1 w-48 rounded-md bg-white shadow-lg ring-1 ring-black/5 z-20">
              <div className="py-1">
                {WIDGET_TYPES.map((wt) => (
                  <button
                    key={wt.type}
                    onClick={() => handleAddWidget(wt.type)}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={wt.icon} />
                    </svg>
                    {wt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Delete selected widget */}
        {selectedWidgetId !== null && (
          <button
            onClick={handleDeleteWidget}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete Widget
          </button>
        )}

        {/* Save positions */}
        <button
          onClick={handleSavePositions}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save Positions"}
        </button>

        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          title="Layout settings"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Layout settings panel (collapsible) */}
      {showSettings && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <form onSubmit={handleSaveSettings} className="p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Layout Settings</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="settings-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  id="settings-name"
                  type="text"
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="settings-columns" className="block text-sm font-medium text-gray-700 mb-1">
                  Columns
                </label>
                <input
                  id="settings-columns"
                  type="number"
                  min={1}
                  max={24}
                  value={settingsForm.columns}
                  onChange={(e) => setSettingsForm({ ...settingsForm, columns: Number(e.target.value) })}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="settings-rowheight" className="block text-sm font-medium text-gray-700 mb-1">
                  Row Height (px)
                </label>
                <input
                  id="settings-rowheight"
                  type="number"
                  min={20}
                  max={200}
                  value={settingsForm.row_height}
                  onChange={(e) => setSettingsForm({ ...settingsForm, row_height: Number(e.target.value) })}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <ThemeEditor value={themeForm} onChange={setThemeForm} />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grid info */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zm0 9.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zm9.75-9.75A2.25 2.25 0 0115.75 3.75H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
        </svg>
        {layout.columns} cols &times; {layout.row_height}px rows
        <span className="text-gray-300">|</span>
        Drag to reposition, resize from edges
      </div>

      {/* Grid editor */}
      <div
        ref={containerRef}
        className="rounded-lg border border-gray-200 bg-gray-50 p-2 min-h-[400px]"
        style={getGridBackground(containerWidth - 16, layout.columns, layout.row_height)}
        onClick={(e) => {
          // Deselect when clicking empty space
          if (e.target === e.currentTarget || (e.target as HTMLElement).closest("[data-grid-bg]")) {
            setSelectedWidgetId(null);
          }
        }}
      >
        {layout.widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="h-10 w-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
            </svg>
            <p className="text-sm">No widgets yet. Click "Add Widget" to get started.</p>
          </div>
        ) : (
          <GridLayout
            className="layout"
            layout={gridItems}
            width={containerWidth - 16}
            gridConfig={{
              cols: layout.columns,
              rowHeight: layout.row_height,
            }}
            dragConfig={{
              cancel: ".no-drag",
            }}
            compactor={freeFormCompactor}
            onLayoutChange={handleLayoutChange}
          >
            {layout.widgets.map((widget) => {
              const isSelected = selectedWidgetId === widget.id;
              const typeInfo = WIDGET_TYPES.find((wt) => wt.type === widget.widget_type);
              return (
                <div
                  key={String(widget.id)}
                  className={`rounded-lg border-2 bg-white shadow-sm cursor-move flex flex-col items-center justify-center gap-2 transition-colors ${
                    isSelected
                      ? "border-indigo-500 ring-2 ring-indigo-200"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWidgetId(isSelected ? null : widget.id);
                  }}
                >
                  <svg
                    className={`h-8 w-8 ${isSelected ? "text-indigo-500" : "text-gray-400"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={typeInfo?.icon ?? "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z"}
                    />
                  </svg>
                  <span className={`text-xs font-medium ${isSelected ? "text-indigo-700" : "text-gray-500"}`}>
                    {typeInfo?.label ?? widget.widget_type}
                  </span>
                </div>
              );
            })}
          </GridLayout>
        )}
      </div>

      {/* Widget config panel */}
      {selectedWidgetId !== null && (() => {
        const selectedWidget = layout.widgets.find((w) => w.id === selectedWidgetId);
        if (!selectedWidget) return null;
        return (
          <WidgetConfig
            key={selectedWidget.id}
            widget={selectedWidget}
            onClose={() => setSelectedWidgetId(null)}
            onSaved={() => fetchLayout()}
          />
        );
      })()}

      {/* Close add menu on outside click */}
      {showAddMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowAddMenu(false)}
        />
      )}
    </div>
  );
}
