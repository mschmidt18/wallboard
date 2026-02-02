export interface ThemeValues {
  background: string;
  text_color: "light" | "dark";
  widget_background: "transparent" | "semi-transparent" | "solid";
  font_family: "system" | "serif" | "monospace" | "rounded";
  font_scale: "small" | "medium" | "large";
}

export const DEFAULT_THEME: ThemeValues = {
  background: "#1a1a2e",
  text_color: "light",
  widget_background: "semi-transparent",
  font_family: "system",
  font_scale: "medium",
};

const BACKGROUND_PRESETS = [
  { color: "#1a1a2e", label: "Midnight" },
  { color: "#0f0f23", label: "Deep Navy" },
  { color: "#1e293b", label: "Slate" },
  { color: "#18181b", label: "Zinc" },
  { color: "#1c1917", label: "Stone" },
  { color: "#14532d", label: "Forest" },
  { color: "#3b0764", label: "Purple" },
  { color: "#7f1d1d", label: "Maroon" },
];

const FONT_FAMILIES: { value: ThemeValues["font_family"]; label: string; css: string }[] = [
  { value: "system", label: "System Default", css: "ui-sans-serif, system-ui, sans-serif" },
  { value: "serif", label: "Serif", css: "ui-serif, Georgia, serif" },
  { value: "monospace", label: "Monospace", css: "ui-monospace, monospace" },
  { value: "rounded", label: "Rounded", css: "'Nunito', 'Varela Round', ui-sans-serif, sans-serif" },
];

const WIDGET_BG_OPTIONS: { value: ThemeValues["widget_background"]; label: string; preview: string }[] = [
  { value: "transparent", label: "Transparent", preview: "transparent" },
  { value: "semi-transparent", label: "Semi-transparent", preview: "rgba(0,0,0,0.4)" },
  { value: "solid", label: "Solid", preview: "#000000" },
];

const FONT_SCALE_OPTIONS: { value: ThemeValues["font_scale"]; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

interface ThemeEditorProps {
  value: ThemeValues;
  onChange: (theme: ThemeValues) => void;
}

export default function ThemeEditor({ value, onChange }: ThemeEditorProps) {
  function update<K extends keyof ThemeValues>(key: K, val: ThemeValues[K]) {
    onChange({ ...value, [key]: val });
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Theme</h3>

      {/* Background color */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Background Color
        </label>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.background}
              onChange={(e) => update("background", e.target.value)}
              className="h-8 w-8 rounded border border-gray-300 cursor-pointer p-0"
            />
            <input
              type="text"
              value={value.background}
              onChange={(e) => update("background", e.target.value)}
              className="block w-24 rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono"
              placeholder="#1a1a2e"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset.color}
              type="button"
              onClick={() => update("background", preset.color)}
              className={`h-7 w-7 rounded-md border-2 transition-colors ${
                value.background === preset.color
                  ? "border-indigo-500 ring-2 ring-indigo-200"
                  : "border-gray-300 hover:border-gray-400"
              }`}
              style={{ backgroundColor: preset.color }}
              title={preset.label}
            />
          ))}
        </div>
      </div>

      {/* Text color */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Text Color
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => update("text_color", "light")}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              value.text_color === "light"
                ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="inline-block h-4 w-4 rounded-full bg-white border border-gray-300" />
            Light
          </button>
          <button
            type="button"
            onClick={() => update("text_color", "dark")}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              value.text_color === "dark"
                ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="inline-block h-4 w-4 rounded-full bg-gray-900 border border-gray-300" />
            Dark
          </button>
        </div>
      </div>

      {/* Widget background */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Widget Background
        </label>
        <div className="flex gap-2">
          {WIDGET_BG_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update("widget_background", opt.value)}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                value.widget_background === opt.value
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span
                className="inline-block h-4 w-4 rounded border border-gray-300"
                style={{ backgroundColor: opt.preview }}
              />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Font family */}
      <div>
        <label htmlFor="theme-font-family" className="block text-sm font-medium text-gray-700 mb-1">
          Font Family
        </label>
        <select
          id="theme-font-family"
          value={value.font_family}
          onChange={(e) => update("font_family", e.target.value as ThemeValues["font_family"])}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          {FONT_FAMILIES.map((ff) => (
            <option key={ff.value} value={ff.value} style={{ fontFamily: ff.css }}>
              {ff.label}
            </option>
          ))}
        </select>
      </div>

      {/* Font scale */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Font Scale
        </label>
        <div className="flex gap-2">
          {FONT_SCALE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update("font_scale", opt.value)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                value.font_scale === opt.value
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live preview swatch */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Preview
        </label>
        <div
          className="rounded-md border border-gray-300 p-3 flex items-center justify-center h-16"
          style={{ backgroundColor: value.background }}
        >
          <span
            className="text-sm font-medium"
            style={{
              color: value.text_color === "light" ? "#ffffff" : "#1a1a1a",
              fontFamily: FONT_FAMILIES.find((f) => f.value === value.font_family)?.css,
              fontSize: value.font_scale === "small" ? "0.75rem" : value.font_scale === "large" ? "1.125rem" : "0.875rem",
            }}
          >
            Sample Widget Text
          </span>
        </div>
      </div>
    </div>
  );
}
