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
