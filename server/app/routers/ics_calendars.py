"""CRUD endpoints for ICS calendar sources."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.app.database import get_db
from server.app.models import IcsCalendar
from server.app.routers.settings import require_auth
from server.app.schemas import IcsCalendarCreate, IcsCalendarUpdate, IcsCalendarResponse

router = APIRouter(prefix="/api/ics-calendars", tags=["ics-calendars"])


@router.get("", response_model=List[IcsCalendarResponse], dependencies=[Depends(require_auth)])
def list_ics_calendars(db: Session = Depends(get_db)):
    """List all ICS calendars."""
    return db.query(IcsCalendar).all()


@router.post("", response_model=IcsCalendarResponse, dependencies=[Depends(require_auth)])
def create_ics_calendar(body: IcsCalendarCreate, db: Session = Depends(get_db)):
    """Create a new ICS calendar."""
    cal = IcsCalendar(name=body.name, url=body.url, color=body.color)
    db.add(cal)
    db.commit()
    db.refresh(cal)
    return cal


@router.put("/{calendar_id}", response_model=IcsCalendarResponse, dependencies=[Depends(require_auth)])
def update_ics_calendar(calendar_id: int, body: IcsCalendarUpdate, db: Session = Depends(get_db)):
    """Update an ICS calendar."""
    cal = db.query(IcsCalendar).filter(IcsCalendar.id == calendar_id).first()
    if not cal:
        raise HTTPException(status_code=404, detail="ICS calendar not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cal, key, value)
    db.commit()
    db.refresh(cal)
    return cal


@router.delete("/{calendar_id}", status_code=204, dependencies=[Depends(require_auth)])
def delete_ics_calendar(calendar_id: int, db: Session = Depends(get_db)):
    """Delete an ICS calendar."""
    cal = db.query(IcsCalendar).filter(IcsCalendar.id == calendar_id).first()
    if not cal:
        raise HTTPException(status_code=404, detail="ICS calendar not found")
    db.delete(cal)
    db.commit()
