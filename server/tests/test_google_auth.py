import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from server.app.services.google_auth import build_auth_url, exchange_code


def test_build_auth_url():
    url = build_auth_url(
        client_id="test-client-id",
        redirect_uri="http://localhost:8000/api/integrations/google/callback",
    )
    assert "test-client-id" in url
    assert "calendar.readonly" in url
    assert "photoslibrary.readonly" in url
    assert "redirect_uri" in url


@pytest.mark.asyncio
async def test_exchange_code_returns_tokens():
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "access_token": "access123",
        "refresh_token": "refresh456",
        "expires_in": 3600,
        "token_type": "Bearer",
    }
    mock_response.raise_for_status = lambda: None

    with patch("server.app.services.google_auth.httpx.AsyncClient") as MockClient:
        client_instance = AsyncMock()
        client_instance.post.return_value = mock_response
        client_instance.__aenter__ = AsyncMock(return_value=client_instance)
        client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = client_instance

        tokens = await exchange_code(
            code="auth-code",
            client_id="test-id",
            client_secret="test-secret",
            redirect_uri="http://localhost:8000/api/integrations/google/callback",
        )

    assert tokens["access_token"] == "access123"
    assert tokens["refresh_token"] == "refresh456"
