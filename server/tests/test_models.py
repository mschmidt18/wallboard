from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from server.app.models import Base, Layout, Widget, Integration, Cache
from server.app.database import init_db
import json


def test_create_layout(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        layout = Layout(
            name="My Dashboard",
            columns=12,
            row_height=80,
            is_active=True,
            theme={"background": "#1a1a2e", "text_color": "light"},
        )
        session.add(layout)
        session.commit()
        session.refresh(layout)
        assert layout.id is not None
        assert layout.name == "My Dashboard"
        assert layout.columns == 12
        assert layout.is_active is True
        assert layout.theme["background"] == "#1a1a2e"
        assert layout.created_at is not None


def test_create_widget_linked_to_layout(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        layout = Layout(name="Test", columns=12, row_height=80, is_active=True, theme={})
        session.add(layout)
        session.commit()
        widget = Widget(
            layout_id=layout.id,
            widget_type="clock",
            config={"timezone": "America/New_York", "format_24h": False},
            position_x=0,
            position_y=0,
            width=3,
            height=2,
        )
        session.add(widget)
        session.commit()
        session.refresh(widget)
        assert widget.id is not None
        assert widget.layout_id == layout.id
        assert widget.widget_type == "clock"
        assert widget.config["timezone"] == "America/New_York"


def test_cascade_delete_layout_deletes_widgets(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        layout = Layout(name="Test", columns=12, row_height=80, is_active=True, theme={})
        session.add(layout)
        session.commit()
        widget = Widget(
            layout_id=layout.id,
            widget_type="notes",
            config={"content": "Hello"},
            position_x=0, position_y=0, width=3, height=2,
        )
        session.add(widget)
        session.commit()
        session.delete(layout)
        session.commit()
        remaining = session.query(Widget).all()
        assert len(remaining) == 0


def test_create_integration(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        integration = Integration(
            provider="google",
            credentials="encrypted-blob",
            status="connected",
        )
        session.add(integration)
        session.commit()
        session.refresh(integration)
        assert integration.id is not None
        assert integration.provider == "google"


def test_create_cache_entry(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        entry = Cache(
            source="weather",
            data={"temp": 72, "condition": "sunny"},
        )
        session.add(entry)
        session.commit()
        session.refresh(entry)
        assert entry.id is not None
        assert entry.data["temp"] == 72
        assert entry.fetched_at is not None
