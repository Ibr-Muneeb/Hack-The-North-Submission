"""Deterministic voxel demo models for the Brickify frontend."""

from __future__ import annotations

from typing import Any


def _grid(dimensions: list[int], voxels: set[tuple[int, int, int]]) -> dict[str, Any]:
    return {
        "dimensions": dimensions,
        "voxel_size": 1.0,
        "voxels": [list(voxel) for voxel in sorted(voxels)],
    }


def house_grid() -> dict[str, Any]:
    dimensions = [10, 7, 8]
    voxels = {
        (x, y, z)
        for y in range(4)
        for z in range(dimensions[2])
        for x in range(dimensions[0])
    }

    for y in range(3):
        for x in (4, 5):
            voxels.discard((x, y, 7))
    for y in (1, 2):
        for x in (1, 2, 7, 8):
            voxels.discard((x, y, 7))
        for z in (2, 3):
            voxels.discard((0, y, z))

    for x_min, x_max, y in ((0, 10, 4), (1, 9, 5), (3, 7, 6)):
        voxels.update(
            (x, y, z)
            for z in range(dimensions[2])
            for x in range(x_min, x_max)
        )
    return _grid(dimensions, voxels)


def robot_grid() -> dict[str, Any]:
    dimensions = [9, 12, 5]
    voxels: set[tuple[int, int, int]] = set()

    # Feet and separate legs.
    voxels.update((x, 0, z) for x in (*range(0, 3), *range(6, 9)) for z in range(5))
    voxels.update(
        (x, y, z)
        for y in range(1, 4)
        for x in (*range(1, 3), *range(6, 8))
        for z in range(1, 4)
    )

    # Torso with side arms.
    voxels.update((x, y, z) for y in range(4, 8) for x in range(1, 8) for z in range(5))
    voxels.update((x, y, z) for y in range(5, 8) for x in (0, 8) for z in range(1, 4))

    # Neck and head. Two front voxels are removed as eyes.
    voxels.update((x, 8, z) for x in range(3, 6) for z in range(1, 4))
    voxels.update((x, y, z) for y in range(9, 12) for x in range(2, 7) for z in range(5))
    for x in (3, 5):
        voxels.discard((x, 10, 4))

    return _grid(dimensions, voxels)


DEMO_MODELS = {
    "house": {
        "model_id": "house",
        "model_name": "Brickify House",
        "description": "A stepped-roof house with a doorway and windows.",
        "grid_factory": house_grid,
        "layer_colors": {
            0: "blue",
            1: "yellow",
            2: "yellow",
            3: "yellow",
            4: "red",
            5: "red",
            6: "red",
        },
    },
    "robot": {
        "model_id": "robot",
        "model_name": "Brickify Robot",
        "description": "A colorful robot with separate legs, arms, and inset eyes.",
        "grid_factory": robot_grid,
        "layer_colors": {
            0: "dark_gray",
            1: "dark_gray",
            2: "dark_gray",
            3: "dark_gray",
            4: "blue",
            5: "blue",
            6: "blue",
            7: "blue",
            8: "light_gray",
            9: "yellow",
            10: "yellow",
            11: "yellow",
        },
    },
}


def list_demos() -> list[dict[str, str]]:
    return [
        {
            "model_id": demo["model_id"],
            "model_name": demo["model_name"],
            "description": demo["description"],
        }
        for demo in DEMO_MODELS.values()
    ]


def get_demo(model_id: str) -> dict[str, Any]:
    try:
        return DEMO_MODELS[model_id]
    except KeyError as exc:
        choices = ", ".join(DEMO_MODELS)
        raise ValueError(f"Unknown demo model '{model_id}'; use {choices}") from exc
