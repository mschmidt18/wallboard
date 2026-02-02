from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field


WidgetType = Literal["calendar", "photos", "weather", "clock", "notes"]


# --- Layouts ---

class LayoutCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    columns: int = Field(default=12, ge=1, le=24)
    row_height: int = Field(default=80, ge=20, le=500)
    theme: dict[str, Any] = Field(default_factory=dict)


class LayoutUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    columns: int | None = Field(default=None, ge=1, le=24)
    row_height: int | None = Field(default=None, ge=20, le=500)
    theme: dict[str, Any] | None = None


class WidgetResponse(BaseModel):
    id: int
    layout_id: int
    widget_type: WidgetType
    config: dict[str, Any]
    position_x: int
    position_y: int
    width: int
    height: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LayoutResponse(BaseModel):
    id: int
    name: str
    columns: int
    row_height: int
    is_active: bool
    theme: dict[str, Any]
    widgets: list[WidgetResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LayoutListResponse(BaseModel):
    id: int
    name: str
    columns: int
    row_height: int
    is_active: bool
    theme: dict[str, Any]
    widget_count: int = 0
    created_at: datetime
    updated_at: datetime


# --- Widgets ---

class WidgetCreate(BaseModel):
    widget_type: WidgetType
    config: dict[str, Any] = Field(default_factory=dict)
    position_x: int = Field(ge=0)
    position_y: int = Field(ge=0)
    width: int = Field(ge=1, le=24)
    height: int = Field(ge=1, le=20)


class WidgetUpdate(BaseModel):
    config: dict[str, Any] | None = None
    position_x: int | None = Field(default=None, ge=0)
    position_y: int | None = Field(default=None, ge=0)
    width: int | None = Field(default=None, ge=1, le=24)
    height: int | None = Field(default=None, ge=1, le=20)


class WidgetPositionUpdate(BaseModel):
    id: int
    position_x: int = Field(ge=0)
    position_y: int = Field(ge=0)
    width: int = Field(ge=1, le=24)
    height: int = Field(ge=1, le=20)


# --- Display ---

class DisplayWidgetResponse(BaseModel):
    id: int
    widget_type: WidgetType
    config: dict[str, Any]
    data: dict[str, Any] | None = None
    position_x: int
    position_y: int
    width: int
    height: int


class DisplayResponse(BaseModel):
    layout: dict[str, Any]
    widgets: list[DisplayWidgetResponse]
    refresh_interval: int = 60
