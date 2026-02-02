import httpx


class GeocodingError(Exception):
    pass


async def geocode_zip(zip_code: str) -> dict:
    """Resolve a US zip code to lat/lon using Zippopotam.us."""
    url = f"https://api.zippopotam.us/us/{zip_code}"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10)
    except httpx.HTTPError as e:
        raise GeocodingError(f"Geocoding service unavailable: {e}")

    if response.status_code == 404:
        raise GeocodingError(f"No location found for zip code: {zip_code}")
    if response.status_code != 200:
        raise GeocodingError(f"Geocoding failed with status {response.status_code}")

    data = response.json()
    place = data["places"][0]
    lat = float(place["latitude"])
    lon = float(place["longitude"])
    location_name = f"{place['place name']}, {place['state abbreviation']}"
    return {"lat": lat, "lon": lon, "location_name": location_name}
