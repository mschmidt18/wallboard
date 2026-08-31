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

function shuffle(photos: Photo[]): Photo[] {
  const arr = [...photos];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function useSlideshow(photos: Photo[], intervalMs: number): SlideshowResult {
  const [showFront, setShowFront] = useState(true);
  const [frontSrc, setFrontSrc] = useState<string | null>(null);
  const [backSrc, setBackSrc] = useState<string | null>(null);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Shuffled photo order lives in a ref so setTimeout callbacks always see the latest set
  const shuffledRef = useRef<Photo[]>([]);
  const intervalRef = useRef(intervalMs);

  const photosKey = useMemo(
    () => photos.map((p) => p.url).join(","),
    [photos],
  );
  const photoCount = photos.length;

  useEffect(() => {
    intervalRef.current = intervalMs;
  }, [intervalMs]);

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
  useEffect(() => {
    scheduleRef.current = scheduleNext;
  }, [scheduleNext]);

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

  // Re-shuffle and show the first image when the photo set changes.
  useEffect(() => {
    const arr = shuffle(photos);
    shuffledRef.current = arr;
    indexRef.current = 0;
    if (arr.length === 0) return;

    let cancelled = false;
    const url = arr[0].url;
    preload(url).then(() => {
      if (cancelled) return;
      setFrontSrc(url);
      setBackSrc(null);
      setShowFront(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- photosKey is the stable dep for photos
  }, [photosKey, preload]);

  // Start cycling timer
  useEffect(() => {
    if (photoCount <= 1) return;

    scheduleRef.current();

    return () => {
      clearTimer();
    };
  }, [photoCount, intervalMs, photosKey, clearTimer]);

  return {
    frontSrc,
    backSrc,
    showFront,
    hasPhotos: photoCount > 0,
    advance,
  };
}
