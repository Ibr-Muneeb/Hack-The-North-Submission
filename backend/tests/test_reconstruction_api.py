from pathlib import Path

import trimesh
from fastapi.testclient import TestClient

import app as app_module


client = TestClient(app_module.app)


def test_reconstruct_endpoint_rejects_unsupported_image() -> None:
    response = client.post(
        "/api/reconstruct",
        files={"image": ("image.gif", b"GIF89a", "image/gif")},
    )

    assert response.status_code == 400
    assert "Unsupported image format" in response.json()["detail"]


def test_reconstruct_endpoint_with_mocked_hosted_service(
    monkeypatch,
) -> None:
    def fake_reconstruct(image_path: Path, output_path: Path) -> Path:
        assert image_path.suffix == ".png"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(trimesh.creation.box().export(file_type="glb"))
        return output_path.resolve()

    monkeypatch.setattr(app_module, "reconstruct_image", fake_reconstruct)
    # The endpoint reports paths relative to backend/app.py. Keep the mocked
    # output under that tree so the public response follows the real contract.
    monkeypatch.setattr(
        app_module,
        "GENERATED_MODELS_DIR",
        Path(app_module.__file__).resolve().parent / "generated" / "test-models",
    )

    response = client.post(
        "/api/reconstruct",
        files={"image": ("object.png", b"non-empty test image", "image/png")},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["success"] is True
    assert result["format"] == "glb"
    assert result["vertex_count"] == 8
    assert result["face_count"] == 12

    generated_path = Path(app_module.__file__).resolve().parent / result["model_path"]
    generated_path.unlink()
    generated_path.parent.rmdir()
