from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from server.app.database import get_db
from server.app.models import Layout, Widget
from server.app.schemas import WidgetCreate, WidgetUpdate, WidgetResponse, WidgetPositionUpdate

router = APIRouter(tags=["widgets"])


@router.post("/api/layouts/{layout_id}/widgets", status_code=201, response_model=WidgetResponse)
def add_widget(layout_id: int, body: WidgetCreate, db: Session = Depends(get_db)):
    layout = db.query(Layout).filter(Layout.id == layout_id).first()
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")
    widget = Widget(
        layout_id=layout_id,
        widget_type=body.widget_type,
        config=body.config,
        position_x=body.position_x,
        position_y=body.position_y,
        width=body.width,
        height=body.height,
    )
    db.add(widget)
    db.commit()
    db.refresh(widget)
    return widget


@router.put("/api/widgets/{widget_id}", response_model=WidgetResponse)
def update_widget(widget_id: int, body: WidgetUpdate, db: Session = Depends(get_db)):
    widget = db.query(Widget).filter(Widget.id == widget_id).first()
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(widget, key, value)
    db.commit()
    db.refresh(widget)
    return widget


@router.delete("/api/widgets/{widget_id}", status_code=204)
def delete_widget(widget_id: int, db: Session = Depends(get_db)):
    widget = db.query(Widget).filter(Widget.id == widget_id).first()
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    db.delete(widget)
    db.commit()


@router.put("/api/layouts/{layout_id}/widgets/positions", response_model=list[WidgetResponse])
def batch_update_positions(
    layout_id: int, positions: list[WidgetPositionUpdate], db: Session = Depends(get_db)
):
    layout = db.query(Layout).filter(Layout.id == layout_id).first()
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")
    widgets = []
    for pos in positions:
        widget = db.query(Widget).filter(Widget.id == pos.id, Widget.layout_id == layout_id).first()
        if not widget:
            raise HTTPException(status_code=404, detail=f"Widget {pos.id} not found in layout")
        widget.position_x = pos.position_x
        widget.position_y = pos.position_y
        widget.width = pos.width
        widget.height = pos.height
        widgets.append(widget)
    db.commit()
    for w in widgets:
        db.refresh(w)
    return widgets
