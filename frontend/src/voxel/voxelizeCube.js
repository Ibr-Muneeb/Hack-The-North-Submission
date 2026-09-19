import { requirePositive, TOLERANCE, voxelizeImplicit } from "./voxelizeImplicit.js";

/**
 * Solid cube, centred in its grid.
 *
 *   size       edge length in world units
 *   voxelSize  world units per voxel edge
 *
 * When `size` is a whole multiple of `voxelSize` the cube fills its grid
 * exactly (size / voxelSize cells per side).
 */
export function voxelizeCube({ size = 8, voxelSize = 0.5 } = {}) {
  requirePositive("size", size);
  const half = size / 2 + TOLERANCE;

  return voxelizeImplicit({
    extent: [size, size, size],
    voxelSize,
    contains: (dx, dy, dz) => Math.abs(dx) <= half && Math.abs(dy) <= half && Math.abs(dz) <= half,
  });
}
