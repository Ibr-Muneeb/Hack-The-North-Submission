"""Deterministic greedy conversion from occupied voxels to LEGO footprints.

Coordinate convention
---------------------
The input uses Brickify's existing +X right, +Y up, +Z front convention.
Every brick lies within one Y layer. Its ``position`` is the minimum
``[x, y, z]`` corner. In ``XZ`` orientation, ``width`` extends along X and
``length`` extends along Z; ``ZX`` swaps those axes.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from lego.catalog import BRICK_CATALOG, footprint, orientations, rotation_for_orientation


Voxel = tuple[int, int, int]


def _validate_voxel_grid(voxel_grid: Mapping[str, Any]) -> tuple[list[int], set[Voxel]]:
    if not isinstance(voxel_grid, Mapping):
        raise TypeError("voxel_grid must be a mapping with dimensions and voxels")

    dimensions = voxel_grid.get("dimensions")
    if (
        not isinstance(dimensions, list)
        or len(dimensions) != 3
        or any(type(value) is not int or value <= 0 for value in dimensions)
    ):
        raise ValueError("dimensions must be [size_x, size_y, size_z] positive integers")

    raw_voxels = voxel_grid.get("voxels")
    if not isinstance(raw_voxels, list):
        raise ValueError("voxels must be a list of integer [x, y, z] coordinates")

    voxels: set[Voxel] = set()
    for index, coordinate in enumerate(raw_voxels):
        if (
            not isinstance(coordinate, (list, tuple))
            or len(coordinate) != 3
            or any(type(value) is not int for value in coordinate)
        ):
            raise ValueError(f"voxels[{index}] must be an integer [x, y, z] coordinate")

        voxel = tuple(coordinate)
        if any(value < 0 or value >= dimensions[axis] for axis, value in enumerate(voxel)):
            raise ValueError(
                f"voxels[{index}] coordinate {list(voxel)} is outside dimensions {dimensions}"
            )
        if voxel in voxels:
            raise ValueError(f"voxels[{index}] duplicates coordinate {list(voxel)}")
        voxels.add(voxel)

    return list(dimensions), voxels


def _placement_cells(
    position: Voxel,
    brick: dict[str, Any],
    orientation: str,
) -> set[Voxel]:
    size_x, size_z = footprint(brick, orientation)
    x, y, z = position
    return {
        (x + offset_x, y, z + offset_z)
        for offset_z in range(size_z)
        for offset_x in range(size_x)
    }


def decompose_voxel_grid(voxel_grid: Mapping[str, Any]) -> dict[str, Any]:
    """Cover every occupied voxel exactly once using greedy brick footprints."""
    dimensions, original_voxels = _validate_voxel_grid(voxel_grid)
    remaining = set(original_voxels)
    bricks: list[dict[str, Any]] = []

    while remaining:
        # Layers are independent because Y is the first sort key. Within a
        # layer, lower Z then lower X anchors are always handled first.
        anchor = min(remaining, key=lambda voxel: (voxel[1], voxel[2], voxel[0]))
        selected: tuple[dict[str, Any], str, set[Voxel]] | None = None

        for brick in BRICK_CATALOG:
            for orientation in orientations(brick):
                cells = _placement_cells(anchor, brick, orientation)
                if cells <= remaining:
                    selected = brick, orientation, cells
                    break
            if selected is not None:
                break

        # The catalog always ends with 1x1, so valid input must find a fit.
        if selected is None:  # pragma: no cover - defensive invariant
            raise RuntimeError(f"No brick could cover voxel {anchor}")

        brick, orientation, cells = selected
        bricks.append(
            {
                "piece_id": brick["piece_id"],
                "type": brick["type"],
                "display_name": brick["display_name"],
                "family": brick["family"],
                "width": brick["width"],
                "depth": brick["depth"],
                "length": brick["length"],
                "height_units": brick["height_units"],
                "position": list(anchor),
                "orientation": orientation,
                "rotation_degrees": rotation_for_orientation(orientation),
            }
        )
        remaining.difference_update(cells)

    return {
        "dimensions": dimensions,
        "bricks": bricks,
        "brick_count": len(bricks),
        "covered_voxels": len(original_voxels),
        "grid_mode": "brick",
        "vertical_unit": "one brick height (three plate units)",
        "coordinate_system": {
            "position": "minimum [x, y, z] corner",
            "x": "right",
            "y": "up; each brick occupies one layer",
            "z": "front",
            "orientation": "XZ/0° uses width on X and depth on Z; ZX/90° swaps them",
            "rotation": "clockwise degrees around +Y; 0, 90, 180, or 270",
        },
    }


def main() -> None:
    """Run a tiny 2x4 demonstration when executed as a module."""
    voxels = [[x, 0, z] for z in range(4) for x in range(2)]
    example = {"dimensions": [2, 1, 4], "voxel_size": 0.1, "voxels": voxels}
    result = decompose_voxel_grid(example)

    print("Input: 8 voxels forming a 2x4 rectangle")
    print(f"Output: {result['brick_count']} x {result['bricks'][0]['type']} brick")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
