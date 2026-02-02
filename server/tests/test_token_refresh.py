"""Tests for Google OAuth token refresh logic."""

import json
import time
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.app.models import Base, Integration, Layout, Widget
from server.app.services.encryption import generate_key, encrypt, decrypt
from server.app.services.google_auth import get_valid_access_token


@pytest.fixture
def token_db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    return factory


@pytest.fixture
def secret_key():
    return generate_key()


def _store_tokens(factory, key, tokens_dict):
    """Helper to store encrypted tokens in the integration table."""
    encrypted = encrypt(json.dumps(tokens_dict), key)
    with factory() as session:
        existing = session.query(Integration).filter(
            Integration.provider == "google"
        ).first()
        if existing:
            existing.credentials = encrypted
        else:
            integration = Integration(
                provider="google",
                credentials=encrypted,
                status="connected",
            )
            session.add(integration)
        session.commit()


@pytest.mark.asyncio
async def test_returns_access_token_when_not_expired(token_db, secret_key):
    """When the stored token has not expired, return it without refreshing."""
    tokens = {
        "access_token": "valid-token",
        "refresh_token": "refresh-token",
        "expires_at": time.time() + 3600,  # 1 hour from now
    }
    _store_tokens(token_db, secret_key, tokens)

    with token_db() as session:
        result = await get_valid_access_token(
            session=session,
            encryption_key=secret_key,
            client_id="test-client-id",
            client_secret="test-client-secret",
        )

    assert result == "valid-token"


@pytest.mark.asyncio
async def test_refreshes_token_when_expired(token_db, secret_key):
    """When the stored token has expired and a refresh_token exists, refresh it."""
    tokens = {
        "access_token": "expired-token",
        "refresh_token": "valid-refresh-token",
        "expires_at": time.time() - 100,  # expired 100 seconds ago
    }
    _store_tokens(token_db, secret_key, tokens)

    mock_response = {
        "access_token": "new-access-token",
        "expires_in": 3600,
    }
    with patch(
        "server.app.services.google_auth.refresh_access_token",
        new_callable=AsyncMock,
        return_value=mock_response,
    ) as mock_refresh:
        with token_db() as session:
            result = await get_valid_access_token(
                session=session,
                encryption_key=secret_key,
                client_id="test-client-id",
                client_secret="test-client-secret",
            )

        mock_refresh.assert_called_once_with(
            refresh_token="valid-refresh-token",
            client_id="test-client-id",
            client_secret="test-client-secret",
        )

    assert result == "new-access-token"

    # Verify new tokens were saved back to the database
    with token_db() as session:
        integration = session.query(Integration).filter(
            Integration.provider == "google"
        ).first()
        saved_tokens = json.loads(decrypt(integration.credentials, secret_key))
        assert saved_tokens["access_token"] == "new-access-token"
        assert saved_tokens["refresh_token"] == "valid-refresh-token"  # preserved
        assert saved_tokens["expires_at"] > time.time()  # set to future


@pytest.mark.asyncio
async def test_returns_none_when_no_refresh_token(token_db, secret_key):
    """When the token is expired and there is no refresh_token, return None and log warning."""
    tokens = {
        "access_token": "expired-token",
        "expires_at": time.time() - 100,
    }
    _store_tokens(token_db, secret_key, tokens)

    with token_db() as session:
        result = await get_valid_access_token(
            session=session,
            encryption_key=secret_key,
            client_id="test-client-id",
            client_secret="test-client-secret",
        )

    assert result is None


@pytest.mark.asyncio
async def test_returns_none_when_no_integration(token_db, secret_key):
    """When there is no Google integration, return None."""
    with token_db() as session:
        result = await get_valid_access_token(
            session=session,
            encryption_key=secret_key,
            client_id="test-client-id",
            client_secret="test-client-secret",
        )

    assert result is None


@pytest.mark.asyncio
async def test_treats_missing_expires_at_as_expired(token_db, secret_key):
    """Tokens without expires_at should be treated as expired and refreshed."""
    tokens = {
        "access_token": "old-token",
        "refresh_token": "valid-refresh-token",
        # no expires_at
    }
    _store_tokens(token_db, secret_key, tokens)

    mock_response = {
        "access_token": "refreshed-token",
        "expires_in": 3600,
    }
    with patch(
        "server.app.services.google_auth.refresh_access_token",
        new_callable=AsyncMock,
        return_value=mock_response,
    ):
        with token_db() as session:
            result = await get_valid_access_token(
                session=session,
                encryption_key=secret_key,
                client_id="test-client-id",
                client_secret="test-client-secret",
            )

    assert result == "refreshed-token"
