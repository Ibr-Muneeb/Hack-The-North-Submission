from collections import Counter

import pytest

from lego.catalog import footprint
from lego.decomposer import decompose_voxel_grid


def grid(dimensions: list[int], voxels: list[list[int]]) -> dict:
    return {"dimensions": dimensions, "voxel_size": 0.1, "voxels": voxels}


def covered_cells(brick: dict) -> set[tuple[int, int, int]]:
    size_x, size_z = footprint(brick, brick["orientation"])
    x, y, z = brick["position"]
    return {
        (x + offset_x, y, z + offset_z)
        for offset_z in range(size_z)
        for offset_x in range(size_x)
    }


@pytest.mark.parametrize(
    ("voxels", "dimensions", "expected_type"),
    [
        ([[0, 0, 0]], [1, 1, 1], "1x1"),
        ([[0, 0, 0], [1, 0, 0]], [2, 1, 1], "1x2"),
        ([[x, 0, 0] for x in range(4)], [4, 1, 1], "1x4"),
        ([[x, 0, z] for z in range(4) for x in range(2)], [2, 1, 4], "2x4"),
    ],
)
def test_basic_shapes_use_the_largest_fitting_brick(
    voxels: list[list[int]], dimensions: list[int], expected_type: str
) -> None:
    result = decompose_voxel_grid(grid(dimensions, voxels))

    assert result["brick_count"] == 1
    assert result["bricks"][0]["type"] == expected_type


def test_2x4_rectangle_is_not_eight_1x1_bricks() -> None:
    voxels = [[x, 0, z] for z in range(4) for x in range(2)]
    result = decompose_voxel_grid(grid([2, 1, 4], voxels))

    assert result["brick_count"] == 1
    assert Counter(brick["type"] for brick in result["bricks"]) == {"2x4": 1}


def test_multiple_y_layers_are_decomposed_independently() -> None:
    voxels = [[x, y, z] for y in range(2) for z in range(4) for x in range(2)]
    result = decompose_voxel_grid(grid([2, 2, 4], voxels))

    assert result["brick_count"] == 2
    assert [brick["position"][1] for brick in result["bricks"]] == [0, 1]
    assert all(brick["type"] == "2x4" for brick in result["bricks"])


def test_irregular_shape_has_complete_exact_non_overlapping_coverage() -> None:
    voxels = [
        [0, 0, 0], [1, 0, 0], [2, 0, 0],
        [0, 0, 1], [1, 0, 1],
        [0, 0, 2],
        [2, 1, 1], [3, 1, 1],
        [3, 1, 2],
    ]
    result = decompose_voxel_grid(grid([4, 2, 3], voxels))
    original = {tuple(voxel) for voxel in voxels}
    covered: set[tuple[int, int, int]] = set()

    for brick in result["bricks"]:
        cells = covered_cells(brick)
        assert cells <= original, "brick covered an unoccupied voxel"
        assert covered.isdisjoint(cells), "bricks overlapped"
        covered.update(cells)

    assert covered == original
    assert result["covered_voxels"] == len(original)


def test_repeated_runs_are_identical() -> None:
    voxels = [[x, 0, z] for z in range(3) for x in range(5)]
    voxel_grid = grid([5, 1, 3], voxels)

    assert decompose_voxel_grid(voxel_grid) == decompose_voxel_grid(voxel_grid)


def test_empty_voxel_input_is_clean() -> None:
    result = decompose_voxel_grid(grid([1, 1, 1], []))

    assert result["bricks"] == []
    assert result["brick_count"] == 0
    assert result["covered_voxels"] == 0


@pytest.mark.parametrize(
    ("voxel_grid", "message"),
    [
        (None, "must be a mapping"),
        ({"dimensions": [1, 1], "voxels": []}, "dimensions must be"),
        ({"dimensions": [1, 1, 1]}, "voxels must be"),
        ({"dimensions": [1, 1, 1], "voxels": [[0, 0]]}, "must be an integer"),
        ({"dimensions": [1, 1, 1], "voxels": [[1, 0, 0]]}, "outside dimensions"),
        ({"dimensions": [1, 1, 1], "voxels": [[0, 0, 0], [0, 0, 0]]}, "duplicates"),
    ],
)
def test_invalid_voxel_data_has_useful_error(voxel_grid: dict | None, message: str) -> None:
    with pytest.raises((TypeError, ValueError), match=message):
        decompose_voxel_grid(voxel_grid)
