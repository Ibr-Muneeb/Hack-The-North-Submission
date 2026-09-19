"""Brickify V2 API."""

from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from voxel.voxelizer import SUPPORTED_EXTENSIONS, voxelize_mesh


app = FastAPI(title="Brickify API")


@app.get("/api/health")
def health() -> dict[str, str]:
    """Confirm that the API is running."""
    return {"status": "ok"}


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
