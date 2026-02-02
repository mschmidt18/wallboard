"""Tests for issue #12: hardcoded secret key path bypasses Config.

Verify that refresh.py, integrations.py, and google_data.py read paths
from Config instead of hardcoding /etc/wallboard/secret.key and
~/.wallboard/settings.json.
"""
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.app.config import Config
from server.app.models import Base, Layout, Widget, Integration
from server.app.services.encryption import generate_key, encrypt, load_or_create_key


# ---------- refresh.py ----------

@pytest.fixture
def refresh_db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/refresh_test.db")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


@pytest.fixture
def refresh_config(tmp_path):
    """Create a Config pointing at tmp_path with a real encryption key and settings."""
    config = Config.for_testing(tmp_path)
    # Create a real secret key file
    key = generate_key()
    config.secret_key_path.write_bytes(key)
    # Create a settings file with Google credentials
    settings_path = config.db_path.parent / "settings.json"
    settings_path.write_text(json.dumps({
        "google_client_id": "test-client-id",
        "google_client_secret": "test-client-secret",
    }))
    return config, key


@pytest.mark.asyncio
async def test_refresh_get_google_access_token_uses_config_paths(refresh_db, refresh_config):
    """_get_google_access_token should read the key from Config.secret_key_path,
    not from /etc/wallboard/secret.key."""
    config, key = refresh_config

    # Seed a Google integration with tokens encrypted using our test key
    tokens = json.dumps({
        "access_token": "test-access-token",
        "refresh_token": "test-refresh-token",
        "expires_at": 9999999999,  # far future
    })
    encrypted = encrypt(tokens, key)
    with refresh_db() as session:
        integration = Integration(
            provider="google",
            credentials=encrypted,
            status="connected",
        )
        session.add(integration)
        session.commit()

    from server.app.services.refresh import _get_google_access_token

    with refresh_db() as session:
        token = await _get_google_access_token(session, config)

    assert token == "test-access-token"


# ---------- integrations.py ----------

def test_integrations_google_callback_uses_config_key_path(authed_client, tmp_config):
    """The google_callback endpoint should read the encryption key from
    Config.secret_key_path, not from /etc/wallboard/secret.key."""
    config = tmp_config
    # Create a secret key at the config path
    key = generate_key()
    config.secret_key_path.write_bytes(key)

    # Write google credentials to the config-derived settings path
    settings_path = config.db_path.parent / "settings.json"
    settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
    settings["google_client_id"] = "test-client-id"
    settings["google_client_secret"] = "test-client-secret"
    settings_path.write_text(json.dumps(settings))

    mock_tokens = {
        "access_token": "new-access",
        "refresh_token": "new-refresh",
        "expires_in": 3600,
    }

    with patch(
        "server.app.routers.integrations.exchange_code",
        new_callable=AsyncMock,
        return_value=mock_tokens,
    ):
        response = authed_client.get(
            "/api/integrations/google/callback",
            params={"code": "test-auth-code"},
            follow_redirects=False,
        )

    # Should redirect successfully (not crash trying to read /etc/wallboard/secret.key)
    assert response.status_code in (302, 307, 200)


# ---------- google_data.py ----------

def test_google_data_uses_config_key_path(authed_client, tmp_config, db_session):
    """_get_access_token in google_data.py should read the encryption key from
    Config.secret_key_path, not from /etc/wallboard/secret.key."""
    config = tmp_config
    # Create a secret key at the config path
    key = generate_key()
    config.secret_key_path.write_bytes(key)

    # Write google credentials to the config-derived settings path
    settings_path = config.db_path.parent / "settings.json"
    settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
    settings["google_client_id"] = "test-client-id"
    settings["google_client_secret"] = "test-client-secret"
    settings_path.write_text(json.dumps(settings))

    # Seed a Google integration with tokens encrypted using our test key
    tokens = json.dumps({
        "access_token": "test-access-token",
        "refresh_token": "test-refresh-token",
        "expires_at": 9999999999,
    })
    encrypted = encrypt(tokens, key)
    integration = Integration(
        provider="google",
        credentials=encrypted,
        status="connected",
    )
    db_session.add(integration)
    db_session.commit()

    with patch(
        "server.app.routers.google_data.fetch_calendars",
        new_callable=AsyncMock,
        return_value=[{"id": "primary", "name": "My Calendar"}],
    ):
        response = authed_client.get("/api/google/calendars")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == "primary"
