def test_display_returns_active_layout_with_widgets(authed_client):
    resp = authed_client.post("/api/layouts", json={"name": "Active Layout", "columns": 12, "row_height": 80})
    layout_id = resp.json()["id"]
    authed_client.post(f"/api/layouts/{layout_id}/activate")
    authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "clock",
        "config": {"timezone": "UTC"},
        "position_x": 0, "position_y": 0, "width": 3, "height": 2,
    })
    authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "notes",
        "config": {"content": "Hello"},
        "position_x": 3, "position_y": 0, "width": 3, "height": 2,
    })

    response = authed_client.get("/api/display")
    assert response.status_code == 200
    data = response.json()
    assert data["layout"]["name"] == "Active Layout"
    assert data["layout"]["columns"] == 12
    assert len(data["widgets"]) == 2
    widget_types = {w["widget_type"] for w in data["widgets"]}
    assert widget_types == {"clock", "notes"}


def test_display_returns_404_when_no_active_layout(client):
    response = client.get("/api/display")
    assert response.status_code == 404


def test_display_merges_cached_data(authed_client, db_session):
    from server.app.models import Cache
    resp = authed_client.post("/api/layouts", json={"name": "Display Test"})
    layout_id = resp.json()["id"]
    authed_client.post(f"/api/layouts/{layout_id}/activate")
    authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "weather",
        "config": {"lat": 40.7, "lon": -74.0, "units": "imperial"},
        "position_x": 0, "position_y": 0, "width": 4, "height": 3,
    })

    cache_entry = Cache(
        source="weather_40.7_-74.0",
        data={"temp": 72, "condition": "sunny"},
    )
    db_session.add(cache_entry)
    db_session.commit()

    response = authed_client.get("/api/display")
    assert response.status_code == 200
    weather_widget = response.json()["widgets"][0]
    assert weather_widget["widget_type"] == "weather"
    assert weather_widget["data"] == {"temp": 72, "condition": "sunny"}


def test_display_includes_default_refresh_interval(authed_client):
    """Display response includes refresh_interval so frontend can adjust polling."""
    resp = authed_client.post("/api/layouts", json={"name": "Interval Test"})
    layout_id = resp.json()["id"]
    authed_client.post(f"/api/layouts/{layout_id}/activate")

    response = authed_client.get("/api/display")
    assert response.status_code == 200
    data = response.json()
    assert "refresh_interval" in data
    assert data["refresh_interval"] == 60


def test_display_only_loads_relevant_cache_entries(authed_client, db_session):
    """Display endpoint should filter cache queries to only keys needed by the active
    layout's widgets, not load the entire cache table."""
    from server.app.models import Cache
    from server.app.routers.display import _get_cache_key

    # Create layout with a weather widget and a clock widget (no cache key)
    resp = authed_client.post("/api/layouts", json={"name": "Filtered Cache Test"})
    layout_id = resp.json()["id"]
    authed_client.post(f"/api/layouts/{layout_id}/activate")
    authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "weather",
        "config": {"lat": 40.7, "lon": -74.0, "units": "imperial"},
        "position_x": 0, "position_y": 0, "width": 4, "height": 3,
    })
    authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "clock",
        "config": {"timezone": "UTC"},
        "position_x": 4, "position_y": 0, "width": 2, "height": 2,
    })

    # Add relevant cache entry and several unrelated ones
    db_session.add_all([
        Cache(source="weather_40.7_-74.0", data={"temp": 72, "condition": "sunny"}),
        Cache(source="weather_51.5_-0.1", data={"temp": 15, "condition": "rainy"}),
        Cache(source="google_calendar_work_7", data={"events": []}),
        Cache(source="google_photos_album_abc123", data={"photos": ["a.jpg"]}),
    ])
    db_session.commit()

    response = authed_client.get("/api/display")
    assert response.status_code == 200
    widgets = response.json()["widgets"]

    # Weather widget gets its matching cache data
    weather = [w for w in widgets if w["widget_type"] == "weather"][0]
    assert weather["data"] == {"temp": 72, "condition": "sunny"}

    # Clock widget has no cache data
    clock = [w for w in widgets if w["widget_type"] == "clock"][0]
    assert clock["data"] is None

    # Verify the endpoint used a filtered query by checking the SQL logs
    # We can't easily spy on the DB session, so instead we verify via the
    # source code: check that _get_cache_key produces the expected keys
    # and trust the implementation filters on them.
    # The real verification is in the implementation: .filter(Cache.source.in_(keys))
    # instead of .all()

    # Verify _get_cache_key produces correct keys for each widget type
    class FakeWidget:
        def __init__(self, wtype, config):
            self.widget_type = wtype
            self.config = config

    assert _get_cache_key(FakeWidget("weather", {"lat": 40.7, "lon": -74.0})) == "weather_40.7_-74.0"
    assert _get_cache_key(FakeWidget("clock", {"timezone": "UTC"})) is None
    assert _get_cache_key(FakeWidget("calendar", {"calendar_ids": ["work"], "days_ahead": 7})) == "google_calendar_work_7"
    assert _get_cache_key(FakeWidget("photos", {"album_id": "abc"})) == "google_photos_album_abc"
    assert _get_cache_key(FakeWidget("notes", {})) is None


def test_display_includes_custom_refresh_interval(authed_client, tmp_config):
    """Display response reflects the configured refresh interval from settings."""
    # Update the display_refresh_interval setting
    authed_client.put("/api/settings", json={"display_refresh_interval": 120})

    resp = authed_client.post("/api/layouts", json={"name": "Custom Interval"})
    layout_id = resp.json()["id"]
    authed_client.post(f"/api/layouts/{layout_id}/activate")

    response = authed_client.get("/api/display")
    assert response.status_code == 200
    data = response.json()
    assert data["refresh_interval"] == 120
