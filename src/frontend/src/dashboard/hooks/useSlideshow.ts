import { useEffect, useState, useRef, useCallback, useMemo } from "react";

interface Photo {
  url: string;
}

interface SlideshowResult {
  frontSrc: string | null;
  backSrc: string | null;
  showFront: boolean;
  hasPhotos: boolean;
  advance: () => void;
}

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm"];

export function isVideoUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return url.toLowerCase().includes(".mp4");
  }
}

export function useSlideshow(photos: Photo[], intervalMs: number): SlideshowResult {
  const [showFront, setShowFront] = useState(true);
  const indexRef = useRef(0);
  const [frontSrc, setFrontSrc] = useState<string | null>(null);
  const [backSrc, setBackSrc] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const photosKey = useMemo(
    () => photos.map((p) => p.url).join(","),
    [photos],
  );

  const shuffled: Photo[] = useMemo(() => {
    const arr = [...photos];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-shuffle only when photo set changes
  }, [photosKey]);

  // Use ref so setTimeout callbacks always see latest shuffled array
  const shuffledRef = useRef(shuffled);
  shuffledRef.current = shuffled;

  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const preload = useCallback((src: string): Promise<void> => {
    // Skip preloading for videos — the <video> element handles its own loading
    if (isVideoUrl(src)) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
    });
  }, []);

  // Core advance function stored in ref to avoid stale closures
  const advanceFnRef = useRef<() => void>(() => {});

  const scheduleNext = useCallback(() => {
    clearTimer();
    const currentUrl = shuffledRef.current[indexRef.current]?.url;
    if (currentUrl && isVideoUrl(currentUrl)) {
      // Safety fallback: advance after 5 min if onEnded never fires (broken video)
      timerRef.current = setTimeout(() => {
        advanceFnRef.current();
      }, 5 * 60 * 1000);
      return;
    }
    timerRef.current = setTimeout(() => {
      advanceFnRef.current();
    }, intervalRef.current);
  }, [clearTimer]);

  const scheduleRef = useRef(scheduleNext);
  scheduleRef.current = scheduleNext;

  useEffect(() => {
    advanceFnRef.current = () => {
      const arr = shuffledRef.current;
      if (arr.length <= 1) return;

      clearTimer();

      const nextIdx = (indexRef.current + 1) % arr.length;
      indexRef.current = nextIdx;
      const nextUrl = arr[nextIdx].url;

      preload(nextUrl).then(() => {
        setShowFront((front) => {
          if (front) {
            setBackSrc(nextUrl);
          } else {
            setFrontSrc(nextUrl);
          }
          return !front;
        });
        scheduleRef.current();
      });
    };
  }, [clearTimer, preload]);

  const advance = useCallback(() => {
    advanceFnRef.current();
  }, []);

  // Initialize the first image when the photo set changes.
  useEffect(() => {
    if (shuffled.length === 0) return;
    const url = shuffled[0].url;
    indexRef.current = 0;
    setFrontSrc(url);
    setBackSrc(null);
    setShowFront(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- photosKey is the stable dep
  }, [photosKey]);

  // Start cycling timer
  useEffect(() => {
    if (shuffled.length <= 1) return;

    scheduleRef.current();

    return () => {
      clearTimer();
    };
  }, [shuffled.length, intervalMs, photosKey, clearTimer]);

  return {
    frontSrc,
    backSrc,
    showFront,
    hasPhotos: shuffled.length > 0,
    advance,
  };
}
