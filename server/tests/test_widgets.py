import pytest
from unittest.mock import AsyncMock, patch

from server.app.services.geocoding import GeocodingError

MOCK_GEO_RESULT = {"lat": 40.7484, "lon": -73.9967, "location_name": "New York, NY"}


@pytest.fixture
def layout_id(client):
    resp = client.post("/api/layouts", json={"name": "Test Layout"})
    return resp.json()["id"]


def test_add_widget_to_layout(client, layout_id):
    response = client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "clock",
        "config": {"timezone": "America/New_York", "format_24h": False},
        "position_x": 0, "position_y": 0, "width": 3, "height": 2,
    })
    assert response.status_code == 201
    data = response.json()
    assert data["widget_type"] == "clock"
    assert data["layout_id"] == layout_id


def test_update_widget(client, layout_id):
    create_resp = client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "notes", "config": {"content": "Hello"},
        "position_x": 0, "position_y": 0, "width": 3, "height": 2,
    })
    widget_id = create_resp.json()["id"]
    response = client.put(f"/api/widgets/{widget_id}", json={"config": {"content": "Updated"}})
    assert response.status_code == 200
    assert response.json()["config"]["content"] == "Updated"


def test_delete_widget(client, layout_id):
    create_resp = client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "clock", "config": {},
        "position_x": 0, "position_y": 0, "width": 3, "height": 2,
    })
    widget_id = create_resp.json()["id"]
    response = client.delete(f"/api/widgets/{widget_id}")
    assert response.status_code == 204


def test_batch_update_positions(client, layout_id):
    r1 = client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "clock", "config": {},
        "position_x": 0, "position_y": 0, "width": 3, "height": 2,
    })
    r2 = client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "notes", "config": {"content": "Hi"},
        "position_x": 3, "position_y": 0, "width": 3, "height": 2,
    })
    id1 = r1.json()["id"]
    id2 = r2.json()["id"]
    response = client.put(f"/api/layouts/{layout_id}/widgets/positions", json=[
        {"id": id1, "position_x": 6, "position_y": 0, "width": 4, "height": 3},
        {"id": id2, "position_x": 0, "position_y": 0, "width": 6, "height": 2},
    ])
    assert response.status_code == 200
    layout = client.get(f"/api/layouts/{layout_id}").json()
    widgets_by_id = {w["id"]: w for w in layout["widgets"]}
    assert widgets_by_id[id1]["position_x"] == 6
    assert widgets_by_id[id2]["width"] == 6


def test_add_widget_to_nonexistent_layout(client):
    response = client.post("/api/layouts/999/widgets", json={
        "widget_type": "clock", "config": {},
        "position_x": 0, "position_y": 0, "width": 3, "height": 2,
    })
    assert response.status_code == 404


@patch("server.app.routers.widgets.geocode_zip", new_callable=AsyncMock, return_value=MOCK_GEO_RESULT)
def test_add_weather_widget_resolves_zip(mock_geocode, client, layout_id):
    response = client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "weather",
        "config": {"zip_code": "10001", "units": "imperial"},
        "position_x": 0, "position_y": 0, "width": 4, "height": 3,
    })
    assert response.status_code == 201
    config = response.json()["config"]
    assert config["lat"] == 40.7484
    assert config["lon"] == -73.9967
    assert config["location_name"] == "New York, NY"
    assert config["zip_code"] == "10001"
    mock_geocode.assert_awaited_once_with("10001")


@patch("server.app.routers.widgets.geocode_zip", new_callable=AsyncMock, return_value=MOCK_GEO_RESULT)
def test_update_weather_widget_resolves_zip(mock_geocode, client, layout_id):
    create_resp = client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "weather",
        "config": {"zip_code": "10001", "units": "imperial"},
        "position_x": 0, "position_y": 0, "width": 4, "height": 3,
    })
    widget_id = create_resp.json()["id"]
    mock_geocode.reset_mock()

    response = client.put(f"/api/widgets/{widget_id}", json={
        "config": {"zip_code": "90210", "units": "imperial"},
    })
    assert response.status_code == 200
    assert response.json()["config"]["lat"] == 40.7484
    mock_geocode.assert_awaited_once_with("90210")


@patch("server.app.routers.widgets.geocode_zip", new_callable=AsyncMock,
       side_effect=GeocodingError("No location found for zip code: 00000"))
def test_add_weather_widget_invalid_zip_returns_400(mock_geocode, client, layout_id):
    response = client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "weather",
        "config": {"zip_code": "00000", "units": "imperial"},
        "position_x": 0, "position_y": 0, "width": 4, "height": 3,
    })
    assert response.status_code == 400
    assert "No location found" in response.json()["detail"]
