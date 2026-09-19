"""Brickify V2 API."""

from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from lego.demos import get_demo, list_demos
from lego.model import build_lego_model
from reconstruction.stable_fast_3d import (
    ReconstructionError,
    SUPPORTED_IMAGE_EXTENSIONS,
    reconstruct_image,
    validate_generated_model,
)
from voxel.voxelizer import SUPPORTED_EXTENSIONS, voxelize_mesh


app = FastAPI(title="Brickify API")
GENERATED_MODELS_DIR = Path(__file__).resolve().parent / "generated" / "models"


@app.get("/api/health")
def health() -> dict[str, str]:
    """Confirm that the API is running."""
    return {"status": "ok"}


@app.get("/api/lego/demos")
def lego_demos() -> dict:
    """List deterministic models available to the frontend demo selector."""
    return {"models": list_demos()}


@app.get("/api/lego/demo")
def lego_demo(model: str = "house") -> dict:
    """Return a backend-generated demo processed by the real LEGO engine."""
    try:
        demo = get_demo(model)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return build_lego_model(
        demo["grid_factory"](),
        model_id=demo["model_id"],
        model_name=demo["model_name"],
        layer_colors=demo["layer_colors"],
    )


@app.post("/api/lego/decompose")
def decompose_voxels(voxel_grid: dict = Body(...)) -> dict:
    """Decompose a serialized Brickify voxel grid into LEGO placements."""
    try:
        return build_lego_model(voxel_grid, model_name="Custom voxel model")
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/voxelize")
async def voxelize_uploaded_mesh(
    mesh: UploadFile = File(...),
    voxel_size: float = Form(0.1, gt=0),
) -> dict:
    """Voxelize an uploaded OBJ, GLB, or glTF mesh."""
    filename = Path(mesh.filename or "")
    suffix = filename.suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        formats = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise HTTPException(status_code=400, detail=f"Unsupported mesh format; use {formats}")

    contents = await mesh.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded mesh is empty")

    temporary_path: Path | None = None
    try:
        with NamedTemporaryFile(suffix=suffix, delete=False) as temporary_file:
            temporary_file.write(contents)
            temporary_path = Path(temporary_file.name)
        return voxelize_mesh(temporary_path, voxel_size=voxel_size)
    except (OSError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


@app.post("/api/reconstruct")
async def reconstruct_uploaded_image(image: UploadFile = File(...)) -> dict:
    """Generate a GLB from an uploaded PNG or JPEG using hosted Stable Fast 3D."""
    filename = Path(image.filename or "")
    suffix = filename.suffix.lower()
    if suffix not in SUPPORTED_IMAGE_EXTENSIONS:
        formats = ", ".join(sorted(SUPPORTED_IMAGE_EXTENSIONS))
        raise HTTPException(status_code=400, detail=f"Unsupported image format; use {formats}")

    contents = await image.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")

    temporary_path: Path | None = None
    try:
        with NamedTemporaryFile(suffix=suffix, delete=False) as temporary_file:
            temporary_file.write(contents)
            temporary_path = Path(temporary_file.name)

        output_path = GENERATED_MODELS_DIR / f"{uuid4().hex}.glb"
        generated_path = await run_in_threadpool(
            reconstruct_image,
            temporary_path,
            output_path,
        )
        metadata = validate_generated_model(generated_path)
        relative_path = generated_path.relative_to(Path(__file__).resolve().parent)
        return {
            "success": True,
            "model_path": str(relative_path),
            "format": "glb",
            **metadata,
        }
    except (FileNotFoundError, OSError, ReconstructionError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
