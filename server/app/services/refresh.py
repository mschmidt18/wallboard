import asyncio
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import sessionmaker, Session
from server.app.models import Widget, Cache
from server.app.services.weather import fetch_weather

logger = logging.getLogger(__name__)

DEFAULT_INTERVALS = {
    "weather": timedelta(minutes=30),
    "google_calendar": timedelta(minutes=5),
    "google_photos": timedelta(minutes=15),
}

def _collect_data_sources(session: Session) -> list[dict]:
    sources = {}
    widgets = session.query(Widget).all()
    for widget in widgets:
        config = widget.config or {}
        if widget.widget_type == "weather":
            lat = config.get("lat")
            lon = config.get("lon")
            if lat is not None and lon is not None:
                key = f"weather_{lat}_{lon}"
                if key not in sources:
                    sources[key] = {"type": "weather", "key": key,
                        "params": {"lat": lat, "lon": lon, "units": config.get("units", "metric")},
                        "interval": DEFAULT_INTERVALS["weather"]}
        elif widget.widget_type == "calendar":
            key = "google_calendar"
            if key not in sources:
                sources[key] = {"type": "calendar", "key": key, "params": config,
                    "interval": DEFAULT_INTERVALS["google_calendar"]}
        elif widget.widget_type == "photos":
            album_id = config.get("album_id")
            if album_id:
                key = f"google_photos_album_{album_id}"
                if key not in sources:
                    sources[key] = {"type": "photos", "key": key, "params": config,
                        "interval": DEFAULT_INTERVALS["google_photos"]}
    return list(sources.values())

def _is_cache_fresh(session: Session, source_key: str) -> bool:
    cache = session.query(Cache).filter(Cache.source == source_key).first()
    if not cache or not cache.expires_at:
        return False
    now = datetime.now(timezone.utc)
    expires = cache.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return now < expires

async def _fetch_source(source: dict) -> dict | None:
    source_type = source["type"]
    params = source["params"]
    if source_type == "weather":
        return await fetch_weather(**params)
    logger.warning(f"No fetcher for source type: {source_type}")
    return None

def _update_cache(session: Session, key: str, data: dict, interval: timedelta):
    now = datetime.now(timezone.utc)
    cache = session.query(Cache).filter(Cache.source == key).first()
    if cache:
        cache.data = data
        cache.fetched_at = now
        cache.expires_at = now + interval
    else:
        cache = Cache(source=key, data=data, fetched_at=now, expires_at=now + interval)
        session.add(cache)
    session.commit()

async def refresh_once(session_factory: sessionmaker):
    with session_factory() as session:
        sources = _collect_data_sources(session)
    for source in sources:
        with session_factory() as session:
            if _is_cache_fresh(session, source["key"]):
                logger.debug(f"Cache fresh for {source['key']}, skipping")
                continue
        try:
            data = await _fetch_source(source)
            if data is not None:
                with session_factory() as session:
                    _update_cache(session, source["key"], data, source["interval"])
                logger.info(f"Refreshed {source['key']}")
        except Exception as e:
            logger.error(f"Failed to refresh {source['key']}: {e}")

async def start_refresh_loop(session_factory: sessionmaker, interval_seconds: int = 60):
    while True:
        try:
            await refresh_once(session_factory)
        except Exception as e:
            logger.error(f"Refresh loop error: {e}")
        await asyncio.sleep(interval_seconds)
