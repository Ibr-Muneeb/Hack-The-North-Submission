/**
 * BRICK CATALOG
 * =============
 *
 * The single source of truth for every LEGO part the decomposer may place.
 * Nothing else in the codebase should hard-code a part's dimensions.
 *
 * Dimensions follow the project convention fixed in src/lego/coordinates.js:
 *
 *   width   studs along X at rotation 0
 *   depth   studs along Z at rotation 0
 *   height  plates (a standard brick is 3)
 *
 * So a 2x4 brick is `width: 2, depth: 4`, and "4 studs along X" is rotation 90
 * (see `footprint` in coordinates.js). This matches how the LDraw geometry
 * actually loads: after the fixed LDraw -> Brickify conversion in LegoPart.js,
 * 3001 measures 2 units along X and 4 along Z. The same was verified for the
 * other three parts.
 *
 * ---- Rotations ----------------------------------------------------------
 *
 * Only quarter turns. A rotation is only listed when it produces a DIFFERENT
 * footprint, so the decomposer never evaluates the same placement twice:
 *
 *   square bricks (2x2, 1x1)  ->  [0]          90 is identical
 *   oblong bricks (2x4, 1x2)  ->  [0, 90]      180/270 repeat 0/90, because a
 *                                              rectangle is symmetric about
 *                                              its centre and `position` is
 *                                              the min corner of the rotated
 *                                              footprint
 *
 * All four rotations remain *legal* input (see brickPlacement.js); the catalog
 * only says which ones are worth generating as candidates.
 *
 * ---- Order --------------------------------------------------------------
 *
 * The catalog is ordered largest area first, then by part id. Candidate
 * generation walks it in this order, which is one of the deterministic
 * tie-breakers in candidateScoring.js.
 */

/** Plates in a standard brick. Mirrors BRICK_PLATES in src/lego/coordinates.js. */
const BRICK_HEIGHT_PLATES = 3;

function defineBrick(partId, width, depth) {
  const squareFootprint = width === depth;
  return Object.freeze({
    partId,
    type: "brick",
    width,
    depth,
    height: BRICK_HEIGHT_PLATES,
    area: width * depth,
    label: `${width}x${depth}`,
    rotations: Object.freeze(squareFootprint ? [0] : [0, 90]),
  });
}

/** Every placeable part, largest first. */
export const BRICK_CATALOG = Object.freeze([
  defineBrick("3001", 2, 4), // 2x4
  defineBrick("3003", 2, 2), // 2x2
  defineBrick("3004", 1, 2), // 1x2
  defineBrick("3005", 1, 1), // 1x1
]);

const BY_ID = new Map(BRICK_CATALOG.map((brick) => [brick.partId, brick]));

/** Catalog entry for a part id, or null if we cannot place that part. */
export function getBrickDefinition(partId) {
  return BY_ID.get(partId) ?? null;
}

export function isSupportedPart(partId) {
  return BY_ID.has(partId);
}

/** Position of a part in the catalog order; Infinity for unknown parts. */
export function catalogIndex(partId) {
  const index = BRICK_CATALOG.findIndex((brick) => brick.partId === partId);
  return index === -1 ? Infinity : index;
}

/** Distinct footprints worth trying, as [{ brick, rotation }, ...], largest first. */
export function candidateShapes() {
  return BRICK_CATALOG.flatMap((brick) =>
    brick.rotations.map((rotation) => ({ brick, rotation })),
  );
}

/** The largest part in the catalog (used for bounds/sanity checks). */
export const LARGEST_BRICK = BRICK_CATALOG[0];

/** Kept for compatibility with Milestone 5 code and tests. */
export const PART_3001 = getBrickDefinition("3001");
