import { useEffect, useState, useRef, useCallback, useMemo } from "react";

interface PhotosWidgetProps {
  config: {
    picker_session_id?: string;
    interval_seconds?: number;
  };
  data?: Record<string, unknown> | null;
}

interface Photo {
  url: string;
  width: number;
  height: number;
}

export default function PhotosWidget({ config, data }: PhotosWidgetProps) {
  const [showFront, setShowFront] = useState(true);
  const indexRef = useRef(0);
  const [frontSrc, setFrontSrc] = useState<string | null>(null);
  const [backSrc, setBackSrc] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const photos: Photo[] = useMemo(
    () => (data?.photos as Photo[] | undefined) ?? [],
    [data?.photos],
  );
  const photosKey = useMemo(
    () => photos.map((p) => p.url).join(","),
    [photos],
  );
  const interval = (config.interval_seconds ?? 30) * 1000;

  const preloadImage = useCallback((src: string): Promise<void> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
    });
  }, []);

  // Initialize the first image when the photo set changes.
  // photosKey is used instead of photos to avoid re-running when the array
  // reference changes but the URLs haven't. setState is intentional here as
  // this is a one-time initialization when the photo set changes.
  useEffect(() => {
    if (photos.length === 0) return;
    const url = photos[0].url;
    indexRef.current = 0;
    setFrontSrc(url);
    setBackSrc(null);
    setShowFront(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- photos is derived from data; photosKey is the stable dep
  }, [photosKey]);

  // Cycle through photos on interval
  useEffect(() => {
    if (photos.length <= 1) return;

    timerRef.current = setInterval(() => {
      const nextIdx = (indexRef.current + 1) % photos.length;
      indexRef.current = nextIdx;
      const nextUrl = photos[nextIdx].url;

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
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- photos is derived from data; photosKey and photos.length are the stable deps
  }, [photos.length, interval, preloadImage, photosKey]);

  if (photos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-white/50">
        <span className="text-lg">No photos</span>
      </div>
    );
  }

  const imgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transition: "opacity 1s ease-in-out",
  };

  return (
    <div className="h-full w-full relative overflow-hidden">
      {frontSrc && (
        <img
          src={frontSrc}
          alt=""
          style={{
            ...imgStyle,
            opacity: showFront ? 1 : 0,
          }}
        />
      )}
      {backSrc && (
        <img
          src={backSrc}
          alt=""
          style={{
            ...imgStyle,
            opacity: showFront ? 0 : 1,
          }}
        />
      )}
    </div>
  );
}
