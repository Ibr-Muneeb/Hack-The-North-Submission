from pathlib import Path

from fastapi.testclient import TestClient

from app import app


client = TestClient(app)
CUBE_PATH = Path(__file__).resolve().parents[1] / "test_models" / "cube.obj"


def test_voxelize_endpoint() -> None:
    with CUBE_PATH.open("rb") as mesh_file:
        response = client.post(
            "/api/voxelize",
            files={"mesh": ("cube.obj", mesh_file, "text/plain")},
            data={"voxel_size": "0.2"},
        )

    assert response.status_code == 200
    result = response.json()
    assert result["dimensions"] == [5, 5, 5]
    assert result["voxel_size"] == 0.2
    assert len(result["voxels"]) == 125


def test_voxelize_endpoint_rejects_unsupported_file() -> None:
    response = client.post(
        "/api/voxelize",
        files={"mesh": ("mesh.stl", b"solid empty\nendsolid", "model/stl")},
        data={"voxel_size": "0.1"},
    )

    assert response.status_code == 400
    assert "Unsupported mesh format" in response.json()["detail"]
