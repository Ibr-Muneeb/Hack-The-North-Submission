import { requirePositive, voxelizeImplicit } from "./voxelizeImplicit.js";

/**
 * A solid staircase that climbs toward +X.
 *
 *   steps      number of steps
 *   stepRun    world units each step extends along X
 *   stepRise   world units each step is taller than the previous one (Y)
 *   width      world units along Z (the stairs are centred on Z)
 *   voxelSize  world units per voxel edge
 *
 * Step k (0-based) is a solid block spanning x in [k*run, (k+1)*run) and
 * y in [0, (k+1)*rise), resting on the floor at y = 0. Unlike the sphere it
 * is NOT symmetric, so it makes the X / Y / Z orientation of the grid and of
 * the viewer easy to check: the tall end is at high X, the floor is y = 0.
 */
export function voxelizeStaircase({ steps = 6, stepRun = 1.5, stepRise = 1, width = 4, voxelSize = 0.5 } = {}) {
  if (!Number.isInteger(steps) || steps < 1) {
    throw new RangeError(`steps must be a positive integer, got ${steps}`);
  }
  requirePositive("stepRun", stepRun);
  requirePositive("stepRise", stepRise);
  requirePositive("width", width);

  const totalRun = steps * stepRun;
  const halfWidth = width / 2;

  return voxelizeImplicit({
    extent: [totalRun, steps * stepRise, width],
    voxelSize,
    contains: (dx, dy, dz, gridSize) => {
      // Measure X and Y from the grid's minimum corner; Z stays centred.
      const x = dx + gridSize[0] / 2;
      const y = dy + gridSize[1] / 2;
      if (x < 0 || x >= totalRun || Math.abs(dz) > halfWidth) return false;
      const step = Math.floor(x / stepRun);
      return y < (step + 1) * stepRise;
    },
  });
}
