import { VoxelGrid } from "./VoxelGrid.js";

/**
 * Shared engine behind every procedural shape (sphere, cube, ...).
 *
 * A shape is described by two things only:
 *   - `extent`   its bounding box in world units [ex, ey, ez]
 *   - `contains` a predicate: "is this point inside the shape?"
 *
 * The grid is sized to cover the extent (rounding UP to whole voxels) and
 * each voxel is tested ONCE, at its centre ("centre sampling"): a voxel is
 * occupied iff its centre is inside the shape. Consequences worth knowing:
 *   - the result is deterministic and never depends on floating point noise
 *     for symmetric shapes (see the note on offsets below),
 *   - voxels the shape only clips at a corner are dropped, so the count is
 *     an approximation of volume / voxelSize^3,
 *   - features thinner than one voxel can disappear.
 *
 * `contains(dx, dy, dz, gridSize)` receives, in WORLD units:
 *   dx, dy, dz  the voxel centre's offset from the CENTRE of the grid
 *   gridSize    [x, y, z] world size of the whole grid, so a shape that wants
 *               coordinates from the grid's minimum corner can use
 *               `dx + gridSize[0] / 2`.
 *
 * The offsets are computed as ((i + 0.5) - n / 2) * voxelSize. The part in
 * brackets is exact in floating point, so offsets on opposite sides of the
 * centre are exact mirror images: symmetric shapes come out symmetric even
 * for awkward voxel sizes like 0.1.
 */

const EPSILON = 1e-9;

export function voxelizeImplicit({ extent, voxelSize, contains, origin }) {
  if (!Array.isArray(extent) || extent.length !== 3 || !extent.every((e) => Number.isFinite(e) && e > 0)) {
    throw new RangeError(`extent must be [x, y, z] of positive numbers, got ${JSON.stringify(extent)}`);
  }
  if (!Number.isFinite(voxelSize) || voxelSize <= 0) {
    throw new RangeError(`voxelSize must be a positive finite number, got ${voxelSize}`);
  }
  if (typeof contains !== "function") {
    throw new TypeError("contains must be a function (dx, dy, dz, gridSize) => boolean");
  }

  // Plain ceil() can overshoot: 2.1 / 0.3 is 7.000000000000001, which would give 8 cells.
  const [nx, ny, nz] = extent.map((e) => Math.max(1, Math.ceil(e / voxelSize - EPSILON)));
  const grid = new VoxelGrid(nx, ny, nz, { voxelSize, origin });
  const gridSize = [nx * voxelSize, ny * voxelSize, nz * voxelSize];

  for (let y = 0; y < ny; y++) {
    const dy = (y + 0.5 - ny / 2) * voxelSize;
    for (let z = 0; z < nz; z++) {
      const dz = (z + 0.5 - nz / 2) * voxelSize;
      for (let x = 0; x < nx; x++) {
        const dx = (x + 0.5 - nx / 2) * voxelSize;
        if (contains(dx, dy, dz, gridSize)) grid.set(x, y, z, true);
      }
    }
  }
  return grid;
}

/** Shared argument check for the shape functions. */
export function requirePositive(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number, got ${value}`);
  }
}

export const TOLERANCE = EPSILON;
