"""Tests for configuration change logging (Issue #33).

Design spec requires logging for: layout activated, widget added/removed,
integration connected/disconnected.
"""
import logging

import pytest
from unittest.mock import AsyncMock, patch


@pytest.fixture
def layout_id(authed_client):
    resp = authed_client.post("/api/layouts", json={"name": "Test Layout"})
    return resp.json()["id"]


def test_activate_layout_is_logged(authed_client, caplog):
    """Activating a layout should emit an info log message."""
    resp = authed_client.post("/api/layouts", json={"name": "My Layout"})
    layout_id = resp.json()["id"]
    with caplog.at_level(logging.INFO):
        authed_client.post(f"/api/layouts/{layout_id}/activate")
    assert any("layout activated" in r.message.lower() for r in caplog.records)


def test_add_widget_is_logged(authed_client, layout_id, caplog):
    """Adding a widget should emit an info log message."""
    with caplog.at_level(logging.INFO):
        authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
            "widget_type": "clock",
            "config": {},
            "position_x": 0, "position_y": 0, "width": 3, "height": 2,
        })
    assert any("widget added" in r.message.lower() for r in caplog.records)


def test_delete_widget_is_logged(authed_client, layout_id, caplog):
    """Deleting a widget should emit an info log message."""
    resp = authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "clock",
        "config": {},
        "position_x": 0, "position_y": 0, "width": 3, "height": 2,
    })
    widget_id = resp.json()["id"]
    with caplog.at_level(logging.INFO):
        authed_client.delete(f"/api/widgets/{widget_id}")
    assert any("widget removed" in r.message.lower() for r in caplog.records)


def test_google_connected_is_logged(authed_client, tmp_config, caplog):
    """Completing Google OAuth connection should emit an info log message."""
    with caplog.at_level(logging.INFO):
        with patch(
            "server.app.routers.integrations.exchange_code",
            new_callable=AsyncMock,
            return_value={"access_token": "tok", "refresh_token": "ref", "expires_in": 3600},
        ), patch(
            "server.app.routers.integrations.load_or_create_key",
            return_value=b"0" * 32,
        ), patch(
            "server.app.routers.integrations.encrypt",
            return_value="encrypted",
        ):
            authed_client.get("/api/integrations/google/callback?code=testcode")
    assert any("integration connected" in r.message.lower() for r in caplog.records)


def test_google_disconnected_is_logged(authed_client, tmp_config, db_session, caplog):
    """Disconnecting Google integration should emit an info log message."""
    from server.app.models import Integration
    integration = Integration(provider="google", credentials="enc", status="connected")
    db_session.add(integration)
    db_session.commit()
    with caplog.at_level(logging.INFO):
        authed_client.delete("/api/integrations/google")
    assert any("integration disconnected" in r.message.lower() for r in caplog.records)
