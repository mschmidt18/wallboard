def test_full_workflow(authed_client):
    """Create a layout, add widgets, activate, verify display endpoint."""
    # Create layout
    layout = authed_client.post("/api/layouts", json={"name": "E2E Test", "columns": 12, "row_height": 80}).json()
    layout_id = layout["id"]

    # Add widgets
    authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "clock", "config": {"timezone": "UTC"},
        "position_x": 0, "position_y": 0, "width": 4, "height": 2,
    })
    authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "notes", "config": {"content": "Hello Wallboard"},
        "position_x": 4, "position_y": 0, "width": 4, "height": 2,
    })
    authed_client.post(f"/api/layouts/{layout_id}/widgets", json={
        "widget_type": "weather", "config": {"lat": 40.7, "lon": -74.0, "units": "imperial"},
        "position_x": 0, "position_y": 2, "width": 6, "height": 3,
    })

    # Activate layout
    authed_client.post(f"/api/layouts/{layout_id}/activate")

    # Verify display
    display = authed_client.get("/api/display").json()
    assert display["layout"]["name"] == "E2E Test"
    assert len(display["widgets"]) == 3

    # Update positions (drag-and-drop)
    widgets = display["widgets"]
    authed_client.put(f"/api/layouts/{layout_id}/widgets/positions", json=[
        {"id": w["id"], "position_x": i * 4, "position_y": 0, "width": 4, "height": 2}
        for i, w in enumerate(widgets)
    ])

    # Verify updated positions
    updated = authed_client.get("/api/display").json()
    positions = sorted([w["position_x"] for w in updated["widgets"]])
    assert positions == [0, 4, 8]
