import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from server.app.models import Integration
from server.app.services.encryption import generate_key, encrypt


@pytest.fixture
def google_integration(db_session):
    """Create a connected Google integration with encrypted tokens."""
    key = generate_key()
    tokens = json.dumps({"access_token": "test-token", "refresh_token": "refresh-token"})
    encrypted = encrypt(tokens, key)
    integration = Integration(
        provider="google",
        credentials=encrypted,
        status="connected",
    )
    db_session.add(integration)
    db_session.commit()
    return key


@patch("server.app.routers.google_data.fetch_calendars", new_callable=AsyncMock)
@patch("server.app.routers.google_data._get_access_token", new_callable=AsyncMock)
def test_get_calendars(mock_token, mock_fetch, authed_client, google_integration):
    mock_token.return_value = "test-token"
    mock_fetch.return_value = [
        {"id": "primary", "name": "My Calendar", "color": "#4285f4"},
    ]
    response = authed_client.get("/api/google/calendars")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == "primary"
    mock_fetch.assert_called_once_with(access_token="test-token")


@patch("server.app.routers.google_data.fetch_albums", new_callable=AsyncMock)
@patch("server.app.routers.google_data._get_access_token", new_callable=AsyncMock)
def test_get_photo_albums(mock_token, mock_fetch, authed_client, google_integration):
    mock_token.return_value = "test-token"
    mock_fetch.return_value = [
        {"id": "album1", "title": "Vacation", "count": 42},
    ]
    response = authed_client.get("/api/google/photos/albums")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Vacation"


@patch("server.app.routers.google_data.fetch_album_photos", new_callable=AsyncMock)
@patch("server.app.routers.google_data._get_access_token", new_callable=AsyncMock)
def test_get_album_photos(mock_token, mock_fetch, authed_client, google_integration):
    mock_token.return_value = "test-token"
    mock_fetch.return_value = [
        {"id": "photo1", "url": "https://example.com/photo1", "width": 1920, "height": 1080},
    ]
    response = authed_client.get("/api/google/photos/albums/album1/photos")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["width"] == 1920


@patch("server.app.routers.google_data._get_access_token", new_callable=AsyncMock)
def test_get_calendars_without_integration(mock_token, authed_client):
    from fastapi import HTTPException
    mock_token.side_effect = HTTPException(status_code=400, detail="Google not connected")
    response = authed_client.get("/api/google/calendars")
    assert response.status_code == 400
