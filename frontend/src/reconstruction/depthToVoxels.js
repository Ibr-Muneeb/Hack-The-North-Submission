/**
 * DEPTH/MASK -> VOXELGRID
 * =======================
 *
 * The one place the reconstruction layer touches the voxel layer: turns a
 * 2D silhouette mask plus its per-pixel depth field (see depthField.js) into
 * an ordinary `VoxelGrid` from src/voxel - the same class every other part
 * of Brickify already knows how to render and decompose. Nothing downstream
 * needs to know the grid came from a photo instead of `voxelizeSphere`.
 *
 * ---- Coordinate mapping --------------------------------------------------
 *   image X (column)        -> grid X
 *   image Y (row, top = 0)  -> grid Y, FLIPPED (row 0 is the top of the
 *                              photo, but grid y = 0 is the floor - see
 *                              VoxelGrid's header)
 *   depth field radius      -> grid Z, symmetric around the mid-plane
 *
 * The mask/radius/offset fields are first resampled (box sampling, see
 * reconstructionUtils) from the processed image's resolution down to the
 * target voxel resolution, so the grid stays within DEFAULT_MAX_VOXEL_DIMENSION
 * regardless of how large the source photo was.
 *
 * Pure JavaScript: depends only on src/voxel (allowed) and its own siblings.
 */

import { VoxelGrid } from "../voxel/VoxelGrid.js";
import { DEFAULT_MAX_VOXEL_DIMENSION, DEFAULT_RECONSTRUCTION_VOXEL_SIZE, ReconstructionError } from "./reconstructionTypes.js";
import { computeScaledDimensions, resizeField, resizeMask } from "./reconstructionUtils.js";

/** How thick the volume is, relative to the silhouette's shorter side. Tuned for a "plausible" object, not a flat slab. */
const DEFAULT_DEPTH_SCALE = 0.55;
/** Minimum half-thickness of any occupied column, in voxels - keeps thin silhouette edges from vanishing to 0 depth. */
const MIN_RADIUS_VOXELS = 0.6;
/** How much the brightness-driven `offset` may shift a column's centre, as a fraction of the max radius. */
const OFFSET_SCALE = 0.6;

/**
 * @param {object} input
 * @param {Uint8Array} input.mask        width*height, 1 = foreground
 * @param {Float32Array} input.radius    width*height, [0,1] bulge amount (see depthField.js)
 * @param {Float32Array} input.offset    width*height, [-1,1] brightness-driven centre shift
 * @param {number} input.width
 * @param {number} input.height
 * @param {object} [options]
 * @param {number} [options.maxDimension=DEFAULT_MAX_VOXEL_DIMENSION]  longest side of the output grid, in voxels
 * @param {number} [options.voxelSize=DEFAULT_RECONSTRUCTION_VOXEL_SIZE]
 * @param {number} [options.depthScale=DEFAULT_DEPTH_SCALE]
 * @returns {import("../voxel/VoxelGrid.js").VoxelGrid}
 */
export function buildVoxelGridFromSilhouette(input, options = {}) {
  const { mask, radius, offset, width, height } = input;
  if (!mask || !radius || !offset || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new ReconstructionError("empty-result", "buildVoxelGridFromSilhouette received malformed input.");
  }

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_VOXEL_DIMENSION;
  const voxelSize = options.voxelSize ?? DEFAULT_RECONSTRUCTION_VOXEL_SIZE;
  const depthScale = options.depthScale ?? DEFAULT_DEPTH_SCALE;

  const { width: gridWidth, height: gridHeight } = computeScaledDimensions(width, height, maxDimension);
  const rMask = resizeMask(mask, width, height, gridWidth, gridHeight, 0.4);
  const rRadius = resizeField(radius, width, height, gridWidth, gridHeight);
  const rOffset = resizeField(offset, width, height, gridWidth, gridHeight);

  const shortSide = Math.min(gridWidth, gridHeight);
  const gridDepth = Math.max(2, Math.min(maxDimension, Math.round(shortSide * depthScale) + 2));
  const maxRadiusVoxels = gridDepth / 2;

  const grid = new VoxelGrid(gridWidth, gridHeight, gridDepth, { voxelSize, origin: [0, 0, 0] });

  for (let gy = 0; gy < gridHeight; gy++) {
    const voxelY = gridHeight - 1 - gy; // image row 0 (top) -> highest voxel row
    for (let gx = 0; gx < gridWidth; gx++) {
      const idx = gy * gridWidth + gx;
      if (!rMask[idx]) continue;

      const radiusVoxels = Math.max(MIN_RADIUS_VOXELS, rRadius[idx] * maxRadiusVoxels);
      const center = gridDepth / 2 + rOffset[idx] * maxRadiusVoxels * OFFSET_SCALE;

      let zMin = Math.floor(center - radiusVoxels);
      let zMax = Math.ceil(center + radiusVoxels) - 1;
      zMin = Math.max(0, Math.min(gridDepth - 1, zMin));
      zMax = Math.max(0, Math.min(gridDepth - 1, zMax));
      if (zMax < zMin) zMax = zMin;

      for (let z = zMin; z <= zMax; z++) grid.set(gx, voxelY, z, true);
    }
  }

  return grid;
}