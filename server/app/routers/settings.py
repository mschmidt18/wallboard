import json
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel

from server.app.auth import hash_password, verify_password, create_session_token
from server.app.config import Config

router = APIRouter(tags=["auth", "settings"])

# Module-level config; set via set_config() during app startup or tests.
_config: Optional[Config] = None

# In-memory session store: token -> expiry timestamp
_sessions: dict[str, float] = {}

SESSION_TTL = 3600 * 24  # 24 hours

DEFAULT_SETTINGS = {
    "admin_password_hash": "",
    "google_client_id": "",
    "google_client_secret": "",
    "display_refresh_interval": 60,
}


def set_config(config: Config) -> None:
    global _config
    _config = config


def _settings_path() -> Path:
    assert _config is not None, "Config not set; call set_config() first"
    return _config.db_path.parent / "settings.json"


def _load_settings() -> dict:
    path = _settings_path()
    if path.exists():
        return json.loads(path.read_text())
    return dict(DEFAULT_SETTINGS)


def _save_settings(settings: dict) -> None:
    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(settings, indent=2))


def require_auth(session: Optional[str] = Cookie(None)) -> str:
    if session is None or session not in _sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if _sessions[session] < time.time():
        del _sessions[session]
        raise HTTPException(status_code=401, detail="Session expired")
    return session


# --- Auth endpoints ---

class PasswordBody(BaseModel):
    password: str


@router.post("/api/auth/setup")
def auth_setup(body: PasswordBody):
    settings = _load_settings()
    if settings.get("admin_password_hash"):
        raise HTTPException(status_code=400, detail="Password already set")
    settings["admin_password_hash"] = hash_password(body.password)
    _save_settings(settings)
    return {"status": "ok"}


@router.post("/api/auth/login")
def auth_login(body: PasswordBody, response: Response):
    settings = _load_settings()
    pw_hash = settings.get("admin_password_hash", "")
    if not pw_hash or not verify_password(body.password, pw_hash):
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_session_token()
    _sessions[token] = time.time() + SESSION_TTL
    response.set_cookie(key="session", value=token, httponly=True)
    return {"status": "ok"}


@router.post("/api/auth/logout")
def auth_logout(response: Response, session: Optional[str] = Cookie(None)):
    if session and session in _sessions:
        del _sessions[session]
    response.delete_cookie(key="session")
    return {"status": "ok"}


# --- Settings endpoints ---

class SettingsUpdate(BaseModel):
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    display_refresh_interval: Optional[int] = None


@router.get("/api/settings")
def get_settings(token: str = Cookie(None, alias="session")):
    require_auth(token)
    settings = _load_settings()
    return {
        "google_client_id": settings.get("google_client_id", ""),
        "display_refresh_interval": settings.get("display_refresh_interval", 60),
        "has_password": bool(settings.get("admin_password_hash")),
    }


@router.put("/api/settings")
def update_settings(body: SettingsUpdate, token: str = Cookie(None, alias="session")):
    require_auth(token)
    settings = _load_settings()
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        settings[key] = value
    _save_settings(settings)
    return {"status": "ok"}
