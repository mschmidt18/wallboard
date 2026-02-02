import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from server.app.services.google_photos import fetch_albums, fetch_album_photos


@pytest.mark.asyncio
async def test_fetch_albums():
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "albums": [
            {"id": "album1", "title": "Vacation 2025", "mediaItemsCount": "42"},
            {"id": "album2", "title": "Family", "mediaItemsCount": "120"},
        ]
    }
    mock_response.raise_for_status = MagicMock()

    with patch("server.app.services.google_photos.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.get.return_value = mock_response
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance
        albums = await fetch_albums(access_token="test-token")

    assert len(albums) == 2
    assert albums[0]["id"] == "album1"
    assert albums[0]["title"] == "Vacation 2025"
    assert albums[0]["count"] == 42


@pytest.mark.asyncio
async def test_fetch_album_photos():
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "mediaItems": [
            {"id": "photo1", "baseUrl": "https://lh3.googleusercontent.com/photo1",
             "mediaMetadata": {"width": "1920", "height": "1080"}},
            {"id": "photo2", "baseUrl": "https://lh3.googleusercontent.com/photo2",
             "mediaMetadata": {"width": "3840", "height": "2160"}},
        ]
    }
    mock_response.raise_for_status = MagicMock()

    with patch("server.app.services.google_photos.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.post.return_value = mock_response
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance
        photos = await fetch_album_photos(access_token="test-token", album_id="album1")

    assert len(photos) == 2
    assert photos[0]["url"].startswith("https://")
    assert photos[0]["width"] == 1920
