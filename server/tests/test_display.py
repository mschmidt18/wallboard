def test_display_returns_active_layout_with_widgets(client):
    resp = client.post("/api/layouts", json={"name": "Active Layout", "columns": 12, "row_height": 80})
    layout_id = resp.json()["id"]
    client.post(f"/api/layouts/{layout_id}/activate")
    client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "clock",
        "config": {"timezone": "UTC"},
        "position_x": 0, "position_y": 0, "width": 3, "height": 2,
    })
    client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "notes",
        "config": {"content": "Hello"},
        "position_x": 3, "position_y": 0, "width": 3, "height": 2,
    })

    response = client.get("/api/display")
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


def test_display_merges_cached_data(client, db_session):
    from server.app.models import Cache
    resp = client.post("/api/layouts", json={"name": "Display Test"})
    layout_id = resp.json()["id"]
    client.post(f"/api/layouts/{layout_id}/activate")
    client.post(f"/api/layouts/{layout_id}/widgets", json={
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

    response = client.get("/api/display")
    assert response.status_code == 200
    weather_widget = response.json()["widgets"][0]
    assert weather_widget["widget_type"] == "weather"
