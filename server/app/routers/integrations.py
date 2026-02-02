import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from server.app.config import Config
from server.app.database import get_db
from server.app.models import Integration
from server.app.routers.settings import require_auth
from server.app.services.google_auth import build_auth_url, exchange_code
from server.app.services.encryption import load_or_create_key, encrypt, decrypt

router = APIRouter(prefix="/api/integrations", tags=["integrations"])

# Module-level config; set via set_config() during app startup or tests.
_config: Optional[Config] = None


def set_config(config: Config) -> None:
    global _config
    _config = config


def _settings_path() -> Path:
    assert _config is not None, "Config not set; call set_config() first"
    return _config.db_path.parent / "settings.json"


def _key_path() -> Path:
    assert _config is not None, "Config not set; call set_config() first"
    return _config.secret_key_path


def _get_settings() -> dict:
    path = _settings_path()
    if path.exists():
        return json.loads(path.read_text())
    return {}


@router.get("", dependencies=[Depends(require_auth)])
def list_integrations(db: Session = Depends(get_db)):
    integrations = db.query(Integration).all()
    return [
        {
            "id": i.id,
            "provider": i.provider,
            "status": i.status,
            "created_at": i.created_at.isoformat(),
        }
        for i in integrations
    ]


@router.post("/google/connect", dependencies=[Depends(require_auth)])
def connect_google(request: Request, db: Session = Depends(get_db)):
    settings = _get_settings()
    client_id = settings.get("google_client_id")
    if not client_id:
        raise HTTPException(status_code=400, detail="Google client ID not configured")
    redirect_uri = str(request.base_url).rstrip("/") + "/api/integrations/google/callback"
    url = build_auth_url(client_id=client_id, redirect_uri=redirect_uri)
    return {"auth_url": url}


@router.get("/google/callback")
async def google_callback(code: str, request: Request, db: Session = Depends(get_db)):
    settings = _get_settings()
    client_id = settings.get("google_client_id", "")
    client_secret = settings.get("google_client_secret", "")
    redirect_uri = str(request.base_url).rstrip("/") + "/api/integrations/google/callback"

    tokens = await exchange_code(
        code=code,
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
    )

    # Store expires_at as absolute timestamp for refresh logic
    import time
    if "expires_in" in tokens and "expires_at" not in tokens:
        tokens["expires_at"] = time.time() + tokens["expires_in"]

    key = load_or_create_key(_key_path())
    encrypted = encrypt(json.dumps(tokens), key)

    existing = db.query(Integration).filter(Integration.provider == "google").first()
    if existing:
        existing.credentials = encrypted
        existing.status = "connected"
    else:
        integration = Integration(
            provider="google",
            credentials=encrypted,
            status="connected",
        )
        db.add(integration)
    db.commit()

    return RedirectResponse(url="/admin/integrations?connected=true")


@router.delete("/google", status_code=204, dependencies=[Depends(require_auth)])
def disconnect_google(db: Session = Depends(get_db)):
    integration = db.query(Integration).filter(Integration.provider == "google").first()
    if not integration:
        raise HTTPException(status_code=404, detail="Google integration not found")
    db.delete(integration)
    db.commit()
