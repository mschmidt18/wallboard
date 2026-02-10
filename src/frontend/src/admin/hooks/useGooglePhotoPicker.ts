import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../shared/api";

interface UseGooglePhotoPickerOptions {
  initialSessionId?: string;
  initialPhotoCount?: number;
}

interface UseGooglePhotoPickerResult {
  startPicking: () => Promise<void>;
  pickerSessionId: string;
  photoCount: number;
  picking: boolean;
  error: string | null;
  sessionExpired: boolean;
}

export function useGooglePhotoPicker(
  options: UseGooglePhotoPickerOptions = {},
): UseGooglePhotoPickerResult {
  const [pickerSessionId, setPickerSessionId] = useState<string>(
    options.initialSessionId ?? "",
  );
  const [photoCount, setPhotoCount] = useState<number>(
    options.initialPhotoCount ?? 0,
  );
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupRef = useRef<Window | null>(null);

  // Check if existing session is still valid on mount
  useEffect(() => {
    if (!options.initialSessionId) return;
    let cancelled = false;
    api.pollPhotoPickerSession(options.initialSessionId).catch(() => {
      if (!cancelled) setSessionExpired(true);
    });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only check on mount

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    };
  }, [stopPolling]);

  const startPicking = useCallback(async () => {
    setError(null);
    setPicking(true);
    setSessionExpired(false);

    const popup = window.open("", "photoPicker", "width=900,height=700");
    popupRef.current = popup;

    try {
      const data = await api.createPhotoPickerSession();
      if (!popup || popup.closed) {
        setError("Popup was blocked. Please allow popups for this site.");
        setPicking(false);
        return;
      }
      popup.location.href = data.picker_uri + "/autoclose";

      const pollingInterval =
        (data.polling_config as Record<string, unknown>)?.pollInterval
          ? Number(
              String(
                (data.polling_config as Record<string, unknown>).pollInterval,
              ).replace("s", ""),
            ) * 1000
          : 3000;

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
            setPicking(false);
            return;
          }
        } catch {
          // Polling error, keep trying
        }

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
  }, []);

  return {
    startPicking,
    pickerSessionId,
    photoCount,
    picking,
    error,
    sessionExpired,
  };
}
