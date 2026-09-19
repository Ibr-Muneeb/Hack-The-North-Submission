/**
 * BRICK PLACEMENT RULES
 * =====================
 *
 * Pure data in, pure data out. Given a LEGO occupancy grid (the target shape),
 * a grid of already-placed cells, and a candidate placement, decide whether
 * the brick may go there and how good that placement is.
 *
 * Nothing here knows about React, Three.js, LDraw or materials.
 *
 * ---- The only supported part (Milestone 5) ------------------------------
 *
 *   3001 - the standard 2x4 brick: 2 studs x 4 studs x 3 plates.
 *
 * NOTE ON width/depth: the existing LEGO model format (src/lego/coordinates.js
 * and src/lego/model.js) already fixes the convention for a 2x4 brick as
 * `width: 2, depth: 4` - i.e. at rotation 0 the part spans 2 studs along X
 * and 4 along Z, which is how the LDraw geometry for 3001 actually loads.
 * We follow the existing convention rather than inventing a new one; the
 * "4 studs along X" orientation is simply rotation 90 (see `footprint`).
 *
 * ---- Rotation -----------------------------------------------------------
 *
 * Only 0 / 90 / 180 / 270 degrees about Y. `position` is the MIN CORNER of
 * the ROTATED footprint (existing convention), so:
 *
 *   rotation 0 or 180 -> occupies 2 cells along X, 4 along Z
 *   rotation 90 or 270 -> occupies 4 cells along X, 2 along Z
 *
 * Because a 2x4 brick is symmetric about its centre, 0 and 180 occupy exactly
 * the same cells, as do 90 and 270. All four are accepted and handled
 * correctly; the decomposer only ENUMERATES 0 and 90, since the other two
 * would be duplicate candidates (see decomposer.js).
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

import { BRICK_PLATES, footprint } from "../lego/coordinates.js";
import { LegoOccupancy } from "./LegoOccupancy.js";

/** The only part this milestone can place. Shape matches the LEGO model format. */
export const PART_3001 = Object.freeze({
  partId: "3001",
  type: "brick",
  width: 2,
  depth: 4,
  height: BRICK_PLATES,
});

export const SUPPORTED_PARTS = Object.freeze({ 3001: PART_3001 });

export const VALID_ROTATIONS = Object.freeze([0, 90, 180, 270]);

/** Rotations that produce distinct footprints for a 2x4 (see module docs). */
export const DISTINCT_ROTATIONS = Object.freeze([0, 90]);

/** Fraction of the footprint that must be supported from below. */
export const MIN_SUPPORT_RATIO = 0.25;

/** Rejection reasons returned by canPlaceBrick. */
export const REJECTED = Object.freeze({
  PART: "unsupported-part",
  ROTATION: "invalid-rotation",
  POSITION: "invalid-position",
  BOUNDS: "out-of-bounds",
  OUTSIDE_TARGET: "outside-target",
  OVERLAP: "overlap",
  UNSUPPORTED: "unsupported",
});

/** The part definition for a placement, or null if it isn't one we support. */
export function getPart(partId) {
  return SUPPORTED_PARTS[partId] ?? null;
}

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

/**
 * Score a valid placement. Strict priority order, encoded as integer bands so
 * a better primary term can never be outweighed by the lower ones:
 *
 *   1. newly covered target cells   (x 1,000,000)
 *   2. support underneath           (0..1000, x 100)
 *   3. neighbouring placed cells    (0..99)
 *
 * Deterministic: same inputs -> same number, no randomness anywhere.
 */
export function scorePlacement({ newlyCovered, support, contacts }) {
  return (
    newlyCovered * 1_000_000 +
    Math.round(Math.min(1, Math.max(0, support)) * 1000) * 100 +
    Math.min(99, contacts)
  );
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
 * @returns {{ok: boolean, reason: string|null, cells: Array, support: number,
 *            newlyCovered: number, contacts: number, score: number}}
 */
export function canPlaceBrick(context, placement, options = {}) {
  const { target, placed } = normalizeContext(context);
  const { requireSupport = true, minSupportRatio = MIN_SUPPORT_RATIO } = options;

  const reject = (reason) => ({
    ok: false, reason, cells: [], support: 0, footing: 0, newlyCovered: 0, contacts: 0, score: -1,
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
  for (const { x, y, z } of cells) {
    if (!target.get(x, y, z)) return reject(REJECTED.OUTSIDE_TARGET);
  }
  if (placed) {
    for (const { x, y, z } of cells) {
      if (placed.get(x, y, z)) return reject(REJECTED.OVERLAP);
    }
  }

  const footing = footingRatio(target, placed, part, position, rotation);
  if (requireSupport && footing < minSupportRatio) return reject(REJECTED.UNSUPPORTED);

  const support = supportRatio(placed, part, position, rotation);
  const newlyCovered = placed ? cells.filter(({ x, y, z }) => !placed.get(x, y, z)).length : cells.length;
  const contacts = placed ? neighbourContacts(placed, cells) : 0;

  return {
    ok: true,
    reason: null,
    cells,
    support,
    footing,
    newlyCovered,
    contacts,
    score: scorePlacement({ newlyCovered, support, contacts }),
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
