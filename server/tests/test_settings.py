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
    assert response.status_code == 400


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
