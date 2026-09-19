/**
 * Validation for the decomposition layer. Plain data in, plain data out -
 * same philosophy as src/lego/modelValidation.js.
 *
 * Two jobs:
 *   1. reject obviously bad INPUT with a clear error instead of producing
 *      nonsense geometry (a decomposer that silently accepts `null` is worse
 *      than one that throws),
 *   2. offer cheap after-the-fact checks (overlap, containment) that the tests
 *      and the demo can use to prove a result is well formed.
 */

import { VoxelGrid } from "../voxel/VoxelGrid.js";
import { brickCells, getPart, isValidRotation } from "./brickPlacement.js";

/** Throws TypeError/RangeError if `grid` isn't usable as decomposition input. */
export function validateVoxelGridInput(grid) {
  if (!(grid instanceof VoxelGrid)) {
    throw new TypeError(`decomposeVoxelGrid expects a VoxelGrid, got ${grid === null ? "null" : typeof grid}`);
  }
  if (!Number.isFinite(grid.voxelSize) || grid.voxelSize <= 0) {
    throw new RangeError(`VoxelGrid voxelSize must be a positive finite number, got ${grid.voxelSize}`);
  }
  return grid;
}

/** Throws RangeError/TypeError for out-of-range options. */
export function validateDecompositionOptions(options = {}) {
  const { fillThreshold, minSupportRatio, maxOutsideRatio, maxBricks, maxUncoveredReported, color } = options;

  if (fillThreshold !== undefined && (!Number.isFinite(fillThreshold) || fillThreshold <= 0 || fillThreshold > 1)) {
    throw new RangeError(`fillThreshold must be in (0, 1], got ${fillThreshold}`);
  }
  if (minSupportRatio !== undefined && (!Number.isFinite(minSupportRatio) || minSupportRatio < 0 || minSupportRatio > 1)) {
    throw new RangeError(`minSupportRatio must be in [0, 1], got ${minSupportRatio}`);
  }
  if (maxOutsideRatio !== undefined && (!Number.isFinite(maxOutsideRatio) || maxOutsideRatio < 0 || maxOutsideRatio >= 1)) {
    throw new RangeError(`maxOutsideRatio must be in [0, 1), got ${maxOutsideRatio}`);
  }
  if (maxBricks !== undefined && (!Number.isInteger(maxBricks) || maxBricks <= 0)) {
    throw new RangeError(`maxBricks must be a positive integer, got ${maxBricks}`);
  }
  if (maxUncoveredReported !== undefined && (!Number.isInteger(maxUncoveredReported) || maxUncoveredReported < 0)) {
    throw new RangeError(`maxUncoveredReported must be a non-negative integer, got ${maxUncoveredReported}`);
  }
  if (color !== undefined && (typeof color !== "string" || color.trim() === "")) {
    throw new TypeError(`color must be a non-empty string, got ${JSON.stringify(color)}`);
  }
  return options;
}

/**
 * Pairs of brick indices that share at least one LEGO cell.
 * @returns {Array<{a: number, b: number, cell: {x,y,z}}>} empty when valid
 */
export function findOverlaps(bricks) {
  const owner = new Map();
  const overlaps = [];

  bricks.forEach((brick, index) => {
    const part = getPart(brick.partId);
    if (!part) return;
    for (const cell of brickCells(part, brick.position, brick.rotation ?? 0)) {
      const key = `${cell.x},${cell.y},${cell.z}`;
      const previous = owner.get(key);
      if (previous === undefined) {
        owner.set(key, index);
      } else {
        overlaps.push({ a: previous, b: index, cell });
      }
    }
  });

  return overlaps;
}

/**
 * Structural check of a decomposition result: every brick is a supported part,
 * has a legal rotation, lies inside the target occupancy and overlaps nothing.
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateDecompositionResult(result) {
  const errors = [];
  const bricks = result?.bricks ?? [];

  bricks.forEach((brick, index) => {
    const part = getPart(brick.partId);
    if (!part) {
      errors.push(`bricks[${index}]: unsupported partId ${JSON.stringify(brick.partId)}`);
      return;
    }
    if (!isValidRotation(brick.rotation ?? 0)) {
      errors.push(`bricks[${index}]: rotation must be 0/90/180/270, got ${brick.rotation}`);
      return;
    }
    if (result.target) {
      for (const { x, y, z } of brickCells(part, brick.position, brick.rotation ?? 0)) {
        if (!result.target.get(x, y, z)) {
          errors.push(`bricks[${index}]: cell (${x}, ${y}, ${z}) is outside the target shape`);
          break;
        }
      }
    }
  });

  for (const { a, b, cell } of findOverlaps(bricks)) {
    errors.push(`bricks[${a}] and bricks[${b}] overlap at (${cell.x}, ${cell.y}, ${cell.z})`);
  }

  return { valid: errors.length === 0, errors };
}
