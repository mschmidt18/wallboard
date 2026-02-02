import json
import logging
import time
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/photoslibrary.readonly",
]

logger = logging.getLogger(__name__)


def build_auth_url(client_id: str, redirect_uri: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code(
    code: str, client_id: str, client_secret: str, redirect_uri: str,
) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        response.raise_for_status()
        return response.json()


async def refresh_access_token(
    refresh_token: str, client_id: str, client_secret: str,
) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "refresh_token",
            },
        )
        response.raise_for_status()
        return response.json()


async def get_valid_access_token(
    session: Session,
    encryption_key: bytes,
    client_id: str,
    client_secret: str,
) -> str | None:
    """Get a valid Google access token, refreshing if expired.

    Returns the access token string, or None if no integration exists
    or the token cannot be refreshed.
    """
    from server.app.models import Integration
    from server.app.services.encryption import decrypt, encrypt

    integration = session.query(Integration).filter(
        Integration.provider == "google", Integration.status == "connected"
    ).first()
    if not integration:
        return None

    try:
        tokens = json.loads(decrypt(integration.credentials, encryption_key))
    except Exception as e:
        logger.error(f"Failed to decrypt Google credentials: {e}")
        return None

    access_token = tokens.get("access_token")
    expires_at = tokens.get("expires_at")

    # Check if token is expired (or missing expiry = treat as expired)
    is_expired = expires_at is None or time.time() >= expires_at

    if not is_expired:
        return access_token

    # Token is expired, try to refresh
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        logger.warning("Google access token expired and no refresh token available")
        return None

    try:
        new_tokens = await refresh_access_token(
            refresh_token=refresh_token,
            client_id=client_id,
            client_secret=client_secret,
        )
    except Exception as e:
        logger.error(f"Failed to refresh Google access token: {e}")
        return None

    # Update stored tokens
    tokens["access_token"] = new_tokens["access_token"]
    if "refresh_token" in new_tokens:
        tokens["refresh_token"] = new_tokens["refresh_token"]
    tokens["expires_at"] = time.time() + new_tokens.get("expires_in", 3600)

    integration.credentials = encrypt(json.dumps(tokens), encryption_key)
    session.commit()

    return new_tokens["access_token"]
