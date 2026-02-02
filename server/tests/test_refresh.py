import json
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from server.app.config import Config
from server.app.models import Base, Layout, Widget, Cache
from server.app.services.refresh import refresh_once, _collect_data_sources, start_refresh_loop


@pytest.fixture
def refresh_db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    return factory


def _seed_weather_widget(factory):
    with factory() as session:
        layout = Layout(name="Test", columns=12, row_height=80, is_active=True, theme={})
        session.add(layout)
        session.commit()
        widget = Widget(layout_id=layout.id, widget_type="weather",
            config={"lat": 40.7, "lon": -74.0, "units": "imperial"},
            position_x=0, position_y=0, width=4, height=3)
        session.add(widget)
        session.commit()


@pytest.mark.asyncio
async def test_refresh_once_fetches_weather_when_no_cache(refresh_db):
    _seed_weather_widget(refresh_db)
    mock_weather_data = {"current": {"temperature": 72}, "daily": []}
    with patch("server.app.services.refresh.fetch_weather", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = mock_weather_data
        await refresh_once(refresh_db)
        mock_fetch.assert_called_once_with(lat=40.7, lon=-74.0, units="imperial")
    with refresh_db() as session:
        cache = session.query(Cache).filter(Cache.source == "weather_40.7_-74.0").first()
        assert cache is not None
        assert cache.data["current"]["temperature"] == 72


@pytest.mark.asyncio
async def test_refresh_once_skips_when_cache_fresh(refresh_db):
    _seed_weather_widget(refresh_db)
    with refresh_db() as session:
        cache = Cache(source="weather_40.7_-74.0",
            data={"current": {"temperature": 72}, "daily": []},
            fetched_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
        session.add(cache)
        session.commit()
    with patch("server.app.services.refresh.fetch_weather", new_callable=AsyncMock) as mock_fetch:
        await refresh_once(refresh_db)
        mock_fetch.assert_not_called()


@pytest.mark.asyncio
async def test_refresh_once_refetches_when_cache_expired(refresh_db):
    _seed_weather_widget(refresh_db)
    with refresh_db() as session:
        cache = Cache(source="weather_40.7_-74.0",
            data={"current": {"temperature": 72}, "daily": []},
            fetched_at=datetime.now(timezone.utc) - timedelta(hours=2),
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1))
        session.add(cache)
        session.commit()
    with patch("server.app.services.refresh.fetch_weather", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = {"current": {"temperature": 80}, "daily": []}
        await refresh_once(refresh_db)
        mock_fetch.assert_called_once()
    with refresh_db() as session:
        cache = session.query(Cache).filter(Cache.source == "weather_40.7_-74.0").first()
        assert cache.data["current"]["temperature"] == 80


def test_collect_data_sources_calendar_different_configs(refresh_db):
    """Two calendar widgets with different calendar_ids and days_ahead
    must produce separate data source entries, not collapse into one."""
    with refresh_db() as session:
        layout = Layout(name="Test", columns=12, row_height=80, is_active=True, theme={})
        session.add(layout)
        session.commit()
        w1 = Widget(layout_id=layout.id, widget_type="calendar",
            config={"calendar_ids": ["work"], "days_ahead": 7},
            position_x=0, position_y=0, width=4, height=3)
        w2 = Widget(layout_id=layout.id, widget_type="calendar",
            config={"calendar_ids": ["personal"], "days_ahead": 14},
            position_x=4, position_y=0, width=4, height=3)
        session.add_all([w1, w2])
        session.commit()

    with refresh_db() as session:
        sources = _collect_data_sources(session)

    calendar_sources = [s for s in sources if s["type"] == "calendar"]
    assert len(calendar_sources) == 2, (
        f"Expected 2 calendar sources for different configs, got {len(calendar_sources)}"
    )
    # Verify both configs are represented
    all_calendar_ids = set()
    for src in calendar_sources:
        for cid in src["params"]["calendar_ids"]:
            all_calendar_ids.add(cid)
    assert "work" in all_calendar_ids
    assert "personal" in all_calendar_ids


@pytest.mark.asyncio
async def test_refresh_loop_rereads_interval_from_settings(refresh_db, tmp_path):
    """The refresh loop should re-read display_refresh_interval from settings
    on each cycle instead of using the fixed value passed at startup."""
    config = Config.for_testing(tmp_path)

    # Write initial settings with 30-second interval
    settings_path = config.db_path.parent / "settings.json"
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(json.dumps({"display_refresh_interval": 30}))

    sleep_intervals = []

    async def mock_sleep(seconds):
        sleep_intervals.append(seconds)
        # Stop the loop after capturing intervals
        raise asyncio.CancelledError()

    import asyncio
    with patch("server.app.services.refresh.asyncio.sleep", side_effect=mock_sleep):
        with patch("server.app.services.refresh.refresh_once", new_callable=AsyncMock):
            try:
                await start_refresh_loop(refresh_db, interval_seconds=60, config=config)
            except asyncio.CancelledError:
                pass

    # Should have used the interval from settings (30), not the startup value (60)
    assert len(sleep_intervals) == 1
    assert sleep_intervals[0] == 30
