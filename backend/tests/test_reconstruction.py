from pathlib import Path

import pytest
import trimesh

from reconstruction.stable_fast_3d import (
    validate_generated_model,
    validate_image_path,
)


def test_rejects_missing_image(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="Image file not found"):
        validate_image_path(tmp_path / "missing.png")


def test_rejects_invalid_image_extension(tmp_path: Path) -> None:
    image = tmp_path / "image.gif"
    image.write_bytes(b"GIF89a")

    with pytest.raises(ValueError, match="Unsupported image format"):
        validate_image_path(image)


def test_accepts_non_empty_png_and_jpeg_paths(tmp_path: Path) -> None:
    for filename in ("image.png", "image.jpg", "image.jpeg"):
        image = tmp_path / filename
        image.write_bytes(b"test image bytes")
        assert validate_image_path(image) == image


def test_validates_real_glb_geometry(tmp_path: Path) -> None:
    model = tmp_path / "cube.glb"
    model.write_bytes(trimesh.creation.box().export(file_type="glb"))

    metadata = validate_generated_model(model)

    assert metadata["vertex_count"] == 8
    assert metadata["face_count"] == 12
    assert metadata["bounds"] == {
        "min": [-0.5, -0.5, -0.5],
        "max": [0.5, 0.5, 0.5],
    }
    assert metadata["size_bytes"] > 0


def test_rejects_missing_generated_model(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="Generated model not found"):
        validate_generated_model(tmp_path / "missing.glb")


def test_rejects_invalid_glb(tmp_path: Path) -> None:
    model = tmp_path / "broken.glb"
    model.write_bytes(b"not a glb")

    with pytest.raises(ValueError, match="Could not load generated GLB"):
        validate_generated_model(model)
