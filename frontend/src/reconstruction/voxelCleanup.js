/**
 * VOXEL CLEANUP
 * =============
 *
 * The silhouette-inflation heuristic in depthToVoxels.js can leave a bit of
 * salt-and-pepper noise at the boundary between columns of very different
 * radius. Rather than an elaborate mesh-processing framework, three small,
 * deterministic passes clean this up (per the milestone brief):
 *
 *   1. fill tiny holes    - an empty cell fully surrounded by occupied
 *                           neighbours is almost certainly a sampling gap,
 *                           not a real cavity
 *   2. remove isolated     - an occupied cell with hardly any occupied
 *      voxels               neighbours is almost certainly noise
 *   3. keep the largest    - anything not connected to the main mass is
 *      connected component  background that slipped through segmentation
 *
 * All three operate on an existing VoxelGrid (read-only in, a new VoxelGrid
 * out) and are 6-connectivity, single-pass or single-flood-fill - O(n),
 * deterministic, no iteration to convergence.
 */

import { VoxelGrid } from "../voxel/VoxelGrid.js";

const NEIGHBOR_OFFSETS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function countOccupiedNeighbors(grid, x, y, z) {
  let n = 0;
  for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
    if (grid.get(x + dx, y + dy, z + dz)) n++;
  }
  return n;
}

/** New grid with every empty cell that has all 6 neighbours occupied filled in. */
export function fillSmallHoles(grid) {
  const out = grid.clone();
  for (let y = 0; y < grid.height; y++) {
    for (let z = 0; z < grid.depth; z++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y, z)) continue;
        if (countOccupiedNeighbors(grid, x, y, z) === 6) out.set(x, y, z, true);
      }
    }
  }
  return out;
}

/**
 * New grid with occupied cells that have fewer than `minNeighbors` occupied
 * 6-neighbours cleared. Default 1: a fully isolated voxel (0 neighbours) is
 * removed; anything touching at least one other occupied voxel survives.
 */
export function removeIsolatedVoxels(grid, minNeighbors = 1) {
  const out = grid.clone();
  for (const { x, y, z } of grid.occupiedVoxels()) {
    if (countOccupiedNeighbors(grid, x, y, z) < minNeighbors) out.set(x, y, z, false);
  }
  return out;
}

/**
 * New grid keeping only the largest 6-connected component of occupied
 * voxels. Handles an empty grid gracefully (returns an equivalent empty
 * grid rather than throwing).
 */
export function keepLargestComponent3D(grid) {
  const { width, height, depth } = grid;
  const index = (x, y, z) => x + width * (z + depth * y);
  const n = width * height * depth;
  const labels = new Int32Array(n).fill(-1);
  let bestLabel = -1;
  let bestSize = 0;
  let nextLabel = 0;
  const stack = [];

  for (const start of grid.occupiedVoxels()) {
    const startIdx = index(start.x, start.y, start.z);
    if (labels[startIdx] !== -1) continue;
    const label = nextLabel++;
    let size = 0;
    stack.push(start);
    labels[startIdx] = label;
    while (stack.length > 0) {
      const { x, y, z } = stack.pop();
      size++;
      for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (!grid.get(nx, ny, nz)) continue;
        const nIdx = index(nx, ny, nz);
        if (labels[nIdx] === -1) {
          labels[nIdx] = label;
          stack.push({ x: nx, y: ny, z: nz });
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
    }
  }

  const out = new VoxelGrid(width, height, depth, { voxelSize: grid.voxelSize, origin: [...grid.origin] });
  if (bestLabel !== -1) {
    for (const { x, y, z } of grid.occupiedVoxels()) {
      if (labels[index(x, y, z)] === bestLabel) out.set(x, y, z, true);
    }
  }
  return out;
}

/**
 * The full cleanup pipeline used by reconstructFromImage: fill tiny holes,
 * drop isolated specks, then keep only the main connected mass. Returns a
 * new VoxelGrid; the input is never modified. An empty input grid is
 * returned as an equivalent empty grid rather than throwing.
 */
export function cleanupVoxelGrid(grid, options = {}) {
  const { minNeighbors = 1 } = options;
  if (grid.count === 0) return grid.clone();

  let result = fillSmallHoles(grid);
  result = removeIsolatedVoxels(result, minNeighbors);
  result = keepLargestComponent3D(result);
  return result;
}