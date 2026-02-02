import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.app.config import Config
from server.app.database import get_db
from server.app.models import Integration
from server.app.routers.settings import require_auth
from server.app.services.encryption import load_or_create_key, decrypt
from server.app.services.google_auth import get_valid_access_token
from server.app.services.google_calendar import fetch_calendars, fetch_events
from server.app.services.google_photos import fetch_albums, fetch_album_photos

router = APIRouter(prefix="/api/google", tags=["google_data"], dependencies=[Depends(require_auth)])

# Module-level config; set via set_config() during app startup or tests.
_config: Optional[Config] = None


def set_config(config: Config) -> None:
    global _config
    _config = config


def _key_path() -> Path:
    assert _config is not None, "Config not set; call set_config() first"
    return _config.secret_key_path


def _settings_path() -> Path:
    assert _config is not None, "Config not set; call set_config() first"
    return _config.db_path.parent / "settings.json"


async def _get_access_token(db: Session) -> str:
    key = load_or_create_key(_key_path())
    settings_file = _settings_path()
    settings = {}
    if settings_file.exists():
        settings = json.loads(settings_file.read_text())
    client_id = settings.get("google_client_id", "")
    client_secret = settings.get("google_client_secret", "")

    token = await get_valid_access_token(
        session=db,
        encryption_key=key,
        client_id=client_id,
        client_secret=client_secret,
    )
    if not token:
        raise HTTPException(status_code=400, detail="Google not connected")
    return token


@router.get("/calendars")
async def get_calendars(db: Session = Depends(get_db)):
    access_token = await _get_access_token(db)
    return await fetch_calendars(access_token=access_token)


@router.get("/photos/albums")
async def get_photo_albums(db: Session = Depends(get_db)):
    access_token = await _get_access_token(db)
    return await fetch_albums(access_token=access_token)


@router.get("/photos/albums/{album_id}/photos")
async def get_album_photos(album_id: str, db: Session = Depends(get_db)):
    access_token = await _get_access_token(db)
    return await fetch_album_photos(access_token=access_token, album_id=album_id)
