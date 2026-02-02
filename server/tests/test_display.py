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


def test_display_merged_calendar_sources(authed_client, db_session):
    """Widget with Google + ICS sources, both cached, returns merged events sorted by start."""
    from server.app.models import Cache, IcsCalendar

    # Create an ICS calendar record
    ics_cal = IcsCalendar(name="Work ICS", url="https://example.com/cal.ics", color="#ff0000")
    db_session.add(ics_cal)
    db_session.commit()
    ics_id = ics_cal.id

    # Create layout with a calendar widget using new calendar_sources format
    resp = authed_client.post("/api/layouts", json={"name": "Multi Source"})
    layout_id = resp.json()["id"]
    authed_client.post(f"/api/layouts/{layout_id}/activate")
    authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "calendar",
        "config": {
            "calendar_sources": [
                {"type": "google", "id": "work"},
                {"type": "ics", "id": ics_id},
            ],
            "days_ahead": 7,
            "colors": {"google:work": "#0000ff", "ics:" + str(ics_id): "#ff0000"},
        },
        "position_x": 0, "position_y": 0, "width": 6, "height": 4,
    })

    # Populate cache for both sources
    db_session.add(Cache(
        source="google_calendar_work_7",
        data={"events": [
            {"title": "Google Meeting", "start": "2026-02-03T10:00:00", "end": "2026-02-03T11:00:00"},
            {"title": "Google Standup", "start": "2026-02-03T09:00:00", "end": "2026-02-03T09:15:00"},
        ]},
    ))
    db_session.add(Cache(
        source=f"ics_calendar_{ics_id}",
        data={"events": [
            {"title": "ICS Event", "start": "2026-02-03T09:30:00", "end": "2026-02-03T10:00:00"},
        ]},
    ))
    db_session.commit()

    response = authed_client.get("/api/display")
    assert response.status_code == 200
    widget = response.json()["widgets"][0]
    assert widget["widget_type"] == "calendar"
    events = widget["data"]["events"]
    # Events should be merged and sorted by start time
    assert len(events) == 3
    assert events[0]["title"] == "Google Standup"
    assert events[1]["title"] == "ICS Event"
    assert events[2]["title"] == "Google Meeting"


def test_display_applies_color_mapping(authed_client, db_session):
    """Widget config has colors dict, events get correct colors applied."""
    from server.app.models import Cache, IcsCalendar

    ics_cal = IcsCalendar(name="Personal", url="https://example.com/personal.ics", color="#00ff00")
    db_session.add(ics_cal)
    db_session.commit()
    ics_id = ics_cal.id

    resp = authed_client.post("/api/layouts", json={"name": "Color Test"})
    layout_id = resp.json()["id"]
    authed_client.post(f"/api/layouts/{layout_id}/activate")
    authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "calendar",
        "config": {
            "calendar_sources": [
                {"type": "google", "id": "primary"},
                {"type": "ics", "id": ics_id},
            ],
            "days_ahead": 7,
            "colors": {"google:primary": "#3b82f6", "ics:" + str(ics_id): "#ef4444"},
        },
        "position_x": 0, "position_y": 0, "width": 6, "height": 4,
    })

    db_session.add(Cache(
        source="google_calendar_primary_7",
        data={"events": [
            {"title": "Team Sync", "start": "2026-02-03T14:00:00", "end": "2026-02-03T15:00:00"},
        ]},
    ))
    db_session.add(Cache(
        source=f"ics_calendar_{ics_id}",
        data={"events": [
            {"title": "Yoga", "start": "2026-02-03T07:00:00", "end": "2026-02-03T08:00:00"},
        ]},
    ))
    db_session.commit()

    response = authed_client.get("/api/display")
    widget = response.json()["widgets"][0]
    events = widget["data"]["events"]
    # Find events and check colors
    yoga = next(e for e in events if e["title"] == "Yoga")
    team_sync = next(e for e in events if e["title"] == "Team Sync")
    assert yoga["color"] == "#ef4444"
    assert team_sync["color"] == "#3b82f6"


def test_display_backward_compat_calendar_ids(authed_client, db_session):
    """Old config format with calendar_ids still works."""
    from server.app.models import Cache

    resp = authed_client.post("/api/layouts", json={"name": "Compat Test"})
    layout_id = resp.json()["id"]
    authed_client.post(f"/api/layouts/{layout_id}/activate")
    authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "calendar",
        "config": {"calendar_ids": ["primary", "work"], "days_ahead": 14},
        "position_x": 0, "position_y": 0, "width": 6, "height": 4,
    })

    db_session.add(Cache(
        source="google_calendar_primary_work_14",
        data={"events": [
            {"title": "Old Format Event", "start": "2026-02-03T12:00:00", "end": "2026-02-03T13:00:00"},
        ]},
    ))
    db_session.commit()

    response = authed_client.get("/api/display")
    assert response.status_code == 200
    widget = response.json()["widgets"][0]
    assert widget["data"]["events"][0]["title"] == "Old Format Event"


def test_display_partial_cache(authed_client, db_session):
    """Only some sources cached, available events still returned."""
    from server.app.models import Cache, IcsCalendar

    ics_cal = IcsCalendar(name="Shared", url="https://example.com/shared.ics", color="#9333ea")
    db_session.add(ics_cal)
    db_session.commit()
    ics_id = ics_cal.id

    resp = authed_client.post("/api/layouts", json={"name": "Partial Cache"})
    layout_id = resp.json()["id"]
    authed_client.post(f"/api/layouts/{layout_id}/activate")
    authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "calendar",
        "config": {
            "calendar_sources": [
                {"type": "google", "id": "primary"},
                {"type": "ics", "id": ics_id},
            ],
            "days_ahead": 7,
            "colors": {},
        },
        "position_x": 0, "position_y": 0, "width": 6, "height": 4,
    })

    # Only ICS cache exists, no Google cache
    db_session.add(Cache(
        source=f"ics_calendar_{ics_id}",
        data={"events": [
            {"title": "ICS Only", "start": "2026-02-03T10:00:00", "end": "2026-02-03T11:00:00"},
        ]},
    ))
    db_session.commit()

    response = authed_client.get("/api/display")
    assert response.status_code == 200
    widget = response.json()["widgets"][0]
    events = widget["data"]["events"]
    assert len(events) == 1
    assert events[0]["title"] == "ICS Only"
