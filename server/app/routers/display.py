from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.app.database import get_db
from server.app.models import Layout, Cache
from server.app.schemas import DisplayResponse, DisplayWidgetResponse

router = APIRouter(tags=["display"])


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
        return "google_calendar"
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

    cache_entries = {c.source: c.data for c in db.query(Cache).all()}

    widgets = []
    for widget in layout.widgets:
        cache_key = _get_cache_key(widget)
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
    )
