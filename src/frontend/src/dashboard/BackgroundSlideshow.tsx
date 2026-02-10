import { useSlideshow } from "./hooks/useSlideshow";

interface BackgroundSlideshowProps {
  photos: { url: string }[];
  intervalSeconds: number;
}

export default function BackgroundSlideshow({ photos, intervalSeconds }: BackgroundSlideshowProps) {
  const { frontSrc, backSrc, showFront } = useSlideshow(photos, intervalSeconds * 1000);

  const imgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transition: "opacity 1s ease-in-out",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
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
      {/* Dark scrim for text readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.3)",
        }}
      />
    </div>
  );
}
