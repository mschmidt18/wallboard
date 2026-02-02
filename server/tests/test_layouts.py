def test_create_layout(client):
    response = client.post("/api/layouts", json={
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


def test_list_layouts(client):
    client.post("/api/layouts", json={"name": "Layout 1"})
    client.post("/api/layouts", json={"name": "Layout 2"})
    response = client.get("/api/layouts")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


def test_get_layout_with_widgets(client):
    create_resp = client.post("/api/layouts", json={"name": "Test"})
    layout_id = create_resp.json()["id"]
    response = client.get(f"/api/layouts/{layout_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test"
    assert data["widgets"] == []


def test_get_layout_not_found(client):
    response = client.get("/api/layouts/999")
    assert response.status_code == 404


def test_update_layout(client):
    create_resp = client.post("/api/layouts", json={"name": "Old Name"})
    layout_id = create_resp.json()["id"]
    response = client.put(f"/api/layouts/{layout_id}", json={"name": "New Name"})
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


def test_delete_layout(client):
    create_resp = client.post("/api/layouts", json={"name": "To Delete"})
    layout_id = create_resp.json()["id"]
    response = client.delete(f"/api/layouts/{layout_id}")
    assert response.status_code == 204
    assert client.get(f"/api/layouts/{layout_id}").status_code == 404


def test_activate_layout(client):
    resp1 = client.post("/api/layouts", json={"name": "Layout 1"})
    resp2 = client.post("/api/layouts", json={"name": "Layout 2"})
    id1 = resp1.json()["id"]
    id2 = resp2.json()["id"]

    client.post(f"/api/layouts/{id1}/activate")
    assert client.get(f"/api/layouts/{id1}").json()["is_active"] is True

    client.post(f"/api/layouts/{id2}/activate")
    assert client.get(f"/api/layouts/{id2}").json()["is_active"] is True
    assert client.get(f"/api/layouts/{id1}").json()["is_active"] is False
