import { useMemo } from "react";
import { useSlideshow } from "../hooks/useSlideshow";

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

export default function PhotosWidget({ config, data }: PhotosWidgetProps) {
  const photos: Photo[] = useMemo(
    () => (data?.photos as Photo[] | undefined) ?? [],
    [data?.photos],
  );
  const interval = (config.interval_seconds ?? 30) * 1000;
  const { frontSrc, backSrc, showFront, hasPhotos } = useSlideshow(photos, interval);

  if (!hasPhotos) {
    return (
      <div className="h-full flex items-center justify-center opacity-50">
        <span className="text-d-lg">No photos</span>
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
