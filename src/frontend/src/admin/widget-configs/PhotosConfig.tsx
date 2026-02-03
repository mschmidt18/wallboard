import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../shared/api";

interface Props {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export default function PhotosConfig({ config, onChange }: Props) {
  const [pickerSessionId, setPickerSessionId] = useState<string>(
    (config.picker_session_id as string | undefined) ?? "",
  );
  const [photoCount, setPhotoCount] = useState<number>(
    (config.photo_count as number | undefined) ?? 0,
  );
  const [intervalSeconds, setIntervalSeconds] = useState<number>(
    (config.interval_seconds as number | undefined) ?? 30,
  );
  const [transition, setTransition] = useState<string>(
    (config.transition as string | undefined) ?? "fade",
  );
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupRef = useRef<Window | null>(null);

  // Check if existing session is still valid on mount
  useEffect(() => {
    if (!pickerSessionId) return;
    let cancelled = false;
    api
      .pollPhotoPickerSession(pickerSessionId)
      .catch(() => {
        if (!cancelled) setSessionExpired(true);
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only check on mount

  function emitChange(updates: Partial<{
    picker_session_id: string;
    photo_count: number;
    interval_seconds: number;
    transition: string;
  }>) {
    const next: Record<string, unknown> = {
      ...config,
      picker_session_id: updates.picker_session_id ?? pickerSessionId,
      photo_count: updates.photo_count ?? photoCount,
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
                (data.polling_config as Record<string, unknown>).pollInterval,
              ).replace("s", ""),
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
        err instanceof Error ? err.message : "Failed to start photo picker",
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

  if (error && !pickerSessionId) {
    return (
      <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
        <p className="text-sm text-yellow-800">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session expired warning */}
      {sessionExpired && (
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

      {/* Pick Photos */}
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
    </div>
  );
}
