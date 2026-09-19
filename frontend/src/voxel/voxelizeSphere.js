import { requirePositive, TOLERANCE, voxelizeImplicit } from "./voxelizeImplicit.js";

/**
 * Solid sphere, centred in its grid.
 *
 *   radius     world units
 *   voxelSize  world units per voxel edge
 *
 * The grid is ceil(2 * radius / voxelSize) cells on every axis; a voxel is
 * occupied when its centre is within `radius` of the grid centre.
 */
export function voxelizeSphere({ radius = 5, voxelSize = 0.5 } = {}) {
  requirePositive("radius", radius);
  const limit = radius * radius + TOLERANCE;

  return voxelizeImplicit({
    extent: [2 * radius, 2 * radius, 2 * radius],
    voxelSize,
    contains: (dx, dy, dz) => dx * dx + dy * dy + dz * dz <= limit,
  });
}
