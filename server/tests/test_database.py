from server.app.models import Layout


def test_db_session_injected(authed_client, db_session):
    """Verify the test client uses the test database."""
    layout = Layout(name="Test", columns=12, row_height=80, is_active=True, theme={})
    db_session.add(layout)
    db_session.commit()
    response = authed_client.get("/api/layouts")
    assert response.status_code == 200
    layouts = response.json()
    assert any(l["name"] == "Test" for l in layouts)
