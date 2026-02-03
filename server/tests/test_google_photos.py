import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from server.app.services.google_photos import (
    create_picker_session,
    get_picker_session,
    get_session_media_items,
    delete_picker_session,
)


@pytest.mark.asyncio
async def test_create_picker_session():
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "id": "session-123",
        "pickerUri": "https://picker.google.com/abc",
        "pollingConfig": {"pollInterval": "3s"},
        "mediaItemsSet": False,
    }
    mock_response.raise_for_status = MagicMock()

    with patch("server.app.services.google_photos.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.post.return_value = mock_response
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance
        result = await create_picker_session(access_token="test-token")

    assert result["id"] == "session-123"
    assert result["pickerUri"] == "https://picker.google.com/abc"
    assert result["mediaItemsSet"] is False
    client_instance.post.assert_called_once()


@pytest.mark.asyncio
async def test_get_picker_session():
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "id": "session-123",
        "pickerUri": "https://picker.google.com/abc",
        "mediaItemsSet": True,
    }
    mock_response.raise_for_status = MagicMock()

    with patch("server.app.services.google_photos.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.get.return_value = mock_response
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance
        result = await get_picker_session(access_token="test-token", session_id="session-123")

    assert result["mediaItemsSet"] is True
    client_instance.get.assert_called_once()


@pytest.mark.asyncio
async def test_get_session_media_items():
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "mediaItems": [
            {"id": "item1", "mediaFile": {"baseUrl": "https://lh3.googleusercontent.com/photo1", "mimeType": "image/jpeg"}},
            {"id": "item2", "mediaFile": {"baseUrl": "https://lh3.googleusercontent.com/photo2", "mimeType": "image/png"}},
        ]
    }
    mock_response.raise_for_status = MagicMock()

    with patch("server.app.services.google_photos.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.get.return_value = mock_response
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance
        items = await get_session_media_items(access_token="test-token", session_id="session-123")

    assert len(items) == 2
    assert items[0]["id"] == "item1"
    assert items[0]["baseUrl"] == "https://lh3.googleusercontent.com/photo1"
    assert items[0]["mimeType"] == "image/jpeg"
    assert items[1]["baseUrl"] == "https://lh3.googleusercontent.com/photo2"


@pytest.mark.asyncio
async def test_get_session_media_items_paginates():
    """get_session_media_items should follow nextPageToken to get all pages."""
    page1_response = MagicMock()
    page1_response.json.return_value = {
        "mediaItems": [
            {"id": "item1", "mediaFile": {"baseUrl": "https://lh3.googleusercontent.com/photo1", "mimeType": "image/jpeg"}},
        ],
        "nextPageToken": "token_page2",
    }
    page1_response.raise_for_status = MagicMock()

    page2_response = MagicMock()
    page2_response.json.return_value = {
        "mediaItems": [
            {"id": "item2", "mediaFile": {"baseUrl": "https://lh3.googleusercontent.com/photo2", "mimeType": "image/png"}},
        ],
    }
    page2_response.raise_for_status = MagicMock()

    with patch("server.app.services.google_photos.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.get.side_effect = [page1_response, page2_response]
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance

        items = await get_session_media_items(access_token="test-token", session_id="session-123")

    assert len(items) == 2
    assert items[0]["id"] == "item1"
    assert items[1]["id"] == "item2"


@pytest.mark.asyncio
async def test_delete_picker_session():
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()

    with patch("server.app.services.google_photos.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.delete.return_value = mock_response
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance
        await delete_picker_session(access_token="test-token", session_id="session-123")

    client_instance.delete.assert_called_once()
