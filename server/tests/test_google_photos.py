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


@pytest.mark.asyncio
async def test_fetch_albums_paginates():
    """fetch_albums should follow nextPageToken to get all pages."""
    page1_response = MagicMock()
    page1_response.json.return_value = {
        "albums": [
            {"id": "album1", "title": "Page 1 Album", "mediaItemsCount": "10"},
        ],
        "nextPageToken": "token_page2",
    }
    page1_response.raise_for_status = MagicMock()

    page2_response = MagicMock()
    page2_response.json.return_value = {
        "albums": [
            {"id": "album2", "title": "Page 2 Album", "mediaItemsCount": "5"},
        ],
    }
    page2_response.raise_for_status = MagicMock()

    with patch("server.app.services.google_photos.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.get.side_effect = [page1_response, page2_response]
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance

        albums = await fetch_albums(access_token="test-token")

    assert len(albums) == 2
    assert albums[0]["id"] == "album1"
    assert albums[1]["id"] == "album2"
    assert albums[1]["title"] == "Page 2 Album"


@pytest.mark.asyncio
async def test_fetch_album_photos_paginates():
    """fetch_album_photos should follow nextPageToken to get all pages."""
    page1_response = MagicMock()
    page1_response.json.return_value = {
        "mediaItems": [
            {"id": "photo1", "baseUrl": "https://lh3.googleusercontent.com/photo1",
             "mediaMetadata": {"width": "1920", "height": "1080"}},
        ],
        "nextPageToken": "token_page2",
    }
    page1_response.raise_for_status = MagicMock()

    page2_response = MagicMock()
    page2_response.json.return_value = {
        "mediaItems": [
            {"id": "photo2", "baseUrl": "https://lh3.googleusercontent.com/photo2",
             "mediaMetadata": {"width": "3840", "height": "2160"}},
        ],
    }
    page2_response.raise_for_status = MagicMock()

    with patch("server.app.services.google_photos.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.post.side_effect = [page1_response, page2_response]
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance

        photos = await fetch_album_photos(access_token="test-token", album_id="album1")

    assert len(photos) == 2
    assert photos[0]["id"] == "photo1"
    assert photos[1]["id"] == "photo2"
