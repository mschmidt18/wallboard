import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.app.config import Config
from server.app.database import get_db
from server.app.models import Layout, Cache, IcsCalendar
from server.app.schemas import DisplayResponse, DisplayWidgetResponse

router = APIRouter(tags=["display"])

_config: Optional[Config] = None


def set_config(config: Config) -> None:
    global _config
    _config = config


def _get_refresh_interval() -> int:
    if _config is None:
        return 60
    settings_path = _config.db_path.parent / "settings.json"
    if settings_path.exists():
        try:
            settings = json.loads(settings_path.read_text())
            return settings.get("display_refresh_interval", 60)
        except (json.JSONDecodeError, OSError):
            pass
    return 60


def _get_cache_key(widget) -> str | None:
    """Determine cache key based on widget type and config.

    For calendar widgets with calendar_sources, returns None (handled by
    _get_calendar_cache_keys instead).
    """
    wtype = widget.widget_type
    config = widget.config or {}
    if wtype == "weather":
        lat = config.get("lat")
        lon = config.get("lon")
        if lat is not None and lon is not None:
            return f"weather_{lat}_{lon}"
    elif wtype == "calendar":
        if config.get("calendar_sources"):
            return None  # Multi-source handled separately
        calendar_ids = sorted(config.get("calendar_ids", ["primary"]))
        days_ahead = config.get("days_ahead", 7)
        return f"google_calendar_{'_'.join(calendar_ids)}_{days_ahead}"
    elif wtype == "photos":
        album_id = config.get("album_id")
        if album_id:
            return f"google_photos_album_{album_id}"
    return None


def _get_calendar_cache_keys(config: dict) -> list[tuple[str, str]]:
    """For calendar widgets with calendar_sources, return list of (source_label, cache_key) tuples."""
    calendar_sources = config.get("calendar_sources", [])
    days_ahead = config.get("days_ahead", 7)
    keys = []
    google_ids = []
    for cs in calendar_sources:
        if cs["type"] == "google":
            google_ids.append(cs["id"])
        elif cs["type"] == "ics":
            keys.append((f"ics:{cs['id']}", f"ics_calendar_{cs['id']}"))
    if google_ids:
        sorted_ids = sorted(google_ids)
        cache_key = f"google_calendar_{'_'.join(sorted_ids)}_{days_ahead}"
        for gid in sorted_ids:
            keys.append((f"google:{gid}", cache_key))
    return keys


def _merge_calendar_data(config: dict, cache_entries: dict) -> dict | None:
    """Merge events from multiple calendar sources, apply colors, sort by start."""
    calendar_sources = config.get("calendar_sources", [])
    if not calendar_sources:
        return None

    colors = config.get("colors", {})
    days_ahead = config.get("days_ahead", 7)
    all_events = []

    # Collect Google calendar events
    google_ids = [cs["id"] for cs in calendar_sources if cs["type"] == "google"]
    if google_ids:
        sorted_ids = sorted(google_ids)
        cache_key = f"google_calendar_{'_'.join(sorted_ids)}_{days_ahead}"
        cached = cache_entries.get(cache_key)
        if cached and "events" in cached:
            for event in cached["events"]:
                # Apply color for each Google source
                # Google events don't have a source label, apply first matching color
                for gid in google_ids:
                    color = colors.get(f"google:{gid}")
                    if color:
                        event = {**event, "color": color}
                        break
                all_events.append(event)

    # Collect ICS calendar events
    for cs in calendar_sources:
        if cs["type"] == "ics":
            cache_key = f"ics_calendar_{cs['id']}"
            cached = cache_entries.get(cache_key)
            if cached and "events" in cached:
                color = colors.get(f"ics:{cs['id']}")
                for event in cached["events"]:
                    if color:
                        event = {**event, "color": color}
                    all_events.append(event)

    if not all_events:
        return None

    # Sort by start time
    all_events.sort(key=lambda e: e.get("start", ""))
    return {"events": all_events}


@router.get("/api/display", response_model=DisplayResponse)
def get_display(db: Session = Depends(get_db)):
    layout = db.query(Layout).filter(Layout.is_active == True).first()
    if not layout:
        raise HTTPException(status_code=404, detail="No active layout")

    # Query all ICS calendars for auto-inclusion in unconfigured calendar widgets
    all_ics = db.query(IcsCalendar).all()

    # Compute needed cache keys from the active layout's widgets, then query only those
    cache_keys = {}
    multi_source_configs = {}  # widget_id -> effective config with resolved sources
    all_needed_keys = set()

    for widget in layout.widgets:
        config = widget.config or {}
        if widget.widget_type == "calendar":
            effective_config = dict(config)
            # Auto-include all ICS calendars when no explicit sources configured
            if not effective_config.get("calendar_sources") and not effective_config.get("calendar_ids") and all_ics:
                effective_config["calendar_sources"] = [{"type": "ics", "id": ic.id} for ic in all_ics]
            if effective_config.get("calendar_sources"):
                multi_source_configs[widget.id] = effective_config
                cal_keys = _get_calendar_cache_keys(effective_config)
                for _label, cache_key in cal_keys:
                    all_needed_keys.add(cache_key)
            else:
                key = _get_cache_key(widget)
                if key:
                    cache_keys[widget.id] = key
                    all_needed_keys.add(key)
        else:
            key = _get_cache_key(widget)
            if key:
                cache_keys[widget.id] = key
                all_needed_keys.add(key)

    if all_needed_keys:
        cache_entries = {c.source: c.data for c in db.query(Cache).filter(Cache.source.in_(all_needed_keys)).all()}
    else:
        cache_entries = {}

    widgets = []
    for widget in layout.widgets:
        if widget.id in multi_source_configs:
            data = _merge_calendar_data(multi_source_configs[widget.id], cache_entries)
        else:
            cache_key = cache_keys.get(widget.id)
            data = cache_entries.get(cache_key) if cache_key else None
        widgets.append(DisplayWidgetResponse(
            id=widget.id,
            widget_type=widget.widget_type,
            config=widget.config,
            data=data,
            position_x=widget.position_x,
            position_y=widget.position_y,
            width=widget.width,
            height=widget.height,
        ))

    return DisplayResponse(
        layout={
            "id": layout.id,
            "name": layout.name,
            "columns": layout.columns,
            "row_height": layout.row_height,
            "theme": layout.theme,
        },
        widgets=widgets,
        refresh_interval=_get_refresh_interval(),
    )
