import { useState, useEffect, useRef } from "react";
import type { ThemeValues } from "../shared/types";
import { useGooglePhotoPicker } from "./hooks/useGooglePhotoPicker";
import googlePhotosLogo from "../assets/google-photos-logo.svg";
import applePhotosLogo from "../assets/apple-photos-logo.svg";

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

function isValidICloudAlbumUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!parsed.hostname.endsWith("icloud.com")) return false;
    if (!parsed.pathname.includes("/sharedalbum")) return false;
    return parsed.hash.length > 1;
  } catch {
    return false;
  }
}

interface ThemeEditorProps {
  value: ThemeValues;
  onChange: (theme: ThemeValues) => void;
}

export default function ThemeEditor({ value, onChange }: ThemeEditorProps) {
  const backgroundType = value.background_type ?? "color";
  const bgPhotosSource = value.background_photos_source ?? "";
  const [bgIcloudUrl, setBgIcloudUrl] = useState(value.background_icloud_album_url ?? "");
  const [bgInterval, setBgInterval] = useState(value.background_interval_seconds ?? 30);
  const [bgUrlError, setBgUrlError] = useState<string | null>(null);
  const [bgDropdownOpen, setBgDropdownOpen] = useState(false);
  const bgDropdownRef = useRef<HTMLDivElement>(null);

  const picker = useGooglePhotoPicker({
    initialSessionId: value.background_picker_session_id ?? "",
  });

  // Emit theme change when picker session changes
  const prevBgSessionRef = useRef(picker.pickerSessionId);
  useEffect(() => {
    if (picker.pickerSessionId && picker.pickerSessionId !== prevBgSessionRef.current) {
      prevBgSessionRef.current = picker.pickerSessionId;
      onChange({
        ...value,
        background_picker_session_id: picker.pickerSessionId,
      });
    }
  }, [picker.pickerSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (bgDropdownRef.current && !bgDropdownRef.current.contains(e.target as Node)) {
        setBgDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function update<K extends keyof ThemeValues>(key: K, val: ThemeValues[K]) {
    onChange({ ...value, [key]: val });
  }

  function handleBgSourceChange(source: "google" | "apple") {
    setBgDropdownOpen(false);
    setBgUrlError(null);
    onChange({
      ...value,
      background_photos_source: source,
    });
  }

  function handleBgIcloudUrlChange(url: string) {
    setBgIcloudUrl(url);
    if (url && !isValidICloudAlbumUrl(url)) {
      setBgUrlError("Please enter a valid iCloud shared album URL");
    } else {
      setBgUrlError(null);
      onChange({
        ...value,
        background_icloud_album_url: url,
      });
    }
  }

  function handleBgIcloudUrlBlur() {
    if (bgIcloudUrl && isValidICloudAlbumUrl(bgIcloudUrl)) {
      onChange({
        ...value,
        background_icloud_album_url: bgIcloudUrl,
      });
    }
  }

  const bgSourceOptions = [
    { value: "google" as const, label: "Google Photos", logo: googlePhotosLogo },
    { value: "apple" as const, label: "Apple Photos", logo: applePhotosLogo },
  ];

  const selectedBgSource = bgSourceOptions.find((opt) => opt.value === bgPhotosSource);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Theme</h3>

      {/* Background type toggle */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Background
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => update("background_type", "color")}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              backgroundType === "color"
                ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span
              className="inline-block h-4 w-4 rounded border border-gray-300"
              style={{ backgroundColor: value.background }}
            />
            Solid Color
          </button>
          <button
            type="button"
            onClick={() => update("background_type", "photos")}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              backgroundType === "photos"
                ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
            </svg>
            Photo Slideshow
          </button>
        </div>
      </div>

      {/* Solid color controls */}
      {backgroundType === "color" && (
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
      )}

      {/* Photo slideshow controls */}
      {backgroundType === "photos" && (
        <div className="space-y-4">
          {/* Photo source dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Photo Source
            </label>
            <div ref={bgDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setBgDropdownOpen(!bgDropdownOpen)}
                className="relative w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-left shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                {selectedBgSource ? (
                  <span className="flex items-center gap-2">
                    <img src={selectedBgSource.logo} alt="" className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm text-gray-900">{selectedBgSource.label}</span>
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">Select a source...</span>
                )}
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </span>
              </button>
              {bgDropdownOpen && (
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                  {bgSourceOptions.map((option) => (
                    <li
                      key={option.value}
                      onClick={() => handleBgSourceChange(option.value)}
                      className="relative cursor-pointer select-none py-2 pl-3 pr-9 hover:bg-indigo-50"
                    >
                      <span className="flex items-center gap-2">
                        <img src={option.logo} alt="" className="h-5 w-5 flex-shrink-0" />
                        <span className="text-sm text-gray-900">{option.label}</span>
                      </span>
                      {bgPhotosSource === option.value && (
                        <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-600">
                          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Google Photos picker */}
          {bgPhotosSource === "google" && (
            <div>
              {picker.sessionExpired && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 mb-3">
                  <p className="text-sm text-amber-800">
                    Photo session expired. Please re-pick your photos.
                  </p>
                </div>
              )}
              {picker.error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 mb-3">
                  <p className="text-sm text-red-800">{picker.error}</p>
                </div>
              )}
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Photos
              </label>
              {picker.pickerSessionId && !picker.sessionExpired ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">
                    {picker.photoCount} photo{picker.photoCount !== 1 ? "s" : ""} selected
                  </span>
                  <button
                    type="button"
                    onClick={picker.startPicking}
                    disabled={picker.picking}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {picker.picking ? "Picking..." : "Re-pick Photos"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={picker.startPicking}
                  disabled={picker.picking}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {picker.picking ? "Opening picker..." : "Pick Photos"}
                </button>
              )}
              <p className="mt-1 text-xs text-gray-400">
                Opens Google Photos picker to select background photos.
              </p>
            </div>
          )}

          {/* Apple Photos URL */}
          {bgPhotosSource === "apple" && (
            <div>
              <label htmlFor="bg-icloud-album-url" className="block text-sm font-medium text-gray-700 mb-1">
                iCloud Shared Album URL
              </label>
              <input
                type="url"
                id="bg-icloud-album-url"
                value={bgIcloudUrl}
                onChange={(e) => handleBgIcloudUrlChange(e.target.value)}
                onBlur={handleBgIcloudUrlBlur}
                placeholder="https://www.icloud.com/sharedalbum/#..."
                className={`block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:outline-none ${
                  bgUrlError
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                    : "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                }`}
              />
              {bgUrlError && <p className="mt-1 text-xs text-red-600">{bgUrlError}</p>}
              {!bgUrlError && (
                <p className="mt-1 text-xs text-gray-400">
                  Paste the URL of a public iCloud shared album.
                </p>
              )}
            </div>
          )}

          {/* Interval slider */}
          {bgPhotosSource && (
            <div>
              <label htmlFor="bg-photos-interval" className="block text-sm font-medium text-gray-700 mb-1">
                Interval: {bgInterval}s
              </label>
              <input
                id="bg-photos-interval"
                type="range"
                min={5}
                max={120}
                step={5}
                value={bgInterval}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setBgInterval(v);
                  update("background_interval_seconds", v);
                }}
                className="w-full accent-indigo-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>5s</span>
                <span>120s</span>
              </div>
            </div>
          )}

          {/* Tip */}
          <p className="text-xs text-gray-400 italic">
            Tip: Use transparent or semi-transparent widget backgrounds for best results.
          </p>
        </div>
      )}

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
          style={{ backgroundColor: backgroundType === "photos" ? "#000000" : value.background }}
        >
          <span
            className="text-sm font-medium"
            style={{
              color: value.text_color === "light" ? "#ffffff" : "#1a1a1a",
              fontFamily: FONT_FAMILIES.find((f) => f.value === value.font_family)?.css,
              fontSize: value.font_scale === "small" ? "1rem" : value.font_scale === "large" ? "1.25rem" : "1.125rem",
            }}
          >
            {backgroundType === "photos" ? "Photo Slideshow Background" : "Sample Widget Text"}
          </span>
        </div>
      </div>
    </div>
  );
}
