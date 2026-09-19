"""Small client for Stability AI's public Stable Fast 3D Gradio Space."""

from __future__ import annotations

import os
import shutil
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import trimesh
from gradio_client import Client, handle_file


SPACE_ID = "stabilityai/stable-fast-3d"
PREPROCESS_API = "/requires_bg_remove"
GENERATE_API = "/run_button"
SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}


class ReconstructionError(RuntimeError):
    """Raised when the hosted reconstruction service cannot produce a model."""


def validate_image_path(image_path: str | Path) -> Path:
    """Validate a local PNG or JPEG path."""
    path = Path(image_path).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"Image file not found: {path}")
    if not path.is_file():
        raise ValueError(f"Image path is not a file: {path}")
    if path.suffix.lower() not in SUPPORTED_IMAGE_EXTENSIONS:
        extensions = ", ".join(sorted(SUPPORTED_IMAGE_EXTENSIONS))
        raise ValueError(f"Unsupported image format '{path.suffix or '(none)'}'; use {extensions}")
    if path.stat().st_size == 0:
        raise ValueError(f"Image file is empty: {path}")
    return path


def validate_generated_model(model_path: str | Path) -> dict[str, Any]:
    """Load a generated GLB and return basic geometry metadata."""
    path = Path(model_path).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"Generated model not found: {path}")
    if not path.is_file():
        raise ValueError(f"Generated model path is not a file: {path}")
    if path.suffix.lower() != ".glb":
        raise ValueError(f"Generated model must be a .glb file: {path}")
    if path.stat().st_size == 0:
        raise ValueError(f"Generated model is empty: {path}")

    try:
        loaded = trimesh.load(path, process=False)
    except Exception as exc:
        raise ValueError(f"Could not load generated GLB '{path.name}': {exc}") from exc

    if isinstance(loaded, trimesh.Scene):
        if not loaded.geometry:
            raise ValueError(f"Generated GLB '{path.name}' contains no geometry")
        mesh = loaded.to_geometry()
    elif isinstance(loaded, trimesh.Trimesh):
        mesh = loaded
    else:
        raise ValueError(f"Generated GLB '{path.name}' did not contain a triangle mesh")

    if mesh.is_empty or len(mesh.vertices) == 0 or len(mesh.faces) == 0:
        raise ValueError(f"Generated GLB '{path.name}' has no usable vertices or faces")

    return {
        "vertex_count": int(len(mesh.vertices)),
        "face_count": int(len(mesh.faces)),
        "bounds": {
            "min": [float(value) for value in mesh.bounds[0]],
            "max": [float(value) for value in mesh.bounds[1]],
        },
        "size_bytes": int(path.stat().st_size),
    }


def _find_glb_path(value: Any) -> Path | None:
    """Find the downloaded GLB path inside a Gradio response."""
    if isinstance(value, (str, Path)):
        path = Path(value)
        if path.suffix.lower() == ".glb" and path.is_file():
            return path
        return None
    if isinstance(value, Mapping):
        for key in ("path", "name"):
            if key in value:
                found = _find_glb_path(value[key])
                if found is not None:
                    return found
        for nested in value.values():
            found = _find_glb_path(nested)
            if found is not None:
                return found
        return None
    if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
        for item in value:
            found = _find_glb_path(item)
            if found is not None:
                return found
    return None


def reconstruct_image(
    image_path: str | Path,
    output_path: str | Path,
    *,
    client: Client | None = None,
) -> Path:
    """Generate, validate, and copy a GLB from the hosted Stable Fast 3D Space."""
    image = validate_image_path(image_path)
    destination = Path(output_path).expanduser()
    if destination.suffix.lower() != ".glb":
        raise ValueError("output_path must end with .glb")
    destination.parent.mkdir(parents=True, exist_ok=True)

    try:
        space_client = client or Client(
            SPACE_ID,
            token=os.getenv("HF_TOKEN") or None,
            verbose=False,
            httpx_kwargs={"timeout": 60.0},
        )
        upload = handle_file(str(image.resolve()))

        # This initializes the Space's hidden preprocessing/button state.
        space_client.predict(upload, 0.85, api_name=PREPROCESS_API)

        result = space_client.predict(
            upload,
            0.85,
            "None",
            -1,
            1024,
            api_name=GENERATE_API,
        )
        generated = _find_glb_path(result)

        # Opaque images use the first click to remove their background. The
        # second click performs generation. Transparent images generate on the
        # first click, so no second request is made in that case.
        if generated is None:
            result = space_client.predict(
                upload,
                0.85,
                "None",
                -1,
                1024,
                api_name=GENERATE_API,
            )
            generated = _find_glb_path(result)
    except ReconstructionError:
        raise
    except Exception as exc:
        raise ReconstructionError(
            f"Stable Fast 3D request failed before a GLB was produced: {exc}"
        ) from exc

    if generated is None:
        raise ReconstructionError("Stable Fast 3D returned no GLB model file")

    validate_generated_model(generated)
    shutil.copy2(generated, destination)
    validate_generated_model(destination)
    return destination.resolve()
