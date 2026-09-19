"""Tests for Brickify's Python mesh voxelizer."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from voxelizer import voxelize_mesh  # noqa: E402


class VoxelizerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.cube_path = BACKEND_DIR / "test_models" / "cube.obj"

    def test_cube_result_is_json_serializable_and_well_formed(self) -> None:
        result = voxelize_mesh(self.cube_path, voxel_size=0.25)

        json.dumps(result)
        self.assertEqual(result["dimensions"], [5, 5, 5])
        self.assertEqual(result["coordinateConvention"], "X/Z horizontal, +Y up")
        self.assertEqual(result["bounds"]["normalized"]["min"], [0.0, 0.0, 0.0])
        self.assertGreater(len(result["voxels"]), 0)

        for coordinate in result["voxels"]:
            self.assertEqual(len(coordinate), 3)
            self.assertTrue(all(isinstance(value, int) for value in coordinate))
            self.assertTrue(
                all(0 <= value < result["dimensions"][axis] for axis, value in enumerate(coordinate))
            )

    def test_shifted_mesh_is_normalized(self) -> None:
        obj = """\
v 2 3 4
v 3 3 4
v 2 4 4
f 1 2 3
"""
        with tempfile.TemporaryDirectory() as temp_dir:
            mesh_path = Path(temp_dir) / "triangle.obj"
            mesh_path.write_text(obj, encoding="utf-8")
            result = voxelize_mesh(mesh_path, voxel_size=0.25)

        self.assertEqual(result["bounds"]["original"]["min"], [2.0, 3.0, 4.0])
        self.assertEqual(result["bounds"]["normalized"]["min"], [0.0, 0.0, 0.0])

    def test_missing_file_has_clear_error(self) -> None:
        with self.assertRaisesRegex(FileNotFoundError, "Mesh file not found"):
            voxelize_mesh(BACKEND_DIR / "missing.obj")

    def test_invalid_voxel_size_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "positive finite number"):
            voxelize_mesh(self.cube_path, voxel_size=0)

    def test_unsupported_extension_is_rejected(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".stl") as unsupported:
            with self.assertRaisesRegex(ValueError, "Unsupported mesh format"):
                voxelize_mesh(unsupported.name)


if __name__ == "__main__":
    unittest.main()
