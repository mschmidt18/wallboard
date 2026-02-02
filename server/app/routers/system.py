import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Cookie

from server.app.config import Config
from server.app.routers.settings import require_auth
from server.app.schemas import UpdateCheckResponse, UpdateResponse, VersionResponse

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


@router.post("/check-update", response_model=UpdateCheckResponse)
def check_update(session: Optional[str] = Cookie(None)):
    require_auth(session)

    # Fetch latest from origin
    try:
        subprocess.run(
            ["git", "fetch", "origin"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
            timeout=30,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as e:
        return UpdateCheckResponse(error=str(e))

    # Count commits behind
    count_str = _git("rev-list", "--count", "HEAD..origin/main")
    if count_str is None:
        return UpdateCheckResponse(error="Failed to determine commits behind")

    commits_behind = int(count_str)
    commits: list[str] = []

    if commits_behind > 0:
        log_output = _git("log", "--oneline", "HEAD..origin/main")
        if log_output:
            commits = [line for line in log_output.splitlines() if line.strip()]

    return UpdateCheckResponse(
        up_to_date=commits_behind == 0,
        commits_behind=commits_behind,
        commits=commits,
    )


@router.post("/update", response_model=UpdateResponse)
def run_update(session: Optional[str] = Cookie(None)):
    require_auth(session)

    steps = [
        ("git pull", ["git", "pull"]),
        ("pip install", [".venv/bin/pip", "install", "-r", "server/requirements.txt"]),
        ("alembic upgrade", [".venv/bin/alembic", "-c", "server/alembic.ini", "upgrade", "head"]),
        ("npm ci && build", ["npm", "ci", "--prefix", "frontend"]),
        ("restart service", ["systemctl", "restart", "wallboard-server"]),
    ]

    steps_completed: list[str] = []

    for step_name, cmd in steps:
        try:
            subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=PROJECT_ROOT,
                timeout=120,
            )
            steps_completed.append(step_name)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
            return UpdateResponse(
                status="error",
                steps_completed=steps_completed,
                step_failed=step_name,
                fallback_instructions=(
                    "SSH into the server and run manually:\n"
                    "  cd /opt/wallboard\n"
                    "  git pull\n"
                    "  .venv/bin/pip install -r server/requirements.txt\n"
                    "  .venv/bin/alembic -c server/alembic.ini upgrade head\n"
                    "  cd frontend && npm ci && npm run build\n"
                    "  sudo systemctl restart wallboard-server"
                ),
            )

    return UpdateResponse(
        status="ok",
        steps_completed=steps_completed,
    )
