"""Simple mesh-to-voxel conversion for Brickify.

Coordinate convention
---------------------
Brickify treats X and Z as the horizontal axes and +Y as up. This module
assumes the input mesh already follows that convention; it does not rotate or
otherwise infer the source mesh's up axis.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import trimesh


SUPPORTED_EXTENSIONS = {".obj", ".glb", ".gltf"}


def _load_mesh(mesh_path: Path) -> trimesh.Trimesh:
    """Load a file and flatten scene geometry into one transformed mesh."""
    try:
        loaded = trimesh.load(mesh_path, process=True)
    except Exception as exc:
        raise ValueError(f"Could not load mesh '{mesh_path}': {exc}") from exc

    if isinstance(loaded, trimesh.Scene):
        if not loaded.geometry:
            raise ValueError(f"Mesh scene '{mesh_path}' contains no geometry.")
        # dump(concatenate=True) applies each scene-node transform before
        # combining the geometries, which preserves their placement.
        try:
            loaded = loaded.dump(concatenate=True)
        except Exception as exc:
            raise ValueError(
                f"Could not combine scene geometry in '{mesh_path}': {exc}"
            ) from exc

    if not isinstance(loaded, trimesh.Trimesh):
        raise ValueError(
            f"'{mesh_path}' did not contain a supported triangle mesh "
            f"(loaded {type(loaded).__name__})."
        )
    if loaded.is_empty or len(loaded.vertices) == 0 or len(loaded.faces) == 0:
        raise ValueError(f"Mesh '{mesh_path}' is empty or has no triangle faces.")
    if not np.isfinite(loaded.vertices).all():
        raise ValueError(f"Mesh '{mesh_path}' contains non-finite vertex values.")

    return loaded


def voxelize_mesh(mesh_path: str | Path, voxel_size: float = 0.2) -> dict[str, Any]:
    """Voxelize an OBJ, GLB, or glTF mesh and return JSON-safe data.

    Surface voxels are filled to represent the solid interior when the mesh
    permits it. Returned voxel coordinates are zero-based integer indices.
    X/Z are horizontal and +Y is up.
    """
    path = Path(mesh_path).expanduser()

    if isinstance(voxel_size, bool) or not isinstance(voxel_size, (int, float)):
        raise TypeError("voxel_size must be a positive finite number.")
    voxel_size = float(voxel_size)
    if not np.isfinite(voxel_size) or voxel_size <= 0:
        raise ValueError("voxel_size must be a positive finite number.")
    if not path.exists():
        raise FileNotFoundError(f"Mesh file not found: '{path}'.")
    if not path.is_file():
        raise ValueError(f"Mesh path is not a file: '{path}'.")
    extension = path.suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise ValueError(
            f"Unsupported mesh format '{extension or '(none)'}'. "
            f"Supported formats: {supported}."
        )

    mesh = _load_mesh(path)
    original_bounds = np.asarray(mesh.bounds, dtype=float)

    # Work on a copy so helper behavior remains unsurprising if reused later.
    mesh = mesh.copy()
    mesh.apply_translation(-original_bounds[0])
    normalized_bounds = np.asarray(mesh.bounds, dtype=float)

    try:
        voxel_grid = mesh.voxelized(pitch=voxel_size).fill()
    except Exception as exc:
        raise ValueError(f"Could not voxelize mesh '{path}': {exc}") from exc

    indices = np.asarray(voxel_grid.sparse_indices, dtype=np.int64)
    if indices.size == 0:
        raise ValueError(
            f"Voxelization of '{path}' produced no occupied voxels. "
            "Try a smaller voxel_size."
        )
    indices = indices.reshape((-1, 3))

    # sparse_indices are relative to the VoxelGrid encoding and normally begin
    # at zero. Rebasing guarantees a compact, zero-based result for the
    # frontend even if a future trimesh version changes that detail.
    indices -= indices.min(axis=0)
    dimensions = indices.max(axis=0) + 1

    # Sort for deterministic JSON output: x, then y, then z.
    order = np.lexsort((indices[:, 2], indices[:, 1], indices[:, 0]))
    indices = indices[order]

    return {
        "voxelSize": voxel_size,
        "dimensions": [int(value) for value in dimensions],
        "voxels": [[int(value) for value in row] for row in indices],
        "bounds": {
            "original": {
                "min": original_bounds[0].tolist(),
                "max": original_bounds[1].tolist(),
            },
            "normalized": {
                "min": normalized_bounds[0].tolist(),
                "max": normalized_bounds[1].tolist(),
            },
        },
        "source": {
            "fileName": path.name,
            "format": extension.lstrip("."),
            "fileSizeBytes": int(path.stat().st_size),
            "vertexCount": int(len(mesh.vertices)),
            "faceCount": int(len(mesh.faces)),
        },
        "coordinateConvention": "X/Z horizontal, +Y up",
    }
