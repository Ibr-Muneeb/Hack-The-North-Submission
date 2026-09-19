from lego.colors import COLOR_CATALOG, assign_colors
from lego.model import aggregate_parts, build_lego_model


def test_color_catalog_has_stable_valid_values() -> None:
    ids = [color["color_id"] for color in COLOR_CATALOG]

    assert len(COLOR_CATALOG) == 12
    assert len(ids) == len(set(ids))
    assert {"red", "blue", "yellow", "green", "orange", "white", "black"} <= set(ids)
    for color in COLOR_CATALOG:
        assert color["hex"].startswith("#") and len(color["hex"]) == 7
        assert len(color["rgb"]) == 3
        assert all(0 <= channel <= 255 for channel in color["rgb"])


def test_color_assignment_is_deterministic_and_respects_layer_colors() -> None:
    bricks = [
        {"piece_id": "brick_2x4", "width": 2, "depth": 4, "position": [0, 0, 0]},
        {"piece_id": "brick_1x2", "width": 1, "depth": 2, "position": [3, 1, 2]},
    ]

    first = assign_colors(bricks, layer_colors={0: "red"})
    second = assign_colors(bricks, layer_colors={0: "red"})

    assert first == second
    assert first[0]["color_id"] == "red"


def test_parts_aggregation_counts_actual_piece_and_color_variants() -> None:
    bricks = [
        {"piece_id": "brick_2x4", "color_id": "red"},
        {"piece_id": "brick_2x4", "color_id": "red"},
        {"piece_id": "brick_2x4", "color_id": "blue"},
        {"piece_id": "brick_1x2", "color_id": "red"},
    ]

    parts = aggregate_parts(bricks)

    assert sum(part["count"] for part in parts) == 4
    assert {(part["piece_id"], part["color_id"], part["count"]) for part in parts} == {
        ("brick_1x2", "red", 1),
        ("brick_2x4", "blue", 1),
        ("brick_2x4", "red", 2),
    }


def test_lego_model_statistics_and_parts_come_from_decomposition() -> None:
    grid = {
        "dimensions": [2, 2, 4],
        "voxel_size": 0.2,
        "voxels": [[x, y, z] for y in range(2) for z in range(4) for x in range(2)],
    }

    model = build_lego_model(grid, model_name="Test", layer_colors={0: "red", 1: "blue"})

    assert model["brick_count"] == 2
    assert model["statistics"] == {
        "total_pieces": 2,
        "unique_piece_types": 1,
        "unique_part_variants": 2,
        "color_count": 2,
    }
    assert sum(part["count"] for part in model["parts"]) == model["brick_count"]
    assert model["plate_decomposition"]["enabled"] is False
