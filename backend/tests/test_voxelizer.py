from pathlib import Path

import numpy as np
import pytest
import trimesh

from voxel.voxelizer import load_mesh, normalize_mesh, voxelize_mesh


TEST_MODELS = Path(__file__).resolve().parents[1] / "test_models"
CUBE_PATH = TEST_MODELS / "cube.obj"


def test_loads_valid_obj_mesh() -> None:
    mesh = load_mesh(CUBE_PATH)

    assert isinstance(mesh, trimesh.Trimesh)
    assert len(mesh.vertices) == 8
    assert len(mesh.faces) == 12


def test_loads_valid_glb_mesh(tmp_path: Path) -> None:
    path = tmp_path / "cube.glb"
    path.write_bytes(trimesh.creation.box().export(file_type="glb"))

    mesh = load_mesh(path)

    assert isinstance(mesh, trimesh.Trimesh)
    assert not mesh.is_empty


def test_normalization_centers_and_uniformly_scales() -> None:
    mesh = trimesh.creation.box(extents=[2.0, 4.0, 8.0])
    mesh.apply_translation([7.0, -3.0, 11.0])

    normalized = normalize_mesh(mesh)

    assert np.allclose(normalized.bounds.mean(axis=0), [0.0, 0.0, 0.0])
    assert np.allclose(normalized.extents, [0.25, 0.5, 1.0])
    assert np.allclose(normalized.extents / normalized.extents.max(), [0.25, 0.5, 1.0])


def test_voxelization_is_non_empty_integer_and_deterministic() -> None:
    first = voxelize_mesh(CUBE_PATH, voxel_size=0.1)
    second = voxelize_mesh(CUBE_PATH, voxel_size=0.1)

    assert first == second
    assert first["dimensions"] == [11, 11, 11]
    assert len(first["voxels"]) == 1331
    assert all(isinstance(value, int) for voxel in first["voxels"] for value in voxel)


def test_voxel_coordinates_fit_declared_dimensions() -> None:
    result = voxelize_mesh(CUBE_PATH, voxel_size=0.2)

    assert result["dimensions"] == [5, 5, 5]
    assert result["voxels"]
    for voxel in result["voxels"]:
        assert all(0 <= voxel[axis] < result["dimensions"][axis] for axis in range(3))


def test_missing_invalid_and_unsupported_meshes(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="Mesh file not found"):
        load_mesh(tmp_path / "missing.obj")

    unsupported = tmp_path / "mesh.stl"
    unsupported.write_text("solid empty\nendsolid", encoding="utf-8")
    with pytest.raises(ValueError, match="Unsupported mesh format"):
        load_mesh(unsupported)

    invalid = tmp_path / "empty.obj"
    invalid.write_text("# no geometry\n", encoding="utf-8")
    with pytest.raises(ValueError, match="no geometry|empty|triangle mesh"):
        load_mesh(invalid)


@pytest.mark.parametrize("voxel_size", [0, -0.1, np.nan, np.inf])
def test_rejects_invalid_voxel_size(voxel_size: float) -> None:
    with pytest.raises(ValueError, match="voxel_size must be a positive finite number"):
        voxelize_mesh(CUBE_PATH, voxel_size=voxel_size)
