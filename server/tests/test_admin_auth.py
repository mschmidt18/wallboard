"""Tests that admin-only routes require authentication.

The display endpoint (GET /api/display) and health check should remain
unauthenticated. All layout CRUD, widget CRUD, integration, and Google
data proxy endpoints must require a valid session.
"""


def _login(client, tmp_config):
    """Set up auth and log in, returning the client with session cookie."""
    client.post("/api/auth/setup", json={"password": "admin123"})
    client.post("/api/auth/login", json={"password": "admin123"})
    return client


# --- Layouts router ---

def test_create_layout_requires_auth(client):
    response = client.post("/api/layouts", json={"name": "Test"})
    assert response.status_code == 401


def test_list_layouts_requires_auth(client):
    response = client.get("/api/layouts")
    assert response.status_code == 401


def test_get_layout_requires_auth(client, tmp_config):
    authed = _login(client, tmp_config)
    resp = authed.post("/api/layouts", json={"name": "Test"})
    layout_id = resp.json()["id"]
    # Now try without auth (new client session)
    client.cookies.clear()
    response = client.get(f"/api/layouts/{layout_id}")
    assert response.status_code == 401


def test_update_layout_requires_auth(client):
    response = client.put("/api/layouts/1", json={"name": "New"})
    assert response.status_code == 401


def test_delete_layout_requires_auth(client):
    response = client.delete("/api/layouts/1")
    assert response.status_code == 401


def test_activate_layout_requires_auth(client):
    response = client.post("/api/layouts/1/activate")
    assert response.status_code == 401


def test_layout_crud_with_auth_succeeds(client, tmp_config):
    authed = _login(client, tmp_config)
    # Create
    resp = authed.post("/api/layouts", json={"name": "Test"})
    assert resp.status_code == 201
    layout_id = resp.json()["id"]
    # List
    resp = authed.get("/api/layouts")
    assert resp.status_code == 200
    # Get
    resp = authed.get(f"/api/layouts/{layout_id}")
    assert resp.status_code == 200
    # Update
    resp = authed.put(f"/api/layouts/{layout_id}", json={"name": "Updated"})
    assert resp.status_code == 200
    # Activate
    resp = authed.post(f"/api/layouts/{layout_id}/activate")
    assert resp.status_code == 200
    # Delete
    resp = authed.delete(f"/api/layouts/{layout_id}")
    assert resp.status_code == 204


# --- Widgets router ---

def test_add_widget_requires_auth(client):
    response = client.post("/api/layouts/1/widgets", json={
        "widget_type": "clock",
        "config": {},
        "position_x": 0,
        "position_y": 0,
        "width": 2,
        "height": 2,
    })
    assert response.status_code == 401


def test_update_widget_requires_auth(client):
    response = client.put("/api/widgets/1", json={"config": {}})
    assert response.status_code == 401


def test_delete_widget_requires_auth(client):
    response = client.delete("/api/widgets/1")
    assert response.status_code == 401


def test_batch_update_positions_requires_auth(client):
    response = client.put("/api/layouts/1/widgets/positions", json=[])
    assert response.status_code == 401


def test_widget_crud_with_auth_succeeds(client, tmp_config):
    authed = _login(client, tmp_config)
    # Create layout first
    resp = authed.post("/api/layouts", json={"name": "Test"})
    layout_id = resp.json()["id"]
    # Add widget
    resp = authed.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "clock",
        "config": {},
        "position_x": 0,
        "position_y": 0,
        "width": 2,
        "height": 2,
    })
    assert resp.status_code == 201
    widget_id = resp.json()["id"]
    # Update widget
    resp = authed.put(f"/api/widgets/{widget_id}", json={"config": {"format_24h": True}})
    assert resp.status_code == 200
    # Batch positions
    resp = authed.put(f"/api/layouts/{layout_id}/widgets/positions", json=[
        {"id": widget_id, "position_x": 1, "position_y": 1, "width": 3, "height": 3}
    ])
    assert resp.status_code == 200
    # Delete widget
    resp = authed.delete(f"/api/widgets/{widget_id}")
    assert resp.status_code == 204


# --- Integrations router ---

def test_list_integrations_requires_auth(client):
    response = client.get("/api/integrations")
    assert response.status_code == 401


def test_connect_google_requires_auth(client):
    response = client.post("/api/integrations/google/connect")
    assert response.status_code == 401


def test_disconnect_google_requires_auth(client):
    response = client.delete("/api/integrations/google")
    assert response.status_code == 401


# Note: google/callback is NOT tested for auth because it's an OAuth redirect
# that Google calls — the user isn't logged in at that point.


# --- Google data proxy router ---

def test_get_calendars_requires_auth(client):
    response = client.get("/api/google/calendars")
    assert response.status_code == 401


def test_create_picker_session_requires_auth(client):
    response = client.post("/api/google/photos/picker-session")
    assert response.status_code == 401


def test_poll_picker_session_requires_auth(client):
    response = client.get("/api/google/photos/picker-session/session-abc")
    assert response.status_code == 401


# --- Display endpoint should remain unauthenticated ---

def test_display_endpoint_no_auth_required(client, db_session):
    """The display endpoint must remain unauthenticated for kiosk browsers."""
    from server.app.models import Layout
    layout = Layout(name="Kiosk", is_active=True)
    db_session.add(layout)
    db_session.commit()
    response = client.get("/api/display")
    assert response.status_code == 200
