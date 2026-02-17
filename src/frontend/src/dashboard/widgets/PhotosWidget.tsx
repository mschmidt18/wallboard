import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSlideshow, isVideoUrl } from "../hooks/useSlideshow";

interface PhotosWidgetProps {
  config: {
    picker_session_id?: string;
    interval_seconds?: number;
  };
  data?: Record<string, unknown> | null;
}

interface Photo {
  url: string;
}

function SlideLayer({
  src,
  opacity,
  onVideoEnded,
  intervalMs,
}: {
  src: string;
  opacity: number;
  onVideoEnded?: () => void;
  intervalMs: number;
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transition: "opacity 1s ease-in-out",
    opacity,
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canAdvanceRef = useRef(false);

  // When src changes, reset the advance flag and start an interval timer
  useEffect(() => {
    if (!isVideoUrl(src)) return;
    canAdvanceRef.current = false;
    const timer = setTimeout(() => {
      canAdvanceRef.current = true;
    }, intervalMs);
    return () => clearTimeout(timer);
  }, [src, intervalMs]);

  const handleVideoEnded = useCallback(() => {
    if (canAdvanceRef.current) {
      onVideoEnded?.();
    } else {
      // Video is shorter than interval — replay it
      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        video.play();
      }
    }
  }, [onVideoEnded]);

  if (isVideoUrl(src)) {
    return (
      <video
        key={src}
        ref={videoRef}
        src={src}
        autoPlay
        muted
        playsInline
        onEnded={handleVideoEnded}
        style={style}
      />
    );
  }

  return <img src={src} alt="" style={style} />;
}

export default function PhotosWidget({ config, data }: PhotosWidgetProps) {
  const photos: Photo[] = useMemo(
    () => (data?.photos as Photo[] | undefined) ?? [],
    [data?.photos],
  );
  const interval = (config.interval_seconds ?? 30) * 1000;
  const { frontSrc, backSrc, showFront, hasPhotos, advance } = useSlideshow(photos, interval);

  if (!hasPhotos) {
    return (
      <div className="h-full flex items-center justify-center opacity-50">
        <span className="text-d-lg">No photos</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative overflow-hidden">
      {frontSrc && (
        <SlideLayer
          src={frontSrc}
          opacity={showFront ? 1 : 0}
          onVideoEnded={showFront ? advance : undefined}
          intervalMs={interval}
        />
      )}
      {backSrc && (
        <SlideLayer
          src={backSrc}
          opacity={showFront ? 0 : 1}
          onVideoEnded={!showFront ? advance : undefined}
          intervalMs={interval}
        />
      )}
    </div>
  );
}
