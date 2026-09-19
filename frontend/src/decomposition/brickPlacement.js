/**
 * BRICK PLACEMENT RULES
 * =====================
 *
 * Pure data in, pure data out. Given a LEGO occupancy grid (the target shape),
 * a grid of already-placed cells, and a candidate placement, decide whether
 * the brick may go there and measure how well it fits. Scoring itself lives
 * next door in candidateScoring.js; this file only produces the measurements.
 *
 * Nothing here knows about React, Three.js, LDraw or materials.
 *
 * ---- Supported parts ----------------------------------------------------
 *
 * Whatever brickCatalog.js lists: 3001 (2x4), 3003 (2x2), 3004 (1x2) and
 * 3005 (1x1). Dimensions are never repeated here - ask the catalog.
 *
 * ---- Rotation -----------------------------------------------------------
 *
 * Only 0 / 90 / 180 / 270 degrees about Y. `position` is the MIN CORNER of
 * the ROTATED footprint (existing convention), so a 2x4 at rotation 0 or 180
 * occupies 2 cells along X and 4 along Z, and at 90 or 270 the other way
 * round. All four are accepted here; the catalog decides which ones are worth
 * GENERATING, dropping rotations that repeat a footprint.
 *
 * ---- Support (deliberately simple) --------------------------------------
 *
 * Two related numbers, both measured over the footprint cells in the layer
 * directly beneath the brick (y - 1). Both are 1 on the ground course (y = 0).
 *
 *   footing  fraction of those cells that are SOLID in the intended model:
 *            either already occupied by a placed brick, or part of the target
 *            shape. This is what decides VALIDITY: a placement is rejected
 *            when footing < MIN_SUPPORT_RATIO.
 *
 *   support  fraction of those cells actually occupied by a PLACED BRICK.
 *            This decides nothing on its own; it is the secondary term of the
 *            scoring function, so placements that rest on real bricks beat
 *            otherwise equal ones that do not.
 *
 * Why footing counts target cells too: with 3001 as the only part, some target
 * layers simply cannot be bricked (a sphere's bottom cap is narrower than a
 * 2x4). Requiring placed bricks beneath would then reject every brick above
 * them and produce an empty model for any shape without a flat, wide base.
 * Counting target geometry as solid keeps those shapes buildable while still
 * rejecting the case that matters: a brick floating in air, with neither
 * bricks nor target geometry under it.
 *
 * Either way this is a deterministic footprint test, not LEGO physics: no
 * stud/tube connection simulation, no centre of mass, no toppling.
 */

import { footprint } from "../lego/coordinates.js";
import { BRICK_CATALOG, getBrickDefinition, PART_3001 } from "./brickCatalog.js";
import { LegoOccupancy } from "./LegoOccupancy.js";

export { PART_3001 };

export const VALID_ROTATIONS = Object.freeze([0, 90, 180, 270]);

/** Rotations that produce distinct footprints for an oblong brick. */
export const DISTINCT_ROTATIONS = Object.freeze([0, 90]);

/** Fraction of the footprint that must be supported from below. */
export const MIN_SUPPORT_RATIO = 0.25;

/**
 * How much of a brick may stick out of the target shape, as a fraction of its
 * footprint volume. 0 means strict containment (the Milestone 5 rule): a brick
 * may only go where the target shape actually is. The decomposer raises this a
 * little so boundary cells can be filled, and penalises every stray cell in
 * the score - see candidateScoring.js.
 */
export const DEFAULT_MAX_OUTSIDE_RATIO = 0;

/** Rejection reasons returned by canPlaceBrick. */
export const REJECTED = Object.freeze({
  PART: "unsupported-part",
  ROTATION: "invalid-rotation",
  POSITION: "invalid-position",
  BOUNDS: "out-of-bounds",
  OUTSIDE_TARGET: "outside-target",
  TOO_MUCH_OUTSIDE: "too-much-outside-target",
  OVERLAP: "overlap",
  UNSUPPORTED: "unsupported",
});

/** The part definition for a placement, or null if it isn't one we support. */
export function getPart(partId) {
  return getBrickDefinition(partId);
}

/** Every part id the placement rules accept, in catalog order. */
export const SUPPORTED_PART_IDS = Object.freeze(BRICK_CATALOG.map((brick) => brick.partId));

export function isValidRotation(rotation) {
  return VALID_ROTATIONS.includes(rotation);
}

/** Footprint in studs after rotation, e.g. {width: 4, depth: 2} for 3001 at 90. */
export function placementFootprint(part, rotation) {
  return footprint({ width: part.width, depth: part.depth, rotation });
}

/**
 * Every LEGO cell a placement occupies, as [{x, y, z}, ...].
 * Order is deterministic: y, then z, then x (same as the occupancy grids).
 */
export function brickCells(part, position, rotation = 0) {
  const fp = placementFootprint(part, rotation);
  const cells = [];
  for (let dy = 0; dy < part.height; dy++) {
    for (let dz = 0; dz < fp.depth; dz++) {
      for (let dx = 0; dx < fp.width; dx++) {
        cells.push({ x: position.x + dx, y: position.y + dy, z: position.z + dz });
      }
    }
  }
  return cells;
}

/**
 * Fraction of the footprint directly beneath `position` for which `isSolid`
 * holds. Always 1 on the ground course. Shared by supportRatio/footingRatio.
 */
function beneathRatio(part, position, rotation, isSolid) {
  if (position.y === 0) return 1;
  const fp = placementFootprint(part, rotation);
  const below = position.y - 1;
  let solid = 0;
  for (let dz = 0; dz < fp.depth; dz++) {
    for (let dx = 0; dx < fp.width; dx++) {
      if (isSolid(position.x + dx, below, position.z + dz)) solid++;
    }
  }
  return solid / (fp.width * fp.depth);
}

