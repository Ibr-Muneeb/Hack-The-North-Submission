"""Command-line entry point for Brickify mesh voxelization."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from voxelizer import voxelize_mesh


OUTPUT_PATH = Path(__file__).resolve().parent / "output_voxels.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Voxelize a mesh for Brickify.")
    parser.add_argument("mesh_path", help="Path to an .obj, .glb, or .gltf mesh")
    parser.add_argument(
        "--voxel-size",
        type=float,
        default=0.2,
        help="Voxel edge length in mesh units (default: 0.2)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        result = voxelize_mesh(args.mesh_path, args.voxel_size)
        OUTPUT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    except (FileNotFoundError, TypeError, ValueError, OSError) as exc:
        print(f"Error: {exc}")
        return 1

    source = result["source"]
    print(f"Loaded: {source['fileName']}")
    print(f"Mesh: {source['vertexCount']} vertices, {source['faceCount']} faces")
    print(f"Voxel size: {result['voxelSize']}")
    print(f"Dimensions (X, Y, Z): {result['dimensions']}")
    print(f"Occupied voxels: {len(result['voxels'])}")
    print(f"Coordinate convention: {result['coordinateConvention']}")
    print(f"Wrote: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
