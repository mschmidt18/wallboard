"""Tests for ICS calendar CRUD endpoints."""


def test_create_ics_calendar(authed_client):
    """POST /api/ics-calendars creates a new ICS calendar."""
    resp = authed_client.post(
        "/api/ics-calendars",
        json={"name": "Work Calendar", "url": "https://example.com/cal.ics", "color": "#ff5733"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Work Calendar"
    assert data["url"] == "https://example.com/cal.ics"
    assert data["color"] == "#ff5733"
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


def test_create_ics_calendar_default_color(authed_client):
    """POST /api/ics-calendars uses default color when not specified."""
    resp = authed_client.post(
        "/api/ics-calendars",
        json={"name": "My Calendar", "url": "https://example.com/cal.ics"},
    )
    assert resp.status_code == 200
    assert resp.json()["color"] == "#6366f1"


def test_list_ics_calendars(authed_client):
    """GET /api/ics-calendars returns all ICS calendars."""
    authed_client.post(
        "/api/ics-calendars",
        json={"name": "Calendar A", "url": "https://example.com/a.ics"},
    )
    authed_client.post(
        "/api/ics-calendars",
        json={"name": "Calendar B", "url": "https://example.com/b.ics", "color": "#00ff00"},
    )

    resp = authed_client.get("/api/ics-calendars")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    names = {c["name"] for c in data}
    assert names == {"Calendar A", "Calendar B"}


def test_update_ics_calendar(authed_client):
    """PUT /api/ics-calendars/{id} updates fields."""
    create_resp = authed_client.post(
        "/api/ics-calendars",
        json={"name": "Old Name", "url": "https://example.com/old.ics"},
    )
    cal_id = create_resp.json()["id"]

    resp = authed_client.put(
        f"/api/ics-calendars/{cal_id}",
        json={"name": "New Name"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "New Name"
    assert data["url"] == "https://example.com/old.ics"  # unchanged


def test_update_ics_calendar_not_found(authed_client):
    """PUT /api/ics-calendars/{id} returns 404 for nonexistent calendar."""
    resp = authed_client.put(
        "/api/ics-calendars/9999",
        json={"name": "Nope"},
    )
    assert resp.status_code == 404


def test_delete_ics_calendar(authed_client):
    """DELETE /api/ics-calendars/{id} removes the calendar."""
    create_resp = authed_client.post(
        "/api/ics-calendars",
        json={"name": "To Delete", "url": "https://example.com/del.ics"},
    )
    cal_id = create_resp.json()["id"]

    resp = authed_client.delete(f"/api/ics-calendars/{cal_id}")
    assert resp.status_code == 204

    # Verify it's gone
    list_resp = authed_client.get("/api/ics-calendars")
    assert len(list_resp.json()) == 0


def test_delete_ics_calendar_not_found(authed_client):
    """DELETE /api/ics-calendars/{id} returns 404 for nonexistent calendar."""
    resp = authed_client.delete("/api/ics-calendars/9999")
    assert resp.status_code == 404


def test_create_invalid_color(authed_client):
    """POST /api/ics-calendars rejects invalid color format."""
    resp = authed_client.post(
        "/api/ics-calendars",
        json={"name": "Bad Color", "url": "https://example.com/cal.ics", "color": "red"},
    )
    assert resp.status_code == 422


def test_create_missing_name(authed_client):
    """POST /api/ics-calendars rejects missing name."""
    resp = authed_client.post(
        "/api/ics-calendars",
        json={"url": "https://example.com/cal.ics"},
    )
    assert resp.status_code == 422


def test_all_endpoints_require_auth(client, tmp_config):
    """All ICS calendar endpoints return 401 without auth."""
    assert client.get("/api/ics-calendars").status_code == 401
    assert client.post("/api/ics-calendars", json={"name": "X", "url": "http://x"}).status_code == 401
    assert client.put("/api/ics-calendars/1", json={"name": "X"}).status_code == 401
    assert client.delete("/api/ics-calendars/1").status_code == 401
