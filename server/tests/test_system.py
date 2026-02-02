from unittest.mock import patch, MagicMock
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
