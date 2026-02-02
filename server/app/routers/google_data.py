import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.app.database import get_db
from server.app.models import Integration
from server.app.services.encryption import load_or_create_key, decrypt
from server.app.services.google_calendar import fetch_calendars, fetch_events
from server.app.services.google_photos import fetch_albums, fetch_album_photos

router = APIRouter(prefix="/api/google", tags=["google_data"])

KEY_PATH = Path("/etc/wallboard/secret.key")


def _get_access_token(db: Session) -> str:
    integration = db.query(Integration).filter(
        Integration.provider == "google", Integration.status == "connected"
    ).first()
    if not integration:
        raise HTTPException(status_code=400, detail="Google not connected")
    key = load_or_create_key(KEY_PATH)
    tokens = json.loads(decrypt(integration.credentials, key))
    return tokens["access_token"]


@router.get("/calendars")
async def get_calendars(db: Session = Depends(get_db)):
    access_token = _get_access_token(db)
    return await fetch_calendars(access_token=access_token)


@router.get("/photos/albums")
async def get_photo_albums(db: Session = Depends(get_db)):
    access_token = _get_access_token(db)
    return await fetch_albums(access_token=access_token)


@router.get("/photos/albums/{album_id}/photos")
async def get_album_photos(album_id: str, db: Session = Depends(get_db)):
    access_token = _get_access_token(db)
    return await fetch_album_photos(access_token=access_token, album_id=album_id)
