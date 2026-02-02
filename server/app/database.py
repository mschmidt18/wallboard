from pathlib import Path
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from server.app.models import Base

_engine = None
_session_factory = None


def get_engine(db_path: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(f"sqlite:///{db_path}", echo=False)


def init_db(db_path: Path):
    global _engine, _session_factory
    _engine = get_engine(db_path)
    Base.metadata.create_all(_engine)
    _session_factory = sessionmaker(bind=_engine)
    return _engine


def get_db() -> Generator[Session, None, None]:
    session = _session_factory()
    try:
        yield session
    finally:
        session.close()


def get_session_factory(engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine)
