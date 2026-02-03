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


@patch("server.app.routers.google_data.create_picker_session", new_callable=AsyncMock)
@patch("server.app.routers.google_data._get_access_token", new_callable=AsyncMock)
def test_create_photo_picker_session(mock_token, mock_create, authed_client, google_integration):
    mock_token.return_value = "test-token"
    mock_create.return_value = {
        "id": "session-abc",
        "pickerUri": "https://picker.google.com/abc",
        "pollingConfig": {"pollInterval": "3s"},
        "mediaItemsSet": False,
    }
    response = authed_client.post("/api/google/photos/picker-session")
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "session-abc"
    assert data["picker_uri"] == "https://picker.google.com/abc"
    mock_create.assert_called_once_with(access_token="test-token")


@patch("server.app.routers.google_data.get_session_media_items", new_callable=AsyncMock)
@patch("server.app.routers.google_data.get_picker_session", new_callable=AsyncMock)
@patch("server.app.routers.google_data._get_access_token", new_callable=AsyncMock)
def test_poll_photo_picker_session_complete(mock_token, mock_get_session, mock_get_items, authed_client, google_integration):
    mock_token.return_value = "test-token"
    mock_get_session.return_value = {"mediaItemsSet": True}
    mock_get_items.return_value = [
        {"id": "item1", "baseUrl": "https://lh3.googleusercontent.com/photo1", "mimeType": "image/jpeg"},
    ]
    response = authed_client.get("/api/google/photos/picker-session/session-abc")
    assert response.status_code == 200
    data = response.json()
    assert data["media_items_set"] is True
    assert len(data["photos"]) == 1
    assert data["photos"][0]["id"] == "item1"
    assert data["photos"][0]["url"].startswith("/api/photos/proxy?")


@patch("server.app.routers.google_data.get_picker_session", new_callable=AsyncMock)
@patch("server.app.routers.google_data._get_access_token", new_callable=AsyncMock)
def test_poll_photo_picker_session_pending(mock_token, mock_get_session, authed_client, google_integration):
    mock_token.return_value = "test-token"
    mock_get_session.return_value = {"mediaItemsSet": False}
    response = authed_client.get("/api/google/photos/picker-session/session-abc")
    assert response.status_code == 200
    data = response.json()
    assert data["media_items_set"] is False
    assert "photos" not in data


@patch("server.app.routers.google_data.delete_picker_session", new_callable=AsyncMock)
@patch("server.app.routers.google_data._get_access_token", new_callable=AsyncMock)
def test_delete_photo_picker_session(mock_token, mock_delete, authed_client, google_integration):
    mock_token.return_value = "test-token"
    response = authed_client.delete("/api/google/photos/picker-session/session-abc")
    assert response.status_code == 200
    mock_delete.assert_called_once_with(access_token="test-token", session_id="session-abc")


@patch("server.app.routers.google_data._get_access_token", new_callable=AsyncMock)
def test_get_calendars_without_integration(mock_token, authed_client):
    from fastapi import HTTPException
    mock_token.side_effect = HTTPException(status_code=400, detail="Google not connected")
    response = authed_client.get("/api/google/calendars")
    assert response.status_code == 400
