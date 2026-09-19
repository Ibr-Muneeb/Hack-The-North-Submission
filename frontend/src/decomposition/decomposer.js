/**
 * VOXEL -> LEGO DECOMPOSITION
 * ===========================
 *
 *   VoxelGrid -> LegoOccupancy (target) -> greedy brick placement -> LEGO model
 *
 * Deterministic bottom-up greedy. No randomness, no optimizer, no ML: running
 * the same input twice produces byte-identical output.
 *
 * ---- Algorithm ----------------------------------------------------------
 *
 * The only part is 3001 (2x4x3 plates), so the model is built in COURSES of
 * 3 plates starting at y = 0: y = 0, 3, 6, ... Any leftover height at the top
 * that is shorter than a brick cannot be represented by 3001 alone and is
 * reported as uncovered rather than faked with a misplaced brick.
 *
 *   for each course y (bottom to top):
 *     repeat:
 *       scan every anchor (z ascending, then x ascending)
 *         for each distinct rotation (0, then 90)
 *           evaluate canPlaceBrick(...)
 *       keep the highest-scoring valid candidate
 *         (ties broken by scan order: first one found wins)
 *       place it and mark its cells
 *     until no valid candidate remains
 *
 * The scan order (y, then z, then x, then rotation) is the same order the
 * occupancy grids iterate in, and ties are always broken toward the first
 * candidate found, which is what makes the output reproducible.
 *
 * Scoring lives in brickPlacement.js: coverage first, then support underneath,
 * then contact with neighbouring bricks.
 *
 * ---- Guarantees ---------------------------------------------------------
 *
 *   - the input VoxelGrid is never modified (read-only throughout)
 *   - a brick is only placed where ALL of its cells are inside the target
 *     shape, so the model never bulges outside the voxel geometry
 *   - bricks never overlap (checked against the `placed` occupancy grid)
 *   - bricks above the ground course always have support beneath them
 *
 * The flip side of "never bulge outside the target": features thinner than a
 * brick are simply left out, so coverage is < 100% for anything that is not
 * a multiple of 2x4x3 - which is exactly what the coverage statistics report.
 */

import { BRICK_PLATES } from "../lego/coordinates.js";
import {
  canPlaceBrick,
  DISTINCT_ROTATIONS,
  markPlaced,
  MIN_SUPPORT_RATIO,
  PART_3001,
  toModelBrick,
} from "./brickPlacement.js";
import { validateDecompositionOptions, validateVoxelGridInput } from "./decompositionValidation.js";
import { voxelGridToLegoOccupancy, worldToLegoCell } from "./voxelToLegoGrid.js";

/** Colour is not part of the decomposition problem this milestone (see README). */
export const DEFAULT_BRICK_COLOR = "red";

/** Safety valve so a pathological input can't spin forever. */
export const DEFAULT_MAX_BRICKS = 20000;

/** Cap on the reported uncovered voxel list (the count is always exact). */
export const DEFAULT_MAX_UNCOVERED_REPORTED = 10000;

/**
 * Place bricks into a target LegoOccupancy. Exposed separately from
 * `decomposeVoxelGrid` so placement can be tested without a VoxelGrid.
 *
 * @returns {{bricks: Array, placed: import("./LegoOccupancy.js").LegoOccupancy, truncated: boolean}}
 */
