import { VoxelGrid } from "./VoxelGrid.js";

function fail(message) {
  throw new TypeError(`Invalid voxel JSON: ${message}`);
}

/**
 * Convert parsed output from backend/voxelizer.py into Brickify's VoxelGrid.
 * Python dimensions [sizeX, sizeY, sizeZ] map to width, height, and depth.
 */
export function loadVoxelJson(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    fail("expected an object.");
  }

  if (!Number.isFinite(data.voxelSize) || data.voxelSize <= 0) {
    fail("voxelSize must be a positive finite number.");
  }

  if (
    !Array.isArray(data.dimensions) ||
    data.dimensions.length !== 3 ||
    !data.dimensions.every((value) => Number.isInteger(value) && value > 0)
  ) {
    fail("dimensions must be [sizeX, sizeY, sizeZ] containing positive integers.");
  }

  if (!Array.isArray(data.voxels)) {
    fail("voxels must be an array.");
  }

  const [width, height, depth] = data.dimensions;
  const grid = new VoxelGrid(width, height, depth, { voxelSize: data.voxelSize });

  data.voxels.forEach((coordinate, index) => {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length !== 3 ||
      !coordinate.every(Number.isInteger)
    ) {
      fail(`voxels[${index}] must be an integer [x, y, z] coordinate.`);
    }

    const [x, y, z] = coordinate;
    if (!grid.isInBounds(x, y, z)) {
      fail(
        `voxels[${index}] coordinate [${x}, ${y}, ${z}] is outside dimensions ` +
          `[${width}, ${height}, ${depth}].`,
      );
    }

    grid.set(x, y, z);
  });

  return grid;
}
