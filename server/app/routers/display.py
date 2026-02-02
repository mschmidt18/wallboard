import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.app.config import Config
from server.app.database import get_db
from server.app.models import Layout, Cache
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
    """Determine cache key based on widget type and config."""
    wtype = widget.widget_type
    config = widget.config or {}
    if wtype == "weather":
        lat = config.get("lat")
        lon = config.get("lon")
        if lat is not None and lon is not None:
            return f"weather_{lat}_{lon}"
    elif wtype == "calendar":
        calendar_ids = sorted(config.get("calendar_ids", ["primary"]))
        days_ahead = config.get("days_ahead", 7)
        return f"google_calendar_{'_'.join(calendar_ids)}_{days_ahead}"
    elif wtype == "photos":
        album_id = config.get("album_id")
        if album_id:
            return f"google_photos_album_{album_id}"
    return None


@router.get("/api/display", response_model=DisplayResponse)
def get_display(db: Session = Depends(get_db)):
    layout = db.query(Layout).filter(Layout.is_active == True).first()
    if not layout:
        raise HTTPException(status_code=404, detail="No active layout")

    # Compute needed cache keys from the active layout's widgets, then query only those
    cache_keys = {}
    for widget in layout.widgets:
        key = _get_cache_key(widget)
        if key:
            cache_keys[widget.id] = key

    needed_keys = set(cache_keys.values())
    if needed_keys:
        cache_entries = {c.source: c.data for c in db.query(Cache).filter(Cache.source.in_(needed_keys)).all()}
    else:
        cache_entries = {}

    widgets = []
    for widget in layout.widgets:
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
