from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, JSON, Text,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Layout(Base):
    __tablename__ = "layouts"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    columns = Column(Integer, nullable=False, default=12)
    row_height = Column(Integer, nullable=False, default=80)
    is_active = Column(Boolean, nullable=False, default=False)
    theme = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    widgets = relationship("Widget", back_populates="layout", cascade="all, delete-orphan")


class Widget(Base):
    __tablename__ = "widgets"

    id = Column(Integer, primary_key=True)
    layout_id = Column(Integer, ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False)
    widget_type = Column(String, nullable=False)
    config = Column(JSON, nullable=False, default=dict)
    position_x = Column(Integer, nullable=False, default=0)
    position_y = Column(Integer, nullable=False, default=0)
    width = Column(Integer, nullable=False, default=3)
    height = Column(Integer, nullable=False, default=2)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    layout = relationship("Layout", back_populates="widgets")


class Integration(Base):
    __tablename__ = "integrations"

    id = Column(Integer, primary_key=True)
    provider = Column(String, nullable=False)
    credentials = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="disconnected")
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class IcsCalendar(Base):
    __tablename__ = "ics_calendars"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    color = Column(String, nullable=False, default="#6366f1")
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Cache(Base):
    __tablename__ = "cache"

    id = Column(Integer, primary_key=True)
    source = Column(String, nullable=False, unique=True)
    data = Column(JSON, nullable=False)
    fetched_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)
