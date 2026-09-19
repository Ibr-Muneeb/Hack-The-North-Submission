import { requirePositive, TOLERANCE, voxelizeImplicit } from "./voxelizeImplicit.js";

/**
 * Solid cylinder whose axis runs along Y (up), centred in its grid.
 *
 *   radius     world units, circular cross-section in the XZ plane
 *   height     world units along Y
 *   voxelSize  world units per voxel edge
 */
export function voxelizeCylinder({ radius = 4, height = 10, voxelSize = 0.5 } = {}) {
  requirePositive("radius", radius);
  requirePositive("height", height);
  const radiusLimit = radius * radius + TOLERANCE;
  const halfHeight = height / 2 + TOLERANCE;

  return voxelizeImplicit({
    extent: [2 * radius, height, 2 * radius],
    voxelSize,
    contains: (dx, dy, dz) => dx * dx + dz * dz <= radiusLimit && Math.abs(dy) <= halfHeight,
  });
}
