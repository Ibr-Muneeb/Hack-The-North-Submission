/**
 * VOXEL -> LEGO DECOMPOSITION
 * ===========================
 *
 *   VoxelGrid -> LegoOccupancy (target) -> greedy brick placement -> LEGO model
 *
 * Deterministic bottom-up greedy. No randomness, no time, no global search:
 * running the same input twice produces byte-identical output.
 *
 * ---- Algorithm (Milestone 6) --------------------------------------------
 *
 * Bricks are 3 plates tall, so the model is built in COURSES starting at
 * y = 0: y = 0, 3, 6, ... Leftover height at the top that is shorter than a
 * brick cannot be represented by the catalog (no plates or tiles yet) and is
 * reported as uncovered rather than faked.
 *
 *   for each course y (bottom to top):
 *     for each anchor cell (z ascending, then x ascending):
 *       skip it if it is already filled, or is not target geometry
 *       for each catalog shape (largest first) and each distinct rotation:
 *         measure the placement (brickPlacement.js)
 *         score it (candidateScoring.js)
 *       place the best candidate anchored at this cell
 *
 * The anchor is the brick's MIN CORNER, so scanning z then x gives each cell
 * its turn to start a brick, and cells already covered are skipped. This is
 * one pass per course, rather than Milestone 5's "rescan the whole course
 * after every placement": with four brick sizes the rescan version evaluates
 * millions of candidates on a sphere, and it changes almost nothing, because
 * the winner at an anchor rarely depends on bricks placed later in the same
 * course.
 *
 * Milestone 5 could only place 2x4s, so it left a hole wherever one did not
 * fit. With 2x2, 1x2 and 1x1 in the catalog the scan can follow a curved or
 * stepped boundary: big bricks win in the interior because they cover more
 * cells, and near the surface the false-positive penalty lets the smaller
 * brick that fits tightly win instead.
 *
 * ---- Guarantees ---------------------------------------------------------
 *
 *   - the input VoxelGrid is never modified (read-only throughout)
 *   - bricks never overlap (checked against the `placed` occupancy grid)
 *   - bricks above the ground course always have footing beneath them
 *   - how far a brick may stick out of the target is bounded by
 *     `maxOutsideRatio` and counted in the statistics; it is never hidden
 */

import { BRICK_PLATES } from "../lego/coordinates.js";
import { BRICK_CATALOG, candidateShapes, getBrickDefinition } from "./brickCatalog.js";
import {
  canPlaceBrick,
  DEFAULT_MAX_OUTSIDE_RATIO,
  markPlaced,
  MIN_SUPPORT_RATIO,
  toModelBrick,
} from "./brickPlacement.js";
import { isBetterCandidate, scoreCandidate } from "./candidateScoring.js";
import { validateDecompositionOptions, validateVoxelGridInput } from "./decompositionValidation.js";
import { voxelGridToLegoOccupancy, worldToLegoCell } from "./voxelToLegoGrid.js";

/** Colour is not part of the decomposition problem yet (see README). */
export const DEFAULT_BRICK_COLOR = "red";

/** Safety valve so a pathological input can't spin forever. */
export const DEFAULT_MAX_BRICKS = 20000;

/** Cap on the reported uncovered voxel list (the count is always exact). */
export const DEFAULT_MAX_UNCOVERED_REPORTED = 10000;

/**
 * How much of a brick may fall outside the target shape by default.
 *
 * 0 keeps Milestone 5's strict containment: the LEGO model never bulges past
 * the voxel shape. It is the default because an honest silhouette matters
 * more for the demo than the last few percent of coverage, and with 1x1
 * bricks available strict containment already gets most of the way. Raise it
 * (e.g. 0.25) to let bricks round outward over a curved surface; every stray
 * cell is penalised by the scoring function and counted in the statistics.
 */
export const DEFAULT_DECOMPOSE_MAX_OUTSIDE_RATIO = DEFAULT_MAX_OUTSIDE_RATIO;

/** Candidate shapes, computed once: [{ brick, rotation }, ...] largest first. */
const SHAPES = candidateShapes();

/**
 * Place bricks into a target LegoOccupancy. Exposed separately from
 * `decomposeVoxelGrid` so placement can be tested without a VoxelGrid.
 *
 * @returns {{bricks: Array, placed: object, truncated: boolean, stats: object}}
 */
