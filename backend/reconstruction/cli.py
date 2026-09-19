"""Command-line client for hosted Stable Fast 3D reconstruction."""

from __future__ import annotations

import argparse
import time
from pathlib import Path

from reconstruction.stable_fast_3d import reconstruct_image, validate_generated_model


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a GLB with Stable Fast 3D")
    parser.add_argument("image_path", type=Path, help="Local PNG or JPEG image")
    parser.add_argument("--output", type=Path, required=True, help="Destination .glb path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    print("Submitting image...")
    print("Waiting for Stable Fast 3D...")
    started = time.perf_counter()

    try:
        output = reconstruct_image(args.image_path, args.output)
        metadata = validate_generated_model(output)
    except (FileNotFoundError, RuntimeError, TypeError, ValueError) as exc:
        print(f"Error: {exc}")
        return 1

    elapsed = time.perf_counter() - started
    print("3D model received.")
    print(f"Saved model: {output}")
    print(f"Reconstruction time: {elapsed:.1f} seconds")
    print(f"GLB size: {metadata['size_bytes']} bytes")
    print(f"Vertices: {metadata['vertex_count']}")
    print(f"Faces: {metadata['face_count']}")
    print(f"Bounds: {metadata['bounds']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
