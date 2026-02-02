from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.app.database import get_db
from server.app.models import Layout
from server.app.routers.settings import require_auth
from server.app.schemas import (
    LayoutCreate, LayoutUpdate, LayoutResponse, LayoutListResponse,
)

router = APIRouter(prefix="/api/layouts", tags=["layouts"], dependencies=[Depends(require_auth)])


@router.post("", status_code=201, response_model=LayoutResponse)
def create_layout(body: LayoutCreate, db: Session = Depends(get_db)):
    layout = Layout(
        name=body.name,
        columns=body.columns,
        row_height=body.row_height,
        theme=body.theme,
    )
    db.add(layout)
    db.commit()
    db.refresh(layout)
    return layout


@router.get("", response_model=list[LayoutListResponse])
def list_layouts(db: Session = Depends(get_db)):
    layouts = db.query(Layout).order_by(Layout.created_at).all()
    result = []
    for layout in layouts:
        result.append(LayoutListResponse(
            id=layout.id,
            name=layout.name,
            columns=layout.columns,
            row_height=layout.row_height,
            is_active=layout.is_active,
            theme=layout.theme,
            widget_count=len(layout.widgets),
            created_at=layout.created_at,
            updated_at=layout.updated_at,
        ))
    return result


@router.get("/{layout_id}", response_model=LayoutResponse)
def get_layout(layout_id: int, db: Session = Depends(get_db)):
    layout = db.query(Layout).filter(Layout.id == layout_id).first()
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")
    return layout


@router.put("/{layout_id}", response_model=LayoutResponse)
def update_layout(layout_id: int, body: LayoutUpdate, db: Session = Depends(get_db)):
    layout = db.query(Layout).filter(Layout.id == layout_id).first()
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(layout, key, value)
    db.commit()
    db.refresh(layout)
    return layout


@router.delete("/{layout_id}", status_code=204)
def delete_layout(layout_id: int, db: Session = Depends(get_db)):
    layout = db.query(Layout).filter(Layout.id == layout_id).first()
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")
    db.delete(layout)
    db.commit()


@router.post("/{layout_id}/activate", response_model=LayoutResponse)
def activate_layout(layout_id: int, db: Session = Depends(get_db)):
    layout = db.query(Layout).filter(Layout.id == layout_id).first()
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")
    db.query(Layout).filter(Layout.is_active == True).update({"is_active": False})
    layout.is_active = True
    db.commit()
    db.refresh(layout)
    return layout
