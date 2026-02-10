import { useEffect, useState, useRef, useCallback, useMemo } from "react";

interface Photo {
  url: string;
}

interface SlideshowResult {
  frontSrc: string | null;
  backSrc: string | null;
  showFront: boolean;
  hasPhotos: boolean;
}

export function useSlideshow(photos: Photo[], intervalMs: number): SlideshowResult {
  const [showFront, setShowFront] = useState(true);
  const indexRef = useRef(0);
  const [frontSrc, setFrontSrc] = useState<string | null>(null);
  const [backSrc, setBackSrc] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const preloadImage = useCallback((src: string): Promise<void> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
    });
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

  // Cycle through photos on interval
  useEffect(() => {
    if (shuffled.length <= 1) return;

    timerRef.current = setInterval(() => {
      const nextIdx = (indexRef.current + 1) % shuffled.length;
      indexRef.current = nextIdx;
      const nextUrl = shuffled[nextIdx].url;

      preloadImage(nextUrl).then(() => {
        setShowFront((front) => {
          if (front) {
            setBackSrc(nextUrl);
          } else {
            setFrontSrc(nextUrl);
          }
          return !front;
        });
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- photosKey and shuffled.length are the stable deps
  }, [shuffled.length, intervalMs, preloadImage, photosKey]);

  return {
    frontSrc,
    backSrc,
    showFront,
    hasPhotos: shuffled.length > 0,
  };
}
