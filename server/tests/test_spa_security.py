"""Test SPA fallback path traversal protection."""
from server.app.main import app
from fastapi.testclient import TestClient


client = TestClient(app)


def test_path_traversal_with_encoded_slashes_blocked():
    """Path traversal using URL-encoded slashes must not serve files outside frontend_dist.

    Starlette normalizes raw '..' segments but URL-encoded variants like
    %2F and %2e bypass normalization, allowing the full_path parameter to
    resolve outside the frontend dist directory.
    """
    response = client.get("/..%2F..%2Fserver/app/main.py")
    # Must NOT contain Python source code from the server
    assert "FastAPI" not in response.text
    assert "lifespan" not in response.text
    # Should return the SPA index.html
    assert response.status_code == 200


def test_path_traversal_with_encoded_dots_blocked():
    """Path traversal using URL-encoded dots must be blocked."""
    response = client.get("/%2e%2e/%2e%2e/server/app/main.py")
    assert "FastAPI" not in response.text
    assert "lifespan" not in response.text
    assert response.status_code == 200
