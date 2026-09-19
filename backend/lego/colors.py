"""Small deterministic presentation palette for Brickify LEGO models."""

from __future__ import annotations

from typing import Any


def _color(color_id: str, name: str, hex_value: str, category: str) -> dict[str, Any]:
    hex_value = hex_value.upper()
    return {
        "color_id": color_id,
        "display_name": name,
        "hex": hex_value,
        "rgb": [int(hex_value[index:index + 2], 16) for index in (1, 3, 5)],
        "category": category,
    }


# This is a practical Brickify presentation palette, not an exhaustive or
# official LEGO color database.
COLOR_CATALOG = (
    _color("red", "Red", "#D9362B", "bright"),
    _color("blue", "Blue", "#2764C7", "bright"),
    _color("dark_blue", "Dark Blue", "#183B75", "dark"),
    _color("yellow", "Yellow", "#F2C230", "bright"),
    _color("green", "Green", "#27824B", "bright"),
    _color("orange", "Orange", "#E87522", "bright"),
    _color("white", "White", "#F5F5F0", "neutral"),
    _color("black", "Black", "#202124", "neutral"),
    _color("light_gray", "Light Gray", "#B8BEC7", "neutral"),
    _color("dark_gray", "Dark Gray", "#545B66", "neutral"),
    _color("brown", "Brown", "#70452B", "earth"),
    _color("tan", "Tan", "#D4B483", "earth"),
)

COLORS_BY_ID = {color["color_id"]: color for color in COLOR_CATALOG}
DEFAULT_COLOR_PATTERN = ("blue", "yellow", "red", "green", "orange", "tan")


def get_color(color_id: str) -> dict[str, Any]:
    try:
        return COLORS_BY_ID[color_id]
    except KeyError as exc:
        raise ValueError(f"Unknown Brickify color ID: {color_id}") from exc


def assign_colors(
    bricks: list[dict[str, Any]],
    *,
    layer_colors: dict[int, str] | None = None,
) -> list[dict[str, Any]]:
    """Return brick copies with stable color IDs assigned by layer/position."""
    layer_colors = layer_colors or {}
    for color_id in layer_colors.values():
        get_color(color_id)

    colored: list[dict[str, Any]] = []
    for brick in bricks:
        x, y, z = brick["position"]
        if y in layer_colors:
            color_id = layer_colors[y]
        else:
            footprint_area = int(brick["width"]) * int(brick["depth"])
            index = (x + 3 * z + 7 * y + footprint_area) % len(DEFAULT_COLOR_PATTERN)
            color_id = DEFAULT_COLOR_PATTERN[index]
        colored.append({**brick, "color_id": color_id})
    return colored
