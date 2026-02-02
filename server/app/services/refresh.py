import asyncio
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import sessionmaker, Session
from server.app.config import Config
from server.app.models import Widget, Cache, Integration
from server.app.services.weather import fetch_weather
from server.app.services.google_calendar import fetch_events
from server.app.services.google_photos import fetch_album_photos

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
            calendar_ids = sorted(config.get("calendar_ids", ["primary"]))
            days_ahead = config.get("days_ahead", 7)
            key = f"google_calendar_{'_'.join(calendar_ids)}_{days_ahead}"
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

async def _get_google_access_token(session: Session, config: Config) -> str | None:
    """Get a valid Google access token, refreshing if expired."""
    import json
    from server.app.services.encryption import load_or_create_key
    from server.app.services.google_auth import get_valid_access_token

    try:
        key = load_or_create_key(config.secret_key_path)
        # Read settings to get client_id and client_secret for token refresh
        settings_path = config.db_path.parent / "settings.json"
        settings = {}
        if settings_path.exists():
            settings = json.loads(settings_path.read_text())
        client_id = settings.get("google_client_id", "")
        client_secret = settings.get("google_client_secret", "")

        return await get_valid_access_token(
            session=session,
            encryption_key=key,
            client_id=client_id,
            client_secret=client_secret,
        )
    except Exception as e:
        logger.error(f"Failed to get Google access token: {e}")
        return None


async def _fetch_source(source: dict, session_factory: sessionmaker, config: Config) -> dict | None:
    source_type = source["type"]
    params = source["params"]
    if source_type == "weather":
        return await fetch_weather(**params)
    elif source_type == "calendar":
        with session_factory() as session:
            access_token = await _get_google_access_token(session, config)
        if not access_token:
            logger.warning("No Google access token for calendar fetch")
            return None
        calendar_ids = params.get("calendar_ids", ["primary"])
        days_ahead = params.get("days_ahead", 7)
        events = await fetch_events(access_token=access_token, calendar_ids=calendar_ids, days_ahead=days_ahead)
        return {"events": events}
    elif source_type == "photos":
        with session_factory() as session:
            access_token = await _get_google_access_token(session, config)
        if not access_token:
            logger.warning("No Google access token for photos fetch")
            return None
        album_id = params.get("album_id")
        if not album_id:
            return None
        photos = await fetch_album_photos(access_token=access_token, album_id=album_id)
        return {"photos": photos}
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

async def refresh_once(session_factory: sessionmaker, config: Config | None = None):
    if config is None:
        config = Config.default()
    with session_factory() as session:
        sources = _collect_data_sources(session)
    for source in sources:
        with session_factory() as session:
            if _is_cache_fresh(session, source["key"]):
                logger.debug(f"Cache fresh for {source['key']}, skipping")
                continue
        try:
            data = await _fetch_source(source, session_factory, config)
            if data is not None:
                with session_factory() as session:
                    _update_cache(session, source["key"], data, source["interval"])
                logger.info(f"Refreshed {source['key']}")
        except Exception as e:
            logger.error(f"Failed to refresh {source['key']}: {e}")

async def start_refresh_loop(session_factory: sessionmaker, interval_seconds: int = 60, config: Config | None = None):
    if config is None:
        config = Config.default()
    while True:
        try:
            await refresh_once(session_factory, config)
        except Exception as e:
            logger.error(f"Refresh loop error: {e}")
        await asyncio.sleep(interval_seconds)