export function decomposeOccupancy(target, options = {}) {
  const {
    color = DEFAULT_BRICK_COLOR,
    maxBricks = DEFAULT_MAX_BRICKS,
    minSupportRatio = MIN_SUPPORT_RATIO,
    requireSupport = true,
    rotations = DISTINCT_ROTATIONS,
  } = options;

  const part = PART_3001;
  const placed = target.createEmptyLike();
  const bricks = [];
  let truncated = false;

  for (let y = 0; y + part.height <= target.sizeY; y += BRICK_PLATES) {
    // Skip empty courses cheaply.
    if (target.countInLayer(y) === 0) continue;

    for (;;) {
      let best = null;

      for (let z = 0; z < target.sizeZ; z++) {
        for (let x = 0; x < target.sizeX; x++) {
          // Fast reject: the anchor cell itself must be usable target space.
          if (!target.get(x, y, z) || placed.get(x, y, z)) continue;

          for (const rotation of rotations) {
            const placement = { partId: part.partId, position: { x, y, z }, rotation };
            const result = canPlaceBrick({ target, placed }, placement, {
              requireSupport,
              minSupportRatio,
            });
            // Strictly greater: ties keep the earlier (scan-order) candidate.
            if (result.ok && (best === null || result.score > best.result.score)) {
              best = { placement, result };
            }
          }
        }
      }

      if (!best) break;

      markPlaced(placed, best.result.cells);
      bricks.push(toModelBrick(part, best.placement.position, best.placement.rotation, color));

      if (bricks.length >= maxBricks) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }

  return { bricks, placed, truncated };
}

/**
 * Full pipeline: VoxelGrid -> LEGO model + statistics.
 *
 * The returned `model` is directly usable by the existing <LEGOModel> renderer.
 *
 * Coverage is measured in VOXELS, not in LEGO cells, so it answers the
 * question we actually care about: "how much of the target shape did the LEGO
 * model reproduce?" A voxel counts as covered when its CENTRE falls inside a
 * LEGO cell occupied by a placed brick.
 *
 * @param {import("../voxel/VoxelGrid.js").VoxelGrid} grid  read only, never modified
 * @param {object} [options]
 * @param {string}  [options.color="red"]
 * @param {number}  [options.fillThreshold=0.5]   voxel->LEGO cell threshold
 * @param {number}  [options.minSupportRatio=0.25]
 * @param {boolean} [options.requireSupport=true]
 * @param {number}  [options.maxBricks=20000]
 * @param {number}  [options.maxUncoveredReported=10000]
 */
export function decomposeVoxelGrid(grid, options = {}) {
  validateVoxelGridInput(grid);
  validateDecompositionOptions(options);

  const {
    fillThreshold,
    maxUncoveredReported = DEFAULT_MAX_UNCOVERED_REPORTED,
  } = options;

  const warnings = [];
  const { occupancy: target, scale, warnings: conversionWarnings } = voxelGridToLegoOccupancy(
    grid,
    fillThreshold === undefined ? {} : { fillThreshold },
  );
  warnings.push(...conversionWarnings);

  const { bricks, placed, truncated } = decomposeOccupancy(target, options);
  if (truncated) {
    warnings.push(`Stopped after ${bricks.length} bricks (maxBricks reached); the model is incomplete.`);
  }
  if (target.sizeY < BRICK_PLATES) {
    warnings.push(
      `The shape is only ${target.sizeY} plate(s) tall; a 3001 brick is ${BRICK_PLATES} plates, so nothing fits.`,
    );
  }

  // ---- Coverage, measured against the untouched voxel grid ----
  const origin = target.origin;
  const uncoveredVoxels = [];
  let coveredVolume = 0;
  let uncoveredCount = 0;

  for (const voxel of grid.occupiedVoxels()) {
    const cell = worldToLegoCell(grid.voxelCenter(voxel.x, voxel.y, voxel.z), origin);
    if (placed.get(cell.x, cell.y, cell.z)) {
      coveredVolume++;
    } else {
      uncoveredCount++;
      if (uncoveredVoxels.length < maxUncoveredReported) uncoveredVoxels.push(voxel);
    }
  }

  const targetVolume = grid.count;
  const coverageRatio = targetVolume === 0 ? 1 : coveredVolume / targetVolume;

  return {
    // --- the LEGO model, ready for the existing renderer ---
    model: { bricks },
    bricks,

    // --- coverage against the original voxel geometry (voxel counts) ---
    targetVolume,
    coveredVolume,
    coverageRatio,
    uncoveredVoxels,
    uncoveredVoxelCount: uncoveredCount,
    uncoveredTruncated: uncoveredCount > uncoveredVoxels.length,

    // --- the intermediate representation and how we got there ---
    target,
    placed,
    scale,
    legoGrid: { sizeX: target.sizeX, sizeY: target.sizeY, sizeZ: target.sizeZ, origin: [...origin] },
    stats: {
      brickCount: bricks.length,
      targetCells: target.count,
      filledCells: placed.count,
      cellCoverageRatio: target.count === 0 ? 1 : placed.count / target.count,
      courses: Math.floor(target.sizeY / BRICK_PLATES),
    },
    warnings,
  };
}
