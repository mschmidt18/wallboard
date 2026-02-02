import pytest
from pydantic import ValidationError
from server.app.schemas import (
    LayoutCreate, LayoutUpdate, LayoutResponse,
    WidgetCreate, WidgetUpdate, WidgetResponse, WidgetPositionUpdate,
    DisplayResponse,
)


def test_layout_create_minimal():
    layout = LayoutCreate(name="Dashboard")
    assert layout.name == "Dashboard"
    assert layout.columns == 12
    assert layout.row_height == 80


def test_layout_create_full():
    layout = LayoutCreate(
        name="Night Mode",
        columns=8,
        row_height=100,
        theme={"background": "#000", "text_color": "light"},
    )
    assert layout.columns == 8
    assert layout.theme["background"] == "#000"


def test_layout_create_rejects_empty_name():
    with pytest.raises(ValidationError):
        LayoutCreate(name="")


def test_widget_create_valid():
    widget = WidgetCreate(
        widget_type="clock",
        config={"timezone": "America/New_York"},
        position_x=0,
        position_y=0,
        width=3,
        height=2,
    )
    assert widget.widget_type == "clock"


def test_widget_create_rejects_invalid_type():
    with pytest.raises(ValidationError):
        WidgetCreate(
            widget_type="invalid",
            config={},
            position_x=0, position_y=0, width=3, height=2,
        )


def test_widget_position_update():
    pos = WidgetPositionUpdate(id=1, position_x=5, position_y=3, width=4, height=2)
    assert pos.position_x == 5
