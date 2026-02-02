from server.app.models import Layout


def test_db_session_injected(client, db_session):
    """Verify the test client uses the test database."""
    layout = Layout(name="Test", columns=12, row_height=80, is_active=True, theme={})
    db_session.add(layout)
    db_session.commit()
    response = client.get("/api/health")
    assert response.status_code == 200
