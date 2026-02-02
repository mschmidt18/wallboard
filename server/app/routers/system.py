import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Cookie

from server.app.config import Config
from server.app.routers.settings import require_auth
from server.app.schemas import VersionResponse

router = APIRouter(prefix="/api/system", tags=["system"])

_config: Optional[Config] = None

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent


def set_config(config: Config) -> None:
    global _config
    _config = config


def _git(*args: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
            timeout=10,
        )
        if result.returncode != 0:
            return None
        return result.stdout.strip()
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return None


@router.get("/version", response_model=VersionResponse)
def get_version(session: Optional[str] = Cookie(None)):
    require_auth(session)
    return VersionResponse(
        commit=_git("rev-parse", "HEAD"),
        commit_short=_git("rev-parse", "--short", "HEAD"),
        commit_date=_git("log", "-1", "--format=%ci"),
        branch=_git("rev-parse", "--abbrev-ref", "HEAD"),
    )
