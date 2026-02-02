def test_create_layout(authed_client):
    response = authed_client.post("/api/layouts", json={
        "name": "My Dashboard",
        "columns": 12,
        "row_height": 80,
    })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Dashboard"
    assert data["columns"] == 12
    assert data["is_active"] is False
    assert "id" in data


def test_list_layouts(authed_client):
    authed_client.post("/api/layouts", json={"name": "Layout 1"})
    authed_client.post("/api/layouts", json={"name": "Layout 2"})
    response = authed_client.get("/api/layouts")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


def test_get_layout_with_widgets(authed_client):
    create_resp = authed_client.post("/api/layouts", json={"name": "Test"})
    layout_id = create_resp.json()["id"]
    response = authed_client.get(f"/api/layouts/{layout_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test"
    assert data["widgets"] == []


def test_get_layout_not_found(authed_client):
    response = authed_client.get("/api/layouts/999")
    assert response.status_code == 404


def test_update_layout(authed_client):
    create_resp = authed_client.post("/api/layouts", json={"name": "Old Name"})
    layout_id = create_resp.json()["id"]
    response = authed_client.put(f"/api/layouts/{layout_id}", json={"name": "New Name"})
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


def test_delete_layout(authed_client):
    create_resp = authed_client.post("/api/layouts", json={"name": "To Delete"})
    layout_id = create_resp.json()["id"]
    response = authed_client.delete(f"/api/layouts/{layout_id}")
    assert response.status_code == 204
    assert authed_client.get(f"/api/layouts/{layout_id}").status_code == 404


def test_activate_layout(authed_client):
    resp1 = authed_client.post("/api/layouts", json={"name": "Layout 1"})
    resp2 = authed_client.post("/api/layouts", json={"name": "Layout 2"})
    id1 = resp1.json()["id"]
    id2 = resp2.json()["id"]

    authed_client.post(f"/api/layouts/{id1}/activate")
    assert authed_client.get(f"/api/layouts/{id1}").json()["is_active"] is True

    authed_client.post(f"/api/layouts/{id2}/activate")
    assert authed_client.get(f"/api/layouts/{id2}").json()["is_active"] is True
    assert authed_client.get(f"/api/layouts/{id1}").json()["is_active"] is False


def test_activate_already_active_layout(authed_client):
    """Activating an already-active layout should keep it active and be the only active one."""
    resp1 = authed_client.post("/api/layouts", json={"name": "Layout A"})
    resp2 = authed_client.post("/api/layouts", json={"name": "Layout B"})
    id1 = resp1.json()["id"]
    id2 = resp2.json()["id"]

    # Activate layout A
    authed_client.post(f"/api/layouts/{id1}/activate")
    assert authed_client.get(f"/api/layouts/{id1}").json()["is_active"] is True

    # Activate layout A again (already active)
    response = authed_client.post(f"/api/layouts/{id1}/activate")
    assert response.status_code == 200
    assert response.json()["is_active"] is True

    # Verify layout A is still active and is the only active layout
    all_layouts = authed_client.get("/api/layouts").json()
    active_layouts = [l for l in all_layouts if l["is_active"]]
    assert len(active_layouts) == 1
    assert active_layouts[0]["id"] == id1


def test_update_nonexistent_layout_returns_404(authed_client):
    """PUT /api/layouts/999 should return 404."""
    response = authed_client.put("/api/layouts/999", json={"name": "Nope"})
    assert response.status_code == 404


def test_delete_nonexistent_layout_returns_404(authed_client):
    """DELETE /api/layouts/999 should return 404."""
    response = authed_client.delete("/api/layouts/999")
    assert response.status_code == 404
