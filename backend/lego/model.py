"""Build API-ready LEGO models and aggregate their real parts."""

from __future__ import annotations

from collections import Counter
from typing import Any

from lego.catalog import PIECE_CATALOG, get_piece
from lego.colors import COLOR_CATALOG, assign_colors, get_color
from lego.decomposer import decompose_voxel_grid


def aggregate_parts(bricks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Count actual placements by piece ID and color, ignoring orientation."""
    counts = Counter((brick["piece_id"], brick["color_id"]) for brick in bricks)
    parts: list[dict[str, Any]] = []
    for (piece_id, color_id), count in sorted(counts.items()):
        piece = get_piece(piece_id)
        color = get_color(color_id)
        parts.append(
            {
                "piece_id": piece_id,
                "display_name": piece["display_name"],
                "family": piece["family"],
                "width": piece["width"],
                "depth": piece["depth"],
                "height_units": piece["height_units"],
                "color_id": color_id,
                "color_name": color["display_name"],
                "color_hex": color["hex"],
                "count": count,
            }
        )
    return parts


def build_lego_model(
    voxel_grid: dict[str, Any],
    *,
    model_name: str,
    model_id: str | None = None,
    layer_colors: dict[int, str] | None = None,
) -> dict[str, Any]:
    """Decompose, color, and summarize one brick-resolution voxel model."""
    result = decompose_voxel_grid(voxel_grid)
    bricks = assign_colors(result["bricks"], layer_colors=layer_colors)
    parts = aggregate_parts(bricks)
    unique_piece_types = len({brick["piece_id"] for brick in bricks})
    color_count = len({brick["color_id"] for brick in bricks})

    return {
        **result,
        "bricks": bricks,
        "model_id": model_id,
        "model_name": model_name,
        "voxel_size": float(voxel_grid.get("voxel_size", 1.0)),
        "voxel_count": len(voxel_grid["voxels"]),
        "parts": parts,
        "statistics": {
            "total_pieces": len(bricks),
            "unique_piece_types": unique_piece_types,
            "unique_part_variants": len(parts),
            "color_count": color_count,
        },
        "piece_catalog": {piece["piece_id"]: piece for piece in PIECE_CATALOG},
        "color_catalog": {color["color_id"]: color for color in COLOR_CATALOG},
        "plate_decomposition": {
            "enabled": False,
            "reason": "Current voxel Y units are brick-height; plates require plate-grid mode.",
        },
    }
