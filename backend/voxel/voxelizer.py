"""Load, normalize, and voxelize triangle meshes.

Coordinate convention
---------------------
Brickify keeps the input mesh axes and interprets +X as right, +Y as up, and
+Z as front. The module does not guess or rotate an OBJ's up axis.

Normalization moves the mesh's bounding-box center to the origin and scales
all three axes by the same amount so its longest dimension is ``target_size``.
This preserves the mesh's proportions.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import trimesh


SUPPORTED_EXTENSIONS = {".obj", ".glb", ".gltf"}
DEFAULT_TARGET_SIZE = 1.0


def load_mesh(mesh_path: str | Path) -> trimesh.Trimesh:
    """Load an OBJ, GLB, or glTF file as one transformed triangle mesh."""
    path = Path(mesh_path).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"Mesh file not found: {path}")
    if not path.is_file():
        raise ValueError(f"Mesh path is not a file: {path}")
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        formats = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise ValueError(f"Unsupported mesh format '{path.suffix or '(none)'}'; use {formats}")

    try:
        loaded = trimesh.load(path, process=True)
    except Exception as exc:
        raise ValueError(f"Could not load mesh '{path.name}': {exc}") from exc

    if isinstance(loaded, trimesh.Scene):
        if not loaded.geometry:
            raise ValueError(f"Mesh '{path.name}' contains no geometry")
        loaded = loaded.to_geometry()

    if not isinstance(loaded, trimesh.Trimesh):
        raise ValueError(f"'{path.name}' did not contain a triangle mesh")
    if loaded.is_empty or len(loaded.vertices) == 0 or len(loaded.faces) == 0:
        raise ValueError(f"Mesh '{path.name}' is empty or has no triangle faces")
    if not np.isfinite(loaded.vertices).all():
        raise ValueError(f"Mesh '{path.name}' contains non-finite vertices")

    return loaded


def normalize_mesh(
    mesh: trimesh.Trimesh,
    target_size: float = DEFAULT_TARGET_SIZE,
) -> trimesh.Trimesh:
    """Return a centered, uniformly scaled copy of ``mesh``."""
    if not isinstance(mesh, trimesh.Trimesh) or mesh.is_empty:
        raise ValueError("normalize_mesh requires a non-empty Trimesh")
    if not np.isfinite(target_size) or target_size <= 0:
        raise ValueError("target_size must be a positive finite number")

    bounds = np.asarray(mesh.bounds, dtype=float)
    extents = bounds[1] - bounds[0]
    longest_extent = float(extents.max())
    if not np.isfinite(longest_extent) or longest_extent <= 0:
        raise ValueError("Mesh must have non-zero three-dimensional bounds")

    normalized = mesh.copy()
    normalized.apply_translation(-bounds.mean(axis=0))
    normalized.apply_scale(float(target_size) / longest_extent)
    return normalized


def voxelize_mesh(
    mesh_path: str | Path,
    voxel_size: float = 0.1,
    target_size: float = DEFAULT_TARGET_SIZE,
) -> dict[str, Any]:
    """Voxelize a mesh and return a JSON-serializable zero-based grid.

    ``origin`` is the normalized-space center of voxel coordinate ``[0,0,0]``.
    ``dimensions`` and every item in ``voxels`` follow X, Y, Z order.
    """
    if not np.isfinite(voxel_size) or voxel_size <= 0:
        raise ValueError("voxel_size must be a positive finite number")

    path = Path(mesh_path).expanduser()
    mesh = normalize_mesh(load_mesh(path), target_size=target_size)

    try:
        voxel_grid = mesh.voxelized(pitch=float(voxel_size)).fill()
    except Exception as exc:
        raise ValueError(f"Could not voxelize mesh '{path.name}': {exc}") from exc

    raw_indices = np.asarray(voxel_grid.sparse_indices, dtype=np.int64).reshape((-1, 3))
    if len(raw_indices) == 0:
        raise ValueError(
            f"Voxelization of '{path.name}' produced no occupied voxels; "
            "try a smaller voxel_size"
        )

    minimum_index = raw_indices.min(axis=0)
    indices = raw_indices - minimum_index
    dimensions = indices.max(axis=0) + 1
    origin = voxel_grid.indices_to_points(minimum_index.reshape(1, 3))[0]

    # Stable X/Y/Z ordering makes repeated runs byte-for-byte comparable.
    order = np.lexsort((indices[:, 2], indices[:, 1], indices[:, 0]))
    indices = indices[order]

    return {
        "dimensions": [int(value) for value in dimensions],
        "voxel_size": float(voxel_size),
        "voxels": [[int(value) for value in row] for row in indices],
        "origin": [float(value) for value in origin],
        "bounds": {
            "min": [float(value) for value in mesh.bounds[0]],
            "max": [float(value) for value in mesh.bounds[1]],
        },
        "coordinate_system": {
            "order": "XYZ",
            "x": "left/right (+X right)",
            "y": "up/down (+Y up)",
            "z": "front/back (+Z front)",
        },
    }
