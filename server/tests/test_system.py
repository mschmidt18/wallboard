from unittest.mock import patch, MagicMock, call
import subprocess


def test_version_returns_commit_info(authed_client):
    """GET /api/system/version returns git commit info when git succeeds."""
    mock_results = {
        ("git", "rev-parse", "HEAD"): "abc123def456789",
        ("git", "rev-parse", "--short", "HEAD"): "abc123d",
        ("git", "log", "-1", "--format=%ci"): "2025-01-15 10:30:00 -0500",
        ("git", "rev-parse", "--abbrev-ref", "HEAD"): "main",
    }

    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        result.stdout = mock_results[tuple(cmd)]
        return result

    with patch("subprocess.run", side_effect=mock_run):
        resp = authed_client.get("/api/system/version")

    assert resp.status_code == 200
    data = resp.json()
    assert data["commit"] == "abc123def456789"
    assert data["commit_short"] == "abc123d"
    assert data["commit_date"] == "2025-01-15 10:30:00 -0500"
    assert data["branch"] == "main"


def test_version_requires_auth(client, tmp_config):
    """GET /api/system/version returns 401 without auth."""
    resp = client.get("/api/system/version")
    assert resp.status_code == 401


def test_version_handles_git_error(authed_client):
    """GET /api/system/version returns nulls when git commands fail."""
    def mock_run(cmd, **kwargs):
        raise subprocess.CalledProcessError(128, cmd)

    with patch("subprocess.run", side_effect=mock_run):
        resp = authed_client.get("/api/system/version")

    assert resp.status_code == 200
    data = resp.json()
    assert data["commit"] is None
    assert data["commit_short"] is None
    assert data["commit_date"] is None
    assert data["branch"] is None


# --- Check-update endpoint tests ---


def test_check_update_up_to_date(authed_client):
    """POST /api/system/check-update returns up_to_date when no commits behind."""
    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        cmd_tuple = tuple(cmd)
        if cmd_tuple[:3] == ("git", "fetch", "origin"):
            result.stdout = ""
        elif "rev-list" in cmd_tuple:
            result.stdout = "0"
        else:
            result.stdout = ""
        return result

    with patch("subprocess.run", side_effect=mock_run):
        resp = authed_client.post("/api/system/check-update")

    assert resp.status_code == 200
    data = resp.json()
    assert data["up_to_date"] is True
    assert data["commits_behind"] == 0
    assert data["commits"] == []
    assert data["error"] is None


def test_check_update_behind(authed_client):
    """POST /api/system/check-update returns commit info when behind."""
    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        cmd_tuple = tuple(cmd)
        if cmd_tuple[:3] == ("git", "fetch", "origin"):
            result.stdout = ""
        elif "rev-list" in cmd_tuple:
            result.stdout = "3"
        elif "log" in cmd_tuple:
            result.stdout = "abc1234 Fix bug\ndef5678 Add feature\n789abcd Update docs"
        else:
            result.stdout = ""
        return result

    with patch("subprocess.run", side_effect=mock_run):
        resp = authed_client.post("/api/system/check-update")

    assert resp.status_code == 200
    data = resp.json()
    assert data["up_to_date"] is False
    assert data["commits_behind"] == 3
    assert data["commits"] == [
        "abc1234 Fix bug",
        "def5678 Add feature",
        "789abcd Update docs",
    ]
    assert data["error"] is None


def test_check_update_fetch_failure(authed_client):
    """POST /api/system/check-update returns error when git fetch fails."""
    def mock_run(cmd, **kwargs):
        cmd_tuple = tuple(cmd)
        if cmd_tuple[:3] == ("git", "fetch", "origin"):
            raise subprocess.CalledProcessError(128, cmd)
        result = MagicMock()
        result.returncode = 0
        result.stdout = ""
        return result

    with patch("subprocess.run", side_effect=mock_run):
        resp = authed_client.post("/api/system/check-update")

    assert resp.status_code == 200
    data = resp.json()
    assert data["error"] is not None
    assert len(data["error"]) > 0


def test_check_update_requires_auth(client, tmp_config):
    """POST /api/system/check-update returns 401 without auth."""
    resp = client.post("/api/system/check-update")
    assert resp.status_code == 401
