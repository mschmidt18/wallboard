import httpx

GOOGLE_PHOTOS_API = "https://photoslibrary.googleapis.com/v1"


async def fetch_albums(access_token: str) -> list[dict]:
    """Fetch all albums from Google Photos.

    Returns a list of dicts with keys: id, title, count.
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{GOOGLE_PHOTOS_API}/albums",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        data = response.json()

    return [
        {
            "id": album["id"],
            "title": album["title"],
            "count": int(album.get("mediaItemsCount", 0)),
        }
        for album in data.get("albums", [])
    ]


async def fetch_album_photos(access_token: str, album_id: str) -> list[dict]:
    """Fetch photos from a specific Google Photos album.

    Returns a list of dicts with keys: id, url, width, height.
    The url has =w1920-h1080 appended for display-sized images.
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{GOOGLE_PHOTOS_API}/mediaItems:search",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"albumId": album_id},
        )
        response.raise_for_status()
        data = response.json()

    return [
        {
            "id": item["id"],
            "url": f"{item['baseUrl']}=w1920-h1080",
            "width": int(item["mediaMetadata"]["width"]),
            "height": int(item["mediaMetadata"]["height"]),
        }
        for item in data.get("mediaItems", [])
    ]