export function decomposeOccupancy(target, options = {}) {
  const {
    color = DEFAULT_BRICK_COLOR,
    maxBricks = DEFAULT_MAX_BRICKS,
    minSupportRatio = MIN_SUPPORT_RATIO,
    requireSupport = true,
    maxOutsideRatio = DEFAULT_DECOMPOSE_MAX_OUTSIDE_RATIO,
    shapes = SHAPES,
  } = options;

  const placementOptions = { requireSupport, minSupportRatio, maxOutsideRatio };
  const placed = target.createEmptyLike();
  const bricks = [];
  const brickCounts = Object.fromEntries(BRICK_CATALOG.map((brick) => [brick.partId, 0]));
  let falsePositiveCells = 0;
  let supportedBricks = 0;
  let truncated = false;

  for (let y = 0; y + BRICK_PLATES <= target.sizeY && !truncated; y += BRICK_PLATES) {
    if (target.countInLayer(y) === 0) continue;

    for (let z = 0; z < target.sizeZ && !truncated; z++) {
      for (let x = 0; x < target.sizeX; x++) {
        // An anchor must be an unused cell of the target shape.
        if (placed.get(x, y, z) || !target.get(x, y, z)) continue;

        const best = bestCandidateAt(target, placed, { x, y, z }, shapes, placementOptions);
        if (!best) continue;

        markPlaced(placed, best.cells);
        bricks.push(toModelBrick(best.brick, best.position, best.rotation, color));
        brickCounts[best.partId]++;
        falsePositiveCells += best.outside;
        if (best.position.y === 0 || best.support > 0) supportedBricks++;

        if (bricks.length >= maxBricks) {
          truncated = true;
          break;
        }
      }
    }
  }

  return {
    bricks,
    placed,
    truncated,
    stats: { brickCounts, falsePositiveCells, supportedBricks },
  };
}

/** The best legal placement whose min corner is `position`, or null. */
function bestCandidateAt(target, placed, position, shapes, placementOptions) {
  let best = null;

  for (const { brick, rotation } of shapes) {
    const result = canPlaceBrick(
      { target, placed },
      { partId: brick.partId, position, rotation },
      placementOptions,
    );
    if (!result.ok) continue;

    const candidate = {
      brick,
      partId: brick.partId,
      rotation,
      position,
      area: brick.area,
      cells: result.cells,
      newlyCovered: result.newlyCovered,
      covered: result.covered,
      outside: result.outside,
      fit: result.fit,
      support: result.support,
      contacts: result.contacts,
      score: 0,
    };
    candidate.score = scoreCandidate(candidate);

    if (isBetterCandidate(candidate, best)) best = candidate;
  }

  return best;
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
 * @param {number}  [options.maxOutsideRatio=0]
 * @param {boolean} [options.requireSupport=true]
 * @param {number}  [options.maxBricks=20000]
 * @param {number}  [options.maxUncoveredReported=10000]
 */
export function decomposeVoxelGrid(grid, options = {}) {
  validateVoxelGridInput(grid);
  validateDecompositionOptions(options);

  const { fillThreshold, maxUncoveredReported = DEFAULT_MAX_UNCOVERED_REPORTED } = options;

  const warnings = [];
  const { occupancy: target, scale, warnings: conversionWarnings } = voxelGridToLegoOccupancy(
    grid,
    fillThreshold === undefined ? {} : { fillThreshold },
  );
  warnings.push(...conversionWarnings);

  const { bricks, placed, truncated, stats: placementStats } = decomposeOccupancy(target, options);
  if (truncated) {
    warnings.push(`Stopped after ${bricks.length} bricks (maxBricks reached); the model is incomplete.`);
  }
  if (target.sizeY < BRICK_PLATES) {
    warnings.push(
      `The shape is only ${target.sizeY} plate(s) tall; a brick is ${BRICK_PLATES} plates, so nothing fits.`,
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

  // Covered target CELLS: placed cells that are actually part of the shape.
  let coveredCells = 0;
  for (const { x, y, z } of placed.occupiedCells()) {
    if (target.get(x, y, z)) coveredCells++;
  }

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
      brickCounts: placementStats.brickCounts,
      supportedBricks: placementStats.supportedBricks,
      falsePositiveCells: placementStats.falsePositiveCells,
      targetCells: target.count,
      coveredCells,
      filledCells: placed.count,
      cellCoverageRatio: target.count === 0 ? 1 : coveredCells / target.count,
      courses: Math.floor(target.sizeY / BRICK_PLATES),
    },
    warnings,
  };
}

/** Catalog entry for a brick in a generated model (handy in the UI and tests). */
export function brickDefinitionOf(brick) {
  return getBrickDefinition(brick?.partId);
}
