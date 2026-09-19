"""Command-line mesh voxelization demo."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from voxel.voxelizer import voxelize_mesh


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Voxelize an OBJ, GLB, or glTF mesh")
    parser.add_argument("mesh_path", type=Path, help="Path to the mesh file")
    parser.add_argument(
        "--voxel-size",
        type=float,
        default=0.1,
        help="Voxel edge length in normalized units (default: 0.1)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("output_voxels.json"),
        help="Output JSON path (default: output_voxels.json)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        result = voxelize_mesh(args.mesh_path, voxel_size=args.voxel_size)
        args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    except (FileNotFoundError, OSError, TypeError, ValueError) as exc:
        print(f"Error: {exc}")
        return 1

    print(f"Dimensions: {result['dimensions']}")
    print(f"Voxel size: {result['voxel_size']}")
    print(f"Occupied voxels: {len(result['voxels'])}")
    print(f"Wrote: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
