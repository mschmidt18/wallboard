import { describe, it, expect, vi, afterEach } from 'vitest';
import { geocodeZip, GeocodingError } from './geocoding.js';

describe('geocodeZip', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns coordinates for valid zip code', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        'post code': '10001',
        country: 'United States',
        places: [
          {
            'place name': 'New York City',
            longitude: '-73.9967',
            state: 'New York',
            'state abbreviation': 'NY',
            latitude: '40.7484',
          },
        ],
      }),
    });

    const result = await geocodeZip('10001');

    expect(result).toEqual({
      lat: 40.7484,
      lon: -73.9967,
      locationName: 'New York City, NY',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.zippopotam.us/us/10001',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('throws GeocodingError for invalid zip code (404)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(geocodeZip('00000')).rejects.toThrow(GeocodingError);
    await expect(geocodeZip('00000')).rejects.toThrow(
      'No location found for zip code: 00000',
    );
  });

  it('throws GeocodingError on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    await expect(geocodeZip('10001')).rejects.toThrow(GeocodingError);
    await expect(geocodeZip('10001')).rejects.toThrow(
      'Geocoding service unavailable: Network failure',
    );
  });

  it('throws GeocodingError for server errors (non-404)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    await expect(geocodeZip('10001')).rejects.toThrow(GeocodingError);
  });
});
