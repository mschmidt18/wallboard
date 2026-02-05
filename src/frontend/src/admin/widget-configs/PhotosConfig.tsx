import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../shared/api";
import googlePhotosLogo from "../../assets/google-photos-logo.svg";
import applePhotosLogo from "../../assets/apple-photos-logo.svg";

type PhotosSource = "google" | "apple" | "";

interface Props {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function isValidICloudAlbumUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!parsed.hostname.endsWith("icloud.com")) return false;
    if (!parsed.pathname.includes("/sharedalbum")) return false;
    const hash = parsed.hash;
    return hash.length > 1;
  } catch {
    return false;
  }
}

export default function PhotosConfig({ config, onChange }: Props) {
  const [photosSource, setPhotosSource] = useState<PhotosSource>(
    (config.photos_source as PhotosSource | undefined) ?? ""
  );
  const [pickerSessionId, setPickerSessionId] = useState<string>(
    (config.picker_session_id as string | undefined) ?? ""
  );
  const [photoCount, setPhotoCount] = useState<number>(
    (config.photo_count as number | undefined) ?? 0
  );
  const [icloudAlbumUrl, setIcloudAlbumUrl] = useState<string>(
    (config.icloud_album_url as string | undefined) ?? ""
  );
  const [intervalSeconds, setIntervalSeconds] = useState<number>(
    (config.interval_seconds as number | undefined) ?? 30
  );
  const [transition, setTransition] = useState<string>(
    (config.transition as string | undefined) ?? "fade"
  );
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupRef = useRef<Window | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check if existing Google session is still valid on mount
  useEffect(() => {
    if (!pickerSessionId || photosSource !== "google") return;
    let cancelled = false;
    api.pollPhotoPickerSession(pickerSessionId).catch(() => {
      if (!cancelled) setSessionExpired(true);
    });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only check on mount

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function emitChange(
    updates: Partial<{
      photos_source: PhotosSource;
      picker_session_id: string;
      photo_count: number;
      icloud_album_url: string;
      interval_seconds: number;
      transition: string;
    }>
  ) {
    const next: Record<string, unknown> = {
      ...config,
      photos_source: updates.photos_source ?? photosSource,
      picker_session_id: updates.picker_session_id ?? pickerSessionId,
      photo_count: updates.photo_count ?? photoCount,
      icloud_album_url: updates.icloud_album_url ?? icloudAlbumUrl,
      interval_seconds: updates.interval_seconds ?? intervalSeconds,
      transition: updates.transition ?? transition,
    };
    // Remove legacy album_id if present
    delete next.album_id;
    onChange(next);
  }

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  async function startPicking() {
    setError(null);
    setPicking(true);
    setSessionExpired(false);

    // Open blank popup in the click handler to avoid popup blockers
    const popup = window.open("", "photoPicker", "width=900,height=700");
    popupRef.current = popup;

    try {
      const data = await api.createPhotoPickerSession();
      if (!popup || popup.closed) {
        setError("Popup was blocked. Please allow popups for this site.");
        setPicking(false);
        return;
      }
      // Append /autoclose so Google's picker closes the popup after selection
      popup.location.href = data.picker_uri + "/autoclose";

      // Poll for completion
      const pollingInterval =
        (data.polling_config as Record<string, unknown>)?.pollInterval
          ? Number(
              String(
                (data.polling_config as Record<string, unknown>).pollInterval
              ).replace("s", "")
            ) * 1000
          : 3000;

      // After popup closes, keep polling for a bit — there can be a delay
      // between the user confirming and Google setting mediaItemsSet.
      let pollsAfterClose = 0;
      const maxPollsAfterClose = 10;

      const poll = async () => {
        if (popup.closed) {
          pollsAfterClose++;
        }

        try {
          const status = await api.pollPhotoPickerSession(data.session_id);
          if (status.media_items_set && status.photos) {
            if (!popup.closed) popup.close();
            setPickerSessionId(data.session_id);
            setPhotoCount(status.photos.length);
            emitChange({
              picker_session_id: data.session_id,
              photo_count: status.photos.length,
            });
            setPicking(false);
            return;
          }
        } catch {
          // Polling error, keep trying
        }

        // Give up after polling several times with popup closed
        if (pollsAfterClose >= maxPollsAfterClose) {
          setPicking(false);
          return;
        }

        pollTimerRef.current = setTimeout(poll, pollingInterval);
      };

      pollTimerRef.current = setTimeout(poll, pollingInterval);
    } catch (err) {
      popup?.close();
      setError(
        err instanceof Error ? err.message : "Failed to start photo picker"
      );
      setPicking(false);
    }
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    };
  }, [stopPolling]);

  function handleSourceChange(source: PhotosSource) {
    setPhotosSource(source);
    setDropdownOpen(false);
    setError(null);
    setUrlError(null);
    emitChange({ photos_source: source });
  }

  function handleICloudUrlChange(url: string) {
    setIcloudAlbumUrl(url);
    if (url && !isValidICloudAlbumUrl(url)) {
      setUrlError("Please enter a valid iCloud shared album URL");
    } else {
      setUrlError(null);
      emitChange({ icloud_album_url: url });
    }
  }

  function handleICloudUrlBlur() {
    if (icloudAlbumUrl && isValidICloudAlbumUrl(icloudAlbumUrl)) {
      emitChange({ icloud_album_url: icloudAlbumUrl });
    }
  }

  const sourceOptions = [
    { value: "google" as const, label: "Google Photos", logo: googlePhotosLogo },
    { value: "apple" as const, label: "Apple Photos", logo: applePhotosLogo },
  ];

  const selectedOption = sourceOptions.find((opt) => opt.value === photosSource);

  return (
    <div className="space-y-4">
      {/* Source selection dropdown */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Photo Source
        </label>
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="relative w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-left shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            {selectedOption ? (
              <span className="flex items-center gap-2">
                <img
                  src={selectedOption.logo}
                  alt=""
                  className="h-5 w-5 flex-shrink-0"
                />
                <span className="text-sm text-gray-900">
                  {selectedOption.label}
                </span>
              </span>
            ) : (
              <span className="text-sm text-gray-400">Select a source...</span>
            )}
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <svg
                className="h-5 w-5 text-gray-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          </button>

          {dropdownOpen && (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
              {sourceOptions.map((option) => (
                <li
                  key={option.value}
                  onClick={() => handleSourceChange(option.value)}
                  className="relative cursor-pointer select-none py-2 pl-3 pr-9 hover:bg-indigo-50"
                >
                  <span className="flex items-center gap-2">
                    <img
                      src={option.logo}
                      alt=""
                      className="h-5 w-5 flex-shrink-0"
                    />
                    <span className="text-sm text-gray-900">{option.label}</span>
                  </span>
                  {photosSource === option.value && (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-600">
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Session expired warning (Google only) */}
      {photosSource === "google" && sessionExpired && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            Photo session expired. Please re-pick your photos.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Google Photos UI */}
      {photosSource === "google" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Photos
          </label>
          {pickerSessionId && !sessionExpired ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                {photoCount} photo{photoCount !== 1 ? "s" : ""} selected
              </span>
              <button
                type="button"
                onClick={startPicking}
                disabled={picking}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {picking ? "Picking..." : "Re-pick Photos"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startPicking}
              disabled={picking}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {picking ? "Opening picker..." : "Pick Photos"}
            </button>
          )}
          <p className="mt-1 text-xs text-gray-400">
            Opens Google Photos picker to select photos for the slideshow.
          </p>
        </div>
      )}

      {/* Apple Photos UI */}
      {photosSource === "apple" && (
        <div>
          <label
            htmlFor="icloud-album-url"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            iCloud Shared Album URL
          </label>
          <input
            type="url"
            id="icloud-album-url"
            value={icloudAlbumUrl}
            onChange={(e) => handleICloudUrlChange(e.target.value)}
            onBlur={handleICloudUrlBlur}
            placeholder="https://www.icloud.com/sharedalbum/#..."
            className={`block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:outline-none ${
              urlError
                ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                : "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            }`}
          />
          {urlError && (
            <p className="mt-1 text-xs text-red-600">{urlError}</p>
          )}
          {!urlError && (
            <p className="mt-1 text-xs text-gray-400">
              Paste the URL of a public iCloud shared album. Photos will refresh
              every 8 hours.
            </p>
          )}
        </div>
      )}

      {/* Common controls - only show when source is selected */}
      {photosSource && (
        <>
          {/* Interval slider */}
          <div>
            <label
              htmlFor="photos-interval"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Interval: {intervalSeconds}s
            </label>
            <input
              id="photos-interval"
              type="range"
              min={5}
              max={120}
              step={5}
              value={intervalSeconds}
              onChange={(e) => {
                const v = Number(e.target.value);
                setIntervalSeconds(v);
                emitChange({ interval_seconds: v });
              }}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>5s</span>
              <span>120s</span>
            </div>
          </div>

          {/* Transition */}
          <div>
            <label
              htmlFor="photos-transition"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Transition
            </label>
            <select
              id="photos-transition"
              value={transition}
              onChange={(e) => {
                setTransition(e.target.value);
                emitChange({ transition: e.target.value });
              }}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="fade">Fade</option>
              <option value="slide">Slide</option>
              <option value="none">None</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}
