import pytest
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from fastapi.testclient import TestClient

from server.app.config import Config
from server.app.models import Base
from server.app.main import app
from server.app import database
from server.app.routers import settings as settings_router
from server.app.routers import display as display_router
from server.app.routers import integrations as integrations_router
from server.app.routers import google_data as google_data_router


@pytest.fixture
def tmp_config(tmp_path: Path) -> Config:
    config = Config.for_testing(tmp_path)
    settings_router.set_config(config)
    display_router.set_config(config)
    integrations_router.set_config(config)
    google_data_router.set_config(config)
    yield config
    # Clear sessions between tests
    settings_router._sessions.clear()


@pytest.fixture
def db_engine(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def db_session(db_engine) -> Session:
    factory = sessionmaker(bind=db_engine)
    session = factory()
    yield session
    session.close()


@pytest.fixture
def client(db_engine) -> TestClient:
    factory = sessionmaker(bind=db_engine)

    def override_get_db():
        session = factory()
        try:
            yield session
        finally:
            session.close()

    database._session_factory = factory
    app.dependency_overrides[database.get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def authed_client(client, tmp_config) -> TestClient:
    """A test client that is already authenticated with a valid session."""
    client.post("/api/auth/setup", json={"password": "admin123"})
    client.post("/api/auth/login", json={"password": "admin123"})
    return client
