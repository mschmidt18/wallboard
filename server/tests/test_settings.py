import os
import stat

import pytest
from server.app.auth import hash_password


def test_login_with_correct_password(client, tmp_config):
    response = client.post("/api/auth/setup", json={"password": "admin123"})
    assert response.status_code == 200
    response = client.post("/api/auth/login", json={"password": "admin123"})
    assert response.status_code == 200
    assert "session" in response.cookies


def test_login_with_wrong_password(client, tmp_config):
    client.post("/api/auth/setup", json={"password": "admin123"})
    response = client.post("/api/auth/login", json={"password": "wrong"})
    assert response.status_code == 401


def test_protected_endpoint_without_auth(client):
    response = client.get("/api/settings")
    assert response.status_code == 401


def test_protected_endpoint_with_auth(client, tmp_config):
    client.post("/api/auth/setup", json={"password": "admin123"})
    client.post("/api/auth/login", json={"password": "admin123"})
    response = client.get("/api/settings")
    assert response.status_code == 200


def test_auth_status_setup_required(client, tmp_config):
    response = client.get("/api/auth/status")
    assert response.status_code == 200
    assert response.json()["setup_required"] is True


def test_auth_status_after_setup(client, tmp_config):
    client.post("/api/auth/setup", json={"password": "admin123"})
    response = client.get("/api/auth/status")
    assert response.status_code == 200
    assert response.json()["setup_required"] is False


def test_change_password_requires_auth(client, tmp_config):
    response = client.post(
        "/api/auth/change-password",
        json={"current_password": "admin123", "new_password": "new456"},
    )
    assert response.status_code == 401


def test_change_password_rejects_wrong_current(client, tmp_config):
    client.post("/api/auth/setup", json={"password": "admin123"})
    client.post("/api/auth/login", json={"password": "admin123"})
    response = client.post(
        "/api/auth/change-password",
        json={"current_password": "wrong", "new_password": "new456"},
    )
    assert response.status_code == 401


def test_change_password_success(client, tmp_config):
    client.post("/api/auth/setup", json={"password": "admin123"})
    client.post("/api/auth/login", json={"password": "admin123"})
    response = client.post(
        "/api/auth/change-password",
        json={"current_password": "admin123", "new_password": "new456"},
    )
    assert response.status_code == 200
    # Verify new password works for login
    client.post("/api/auth/logout")
    response = client.post("/api/auth/login", json={"password": "new456"})
    assert response.status_code == 200


def test_settings_file_written_with_restricted_permissions(client, tmp_config):
    """Settings file should have 0600 permissions (owner read/write only)."""
    client.post("/api/auth/setup", json={"password": "admin123"})
    settings_path = tmp_config.db_path.parent / "settings.json"
    assert settings_path.exists()
    file_mode = stat.S_IMODE(os.stat(settings_path).st_mode)
    assert file_mode == stat.S_IRUSR | stat.S_IWUSR, (
        f"Expected 0600, got {oct(file_mode)}"
    )


def test_update_settings(authed_client, tmp_config):
    """PUT /api/settings should update settings values."""
    response = authed_client.put("/api/settings", json={
        "google_client_id": "my-client-id",
        "display_refresh_interval": 120,
    })
    assert response.status_code == 200
    # Verify settings were persisted
    get_resp = authed_client.get("/api/settings")
    data = get_resp.json()
    assert data["google_client_id"] == "my-client-id"
    assert data["display_refresh_interval"] == 120


def test_auth_setup_called_twice_returns_400(client, tmp_config):
    """POST /api/auth/setup called twice should return 400."""
    resp1 = client.post("/api/auth/setup", json={"password": "admin123"})
    assert resp1.status_code == 200
    resp2 = client.post("/api/auth/setup", json={"password": "other456"})
    assert resp2.status_code == 400
    assert "already set" in resp2.json()["detail"].lower()


def test_logout_invalidates_session(client, tmp_config):
    """After logout, the session cookie should no longer grant access."""
    client.post("/api/auth/setup", json={"password": "admin123"})
    client.post("/api/auth/login", json={"password": "admin123"})
    # Verify we have access
    assert client.get("/api/settings").status_code == 200
    # Logout
    client.post("/api/auth/logout")
    # Session should be invalidated
    assert client.get("/api/settings").status_code == 401


def test_successful_login_is_logged(client, tmp_config, caplog):
    """Successful admin login attempts should be logged."""
    import logging

    client.post("/api/auth/setup", json={"password": "admin123"})
    with caplog.at_level(logging.INFO):
        client.post("/api/auth/login", json={"password": "admin123"})
    assert any("login successful" in r.message.lower() for r in caplog.records)


def test_failed_login_is_logged(client, tmp_config, caplog):
    """Failed admin login attempts should be logged as warnings."""
    import logging

    client.post("/api/auth/setup", json={"password": "admin123"})
    with caplog.at_level(logging.WARNING):
        client.post("/api/auth/login", json={"password": "wrong"})
    assert any("login failed" in r.message.lower() for r in caplog.records)
