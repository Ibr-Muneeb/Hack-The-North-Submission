import pytest

from lego.catalog import (
    BRICK_CATALOG,
    BRICK_SIZES,
    PIECE_CATALOG,
    PLATE_CATALOG,
    footprint,
)
from lego.decomposer import decompose_voxel_grid


EXPECTED_BRICKS = {
    "brick_1x1", "brick_1x2", "brick_1x3", "brick_1x4", "brick_1x6", "brick_1x8",
    "brick_2x2", "brick_2x3", "brick_2x4", "brick_2x6", "brick_2x8",
}
EXPECTED_PLATES = {
    "plate_1x1", "plate_1x2", "plate_1x3", "plate_1x4", "plate_2x2", "plate_2x4",
}


def test_piece_catalog_is_valid_and_has_unique_stable_ids() -> None:
    ids = [piece["piece_id"] for piece in PIECE_CATALOG]

    assert len(ids) == len(set(ids))
    assert {piece["piece_id"] for piece in BRICK_CATALOG} == EXPECTED_BRICKS
    assert {piece["piece_id"] for piece in PLATE_CATALOG} == EXPECTED_PLATES
    for piece in PIECE_CATALOG:
        assert piece["width"] > 0 and piece["depth"] > 0
        assert piece["footprint"] == [piece["width"], piece["depth"]]
        assert piece["supported_rotations"] == [0, 90, 180, 270]
        assert piece["display_name"]


def test_plate_metadata_is_physically_distinct_and_not_decomposed() -> None:
    assert all(piece["family"] == "plate" for piece in PLATE_CATALOG)
    assert all(piece["height_units"] == 1 for piece in PLATE_CATALOG)
    assert all(not piece["decomposition"]["enabled"] for piece in PLATE_CATALOG)
    assert all(piece["decomposition"]["grid_mode"] == "plate" for piece in PLATE_CATALOG)
    assert all(piece["height_units"] == 3 for piece in BRICK_CATALOG)


@pytest.mark.parametrize("width,depth", BRICK_SIZES)
def test_every_supported_brick_footprint_decomposes_as_one_piece(
    width: int, depth: int
) -> None:
    voxels = [[x, 0, z] for z in range(depth) for x in range(width)]
    result = decompose_voxel_grid(
        {"dimensions": [width, 1, depth], "voxel_size": 1.0, "voxels": voxels}
    )

    assert result["brick_count"] == 1
    assert result["bricks"][0]["piece_id"] == f"brick_{width}x{depth}"


@pytest.mark.parametrize(
    ("rotation", "expected"),
    [(0, (2, 4)), (90, (4, 2)), (180, (2, 4)), (270, (4, 2))],
)
def test_2x4_rotation_footprints(rotation: int, expected: tuple[int, int]) -> None:
    assert footprint({"width": 2, "depth": 4}, rotation) == expected


@pytest.mark.parametrize(
    ("rotation", "expected"),
    [(0, (1, 4)), (90, (4, 1)), (180, (1, 4)), (270, (4, 1))],
)
def test_1x4_rotation_footprints(rotation: int, expected: tuple[int, int]) -> None:
    assert footprint({"width": 1, "depth": 4}, rotation) == expected
