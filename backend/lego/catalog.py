"""Reusable Brickify LEGO piece catalog.

One stud is one X/Z grid unit. Vertical ``height_units`` use plate units:
plates are one unit tall and standard bricks are three units tall. The current
decomposer runs only in ``brick`` grid mode, where one Y cell is one brick
height. Plate definitions are renderable catalog entries, but are deliberately
excluded from decomposition until a plate-resolution voxel grid exists.
"""

from __future__ import annotations

from typing import Any


ROTATIONS = (0, 90, 180, 270)


def _piece(
    family: str,
    width: int,
    depth: int,
    height_units: int,
    *,
    decomposition_enabled: bool,
    grid_mode: str,
) -> dict[str, Any]:
    piece_id = f"{family}_{width}x{depth}"
    family_name = family.title()
    return {
        "piece_id": piece_id,
        "type": f"{width}x{depth}",
        "family": family,
        "display_name": f"{width}×{depth} {family_name}",
        "width": width,
        "depth": depth,
        # ``length`` remains as a backwards-compatible alias for existing code.
        "length": depth,
        "height_units": height_units,
        "footprint": [width, depth],
        "is_brick": family == "brick",
        "is_plate": family == "plate",
        "supported_rotations": list(ROTATIONS),
        "rendering": {
            "studs": True,
            "stud_rows": width,
            "stud_columns": depth,
        },
        "decomposition": {
            "enabled": decomposition_enabled,
            "grid_mode": grid_mode,
        },
    }


# Order is part of the greedy algorithm: larger areas are tried first, with
# two-stud-wide bricks preferred over one-stud-wide bricks when areas tie.
BRICK_SIZES = (
    (2, 8),
    (2, 6),
    (2, 4),
    (1, 8),
    (2, 3),
    (1, 6),
    (2, 2),
    (1, 4),
    (1, 3),
    (1, 2),
    (1, 1),
)

PLATE_SIZES = (
    (2, 4),
    (2, 2),
    (1, 4),
    (1, 3),
    (1, 2),
    (1, 1),
)

BRICK_CATALOG = tuple(
    _piece(
        "brick",
        width,
        depth,
        3,
        decomposition_enabled=True,
        grid_mode="brick",
    )
    for width, depth in BRICK_SIZES
)

PLATE_CATALOG = tuple(
    _piece(
        "plate",
        width,
        depth,
        1,
        decomposition_enabled=False,
        grid_mode="plate",
    )
    for width, depth in PLATE_SIZES
)

PIECE_CATALOG = BRICK_CATALOG + PLATE_CATALOG
PIECES_BY_ID = {piece["piece_id"]: piece for piece in PIECE_CATALOG}


def get_piece(piece_id: str) -> dict[str, Any]:
    """Return one catalog piece or raise a useful error."""
    try:
        return PIECES_BY_ID[piece_id]
    except KeyError as exc:
        raise ValueError(f"Unknown LEGO piece ID: {piece_id}") from exc


def orientations(piece: dict[str, Any]) -> tuple[str, ...]:
    """Return distinct footprint orientations used by decomposition."""
    if piece["width"] == piece["depth"]:
        return ("XZ",)
    return ("XZ", "ZX")


def rotation_for_orientation(orientation: str) -> int:
    """Map the legacy footprint orientation to clockwise Y rotation degrees."""
    if orientation == "XZ":
        return 0
    if orientation == "ZX":
        return 90
    raise ValueError(f"Unknown brick orientation: {orientation}")


def footprint(piece: dict[str, Any], orientation: str | int) -> tuple[int, int]:
    """Return occupied X/Z cells for an orientation or Y rotation."""
    width = int(piece["width"])
    depth = int(piece["depth"] if "depth" in piece else piece["length"])

    if isinstance(orientation, int):
        if orientation not in ROTATIONS:
            raise ValueError(f"Rotation must be one of {ROTATIONS}: {orientation}")
        return (width, depth) if orientation % 180 == 0 else (depth, width)
    if orientation == "XZ":
        return width, depth
    if orientation == "ZX":
        return depth, width
    raise ValueError(f"Unknown brick orientation: {orientation}")