/** How much of the footprint rests on already-PLACED bricks. Scoring term. */
export function supportRatio(placed, part, position, rotation = 0) {
  return beneathRatio(part, position, rotation, (x, y, z) => !!placed && placed.get(x, y, z));
}

/**
 * How much of the footprint rests on anything solid in the intended model -
 * a placed brick, or target geometry no brick could fill. Validity term.
 */
export function footingRatio(target, placed, part, position, rotation = 0) {
  return beneathRatio(
    part,
    position,
    rotation,
    (x, y, z) => (!!placed && placed.get(x, y, z)) || target.get(x, y, z),
  );
}

/** Side-adjacent already-placed cells (X/Z neighbours of the brick's own cells). */
export function neighbourContacts(placed, cells) {
  const own = new Set(cells.map(({ x, y, z }) => `${x},${y},${z}`));
  let contacts = 0;
  for (const { x, y, z } of cells) {
    const sides = [
      [x - 1, y, z], [x + 1, y, z],
      [x, y, z - 1], [x, y, z + 1],
    ];
    for (const [nx, ny, nz] of sides) {
      if (own.has(`${nx},${ny},${nz}`)) continue;
      if (placed.get(nx, ny, nz)) contacts++;
    }
  }
  return contacts;
}

function normalizeContext(context) {
  if (context instanceof LegoOccupancy) return { target: context, placed: null };
  if (!context || typeof context !== "object") {
    throw new TypeError("canPlaceBrick expects a LegoOccupancy or { target, placed }");
  }
  const { target, placed = null } = context;
  if (!(target instanceof LegoOccupancy)) {
    throw new TypeError("canPlaceBrick expects context.target to be a LegoOccupancy");
  }
  return { target, placed };
}

/**
 * Can this brick occupy this location?
 *
 * @param {LegoOccupancy|{target: LegoOccupancy, placed?: LegoOccupancy}} context
 *        the target shape, and optionally the cells already used by bricks
 * @param {{partId: string, position: {x,y,z}, rotation?: number}} placement
 * @param {object} [options]
 * @param {boolean} [options.requireSupport=true]
 * @param {number}  [options.minSupportRatio=MIN_SUPPORT_RATIO]
 * @param {number}  [options.maxOutsideRatio=0]  fraction of the brick allowed
 *        to fall outside the target shape; 0 = strict containment
 * @returns {{ok: boolean, reason: string|null, cells: Array, support: number,
 *            footing: number, covered: number, outside: number, fit: number,
 *            newlyCovered: number, contacts: number}}
 */
export function canPlaceBrick(context, placement, options = {}) {
  const { target, placed } = normalizeContext(context);
  const {
    requireSupport = true,
    minSupportRatio = MIN_SUPPORT_RATIO,
    maxOutsideRatio = DEFAULT_MAX_OUTSIDE_RATIO,
  } = options;

  const reject = (reason) => ({
    ok: false, reason, cells: [],
    support: 0, footing: 0, newlyCovered: 0, covered: 0, outside: 0, fit: 0, contacts: 0,
  });

  const part = getPart(placement?.partId);
  if (!part) return reject(REJECTED.PART);

  const rotation = placement.rotation ?? 0;
  if (!isValidRotation(rotation)) return reject(REJECTED.ROTATION);

  const position = placement.position;
  if (
    !position ||
    !Number.isInteger(position.x) || !Number.isInteger(position.y) || !Number.isInteger(position.z)
  ) {
    return reject(REJECTED.POSITION);
  }

  const cells = brickCells(part, position, rotation);

  for (const { x, y, z } of cells) {
    if (!target.isInBounds(x, y, z)) return reject(REJECTED.BOUNDS);
  }
  let covered = 0;
  for (const { x, y, z } of cells) {
    if (target.get(x, y, z)) covered++;
  }
  const outside = cells.length - covered;
  if (outside > 0) {
    // maxOutsideRatio 0 is the strict Milestone 5 rule: stay inside the shape.
    if (maxOutsideRatio <= 0) return reject(REJECTED.OUTSIDE_TARGET);
    if (outside / cells.length > maxOutsideRatio + 1e-9) return reject(REJECTED.TOO_MUCH_OUTSIDE);
  }
  if (placed) {
    for (const { x, y, z } of cells) {
      if (placed.get(x, y, z)) return reject(REJECTED.OVERLAP);
    }
  }

  const footing = footingRatio(target, placed, part, position, rotation);
  if (requireSupport && footing < minSupportRatio) return reject(REJECTED.UNSUPPORTED);

  const support = supportRatio(placed, part, position, rotation);
  const newlyCovered = placed
    ? cells.filter(({ x, y, z }) => target.get(x, y, z) && !placed.get(x, y, z)).length
    : covered;
  const contacts = placed ? neighbourContacts(placed, cells) : 0;

  return {
    ok: true,
    reason: null,
    cells,
    support,
    footing,
    covered,          // cells of this brick that are target geometry
    outside,          // cells of this brick that are NOT (false positives)
    fit: covered / cells.length, // 1 = sits entirely inside the shape
    newlyCovered,     // target cells this brick is the first to cover
    contacts,
  };
}

/** Mark a placement's cells as used. Mutates `placed` only. */
export function markPlaced(placed, cells) {
  for (const { x, y, z } of cells) placed.set(x, y, z, true);
  return placed;
}

/** A placement as a brick in the existing LEGO model format (see src/lego/model.js). */
export function toModelBrick(part, position, rotation, color) {
  return {
    partId: part.partId,
    type: part.type,
    width: part.width,
    depth: part.depth,
    height: part.height,
    color,
    position: { x: position.x, y: position.y, z: position.z },
    rotation,
  };
}
