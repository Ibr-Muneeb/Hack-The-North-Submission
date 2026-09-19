"""Supported logical LEGO brick footprints.

``width`` is the X footprint and ``length`` is the Z footprint when a brick
uses the ``XZ`` orientation. ``ZX`` swaps those two footprint axes.
"""

from __future__ import annotations


# Fixed order is part of the deterministic greedy algorithm. The 2x2 is tried
# before 1x4 when their areas tie, matching the milestone's requested catalog.
BRICK_CATALOG = (
    {"type": "2x4", "width": 2, "length": 4},
    {"type": "2x3", "width": 2, "length": 3},
    {"type": "2x2", "width": 2, "length": 2},
    {"type": "1x4", "width": 1, "length": 4},
    {"type": "1x3", "width": 1, "length": 3},
    {"type": "1x2", "width": 1, "length": 2},
    {"type": "1x1", "width": 1, "length": 1},
)


def orientations(brick: dict[str, int | str]) -> tuple[str, ...]:
    """Return distinct orientations in deterministic preference order."""
    if brick["width"] == brick["length"]:
        return ("XZ",)
    return ("XZ", "ZX")


def footprint(brick: dict[str, int | str], orientation: str) -> tuple[int, int]:
    """Return the brick's occupied cell count along X and Z."""
    width = int(brick["width"])
    length = int(brick["length"])
    if orientation == "XZ":
        return width, length
    if orientation == "ZX":
        return length, width
    raise ValueError(f"Unknown brick orientation: {orientation}")
