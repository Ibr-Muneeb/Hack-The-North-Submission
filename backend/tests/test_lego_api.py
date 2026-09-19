from fastapi.testclient import TestClient

from app import app


client = TestClient(app)


def test_lego_demo_uses_real_decomposition_pipeline() -> None:
    response = client.get("/api/lego/demo")

    assert response.status_code == 200
    result = response.json()
    assert result["model_name"] == "Brickify House"
    assert result["dimensions"] == [10, 7, 8]
    assert result["voxel_size"] == 1.0
    assert result["voxel_count"] == result["covered_voxels"]
    assert result["voxel_count"] > result["brick_count"] > 1
    assert len(result["bricks"]) == result["brick_count"]
    assert {brick["orientation"] for brick in result["bricks"]} <= {"XZ", "ZX"}


def test_lego_decompose_endpoint_accepts_voxel_grid() -> None:
    voxel_grid = {
        "dimensions": [2, 1, 4],
        "voxel_size": 0.2,
        "voxels": [[x, 0, z] for z in range(4) for x in range(2)],
    }

    response = client.post("/api/lego/decompose", json=voxel_grid)

    assert response.status_code == 200
    result = response.json()
    assert result["voxel_size"] == 0.2
    assert result["voxel_count"] == 8
    assert result["brick_count"] == 1
    assert result["bricks"][0] == {
        "type": "2x4",
        "width": 2,
        "length": 4,
        "position": [0, 0, 0],
        "orientation": "XZ",
    }


def test_lego_decompose_endpoint_rejects_invalid_grid() -> None:
    response = client.post(
        "/api/lego/decompose",
        json={"dimensions": [1, 1, 1], "voxels": [[1, 0, 0]]},
    )

    assert response.status_code == 400
    assert "outside dimensions" in response.json()["detail"]
