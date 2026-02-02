import { useState, useEffect } from "react";
import { api } from "../../shared/api";

interface Album {
  id: string;
  title: string;
  count: number;
}

interface Props {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export default function PhotosConfig({ config, onChange }: Props) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [albumId, setAlbumId] = useState<string>((config.album_id as string | undefined) ?? "");
  const [intervalSeconds, setIntervalSeconds] = useState<number>((config.interval_seconds as number | undefined) ?? 30);
  const [transition, setTransition] = useState<string>((config.transition as string | undefined) ?? "fade");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect -- synchronous loading state before async fetch is standard React pattern
    api
      .getGooglePhotoAlbums()
      .then((data) => {
        if (!cancelled) {
          setAlbums(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load albums");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function emitChange(updates: Partial<{ album_id: string; interval_seconds: number; transition: string }>) {
    const next = {
      ...config,
      album_id: updates.album_id ?? albumId,
      interval_seconds: updates.interval_seconds ?? intervalSeconds,
      transition: updates.transition ?? transition,
    };
    onChange(next);
  }

  if (error) {
    return (
      <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
        <p className="text-sm text-yellow-800">
          Google Photos is not connected. Please connect your Google account in the Integrations settings to configure photo widgets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="photos-album" className="block text-sm font-medium text-gray-700 mb-1">
          Album
        </label>
        {loading ? (
          <p className="text-sm text-gray-500">Loading albums...</p>
        ) : (
          <select
            id="photos-album"
            value={albumId}
            onChange={(e) => {
              setAlbumId(e.target.value);
              emitChange({ album_id: e.target.value });
            }}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">All photos</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.title} ({album.count} photos)
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label htmlFor="photos-interval" className="block text-sm font-medium text-gray-700 mb-1">
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

      <div>
        <label htmlFor="photos-transition" className="block text-sm font-medium text-gray-700 mb-1">
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
