import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from server.app.config import Config
from server.app.main import app


@pytest.fixture
def tmp_config(tmp_path: Path) -> Config:
    return Config.for_testing(tmp_path)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
