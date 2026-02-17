import { useCallback, useEffect, useRef } from "react";
import { useSlideshow, isVideoUrl } from "./hooks/useSlideshow";

interface BackgroundSlideshowProps {
  photos: { url: string }[];
  intervalSeconds: number;
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

export default function BackgroundSlideshow({ photos, intervalSeconds }: BackgroundSlideshowProps) {
  const intervalMs = intervalSeconds * 1000;
  const { frontSrc, backSrc, showFront, advance } = useSlideshow(photos, intervalMs);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
      {frontSrc && (
        <SlideLayer
          src={frontSrc}
          opacity={showFront ? 1 : 0}
          onVideoEnded={showFront ? advance : undefined}
          intervalMs={intervalMs}
        />
      )}
      {backSrc && (
        <SlideLayer
          src={backSrc}
          opacity={showFront ? 0 : 1}
          onVideoEnded={!showFront ? advance : undefined}
          intervalMs={intervalMs}
        />
      )}
      {/* Dark scrim for text readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
        }}
      />
    </div>
  );
}
