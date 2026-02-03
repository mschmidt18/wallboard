export class GeocodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeocodingError';
  }
}

export async function geocodeZip(
  zipCode: string,
): Promise<{ lat: number; lon: number; locationName: string }> {
  const url = `https://api.zippopotam.us/us/${zipCode}`;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch (e) {
    throw new GeocodingError(
      `Geocoding service unavailable: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (response.status === 404) {
    throw new GeocodingError(`No location found for zip code: ${zipCode}`);
  }
  if (!response.ok) {
    throw new GeocodingError(
      `Geocoding failed with status ${response.status}`,
    );
  }

  const data = await response.json();
  const place = data.places[0];
  const lat = parseFloat(place.latitude);
  const lon = parseFloat(place.longitude);
  const locationName = `${place['place name']}, ${place['state abbreviation']}`;

  return { lat, lon, locationName };
}
