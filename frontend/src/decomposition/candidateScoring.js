/**
 * CANDIDATE SCORING
 * =================
 *
 * Given the measurements brickPlacement.js produces for a legal placement,
 * decide how good it is. Plain arithmetic on plain numbers - no state, no
 * randomness, no time, no iteration order. The same candidate always scores
 * the same.
 *
 * ---- What we reward and punish ------------------------------------------
 *
 *   covered      +COVERAGE per target cell the brick is the first to fill.
 *                This is the point of the whole exercise, so it carries the
 *                most weight.
 *
 *   outside      -FALSE_POSITIVE per cell the brick occupies that is NOT part
 *                of the target. The penalty is larger than the coverage
 *                reward, so a brick that covers one extra cell at the cost of
 *                one stray cell is a net loss. This is what stops a 2x4 from
 *                bulldozing across the curved edge of a sphere.
 *
 *   fit          +FIT * (covered / cells). A ratio, not a count, so it says
 *                "how cleanly does this brick follow the boundary" rather
 *                than "how big is it". Two candidates that waste the same
 *                number of cells are separated by the smaller one fitting
 *                the surface more tightly.
 *
 *   support      +SUPPORT * supportRatio (0..1), the fraction of the
 *                footprint resting on bricks already placed. Validity is
 *                decided elsewhere by *footing*; this only expresses a
 *                preference (see brickPlacement.js for the distinction).
 *
 *   contacts     +CONTACT per LEGO cell face shared with a neighbouring
 *                placed brick, capped, so the model grows as connected
 *                structure instead of scattered islands.
 *
 *   area         +AREA * area, a deliberately small nudge toward bigger
 *                bricks. It breaks ties between candidates that cover and
 *                waste the same amount; it must never outweigh coverage or
 *                the false-positive penalty, which is why AREA is small
 *                compared with COVERAGE. Using fewer, larger bricks is nice;
 *                getting the shape right matters more.
 *
 * The weights are just numbers chosen so the priorities above hold for the
 * brick sizes in the catalog (areas 1..8, footprint volumes 3..24 cells).
 * They are exported so the tests can reason about them.
 *
 * ---- Tie-breaking -------------------------------------------------------
 *
 * Scores are floats, so `compareCandidates` never relies on them alone. In
 * order: score, covered cells, fewer outside cells, support, contacts, brick
 * area, catalog order of the part id, rotation, then grid position (y, z, x).
 * Candidate generation walks positions and the catalog in a fixed order too,
 * so the very last resort - "whichever was generated first" - is itself
 * deterministic.
 */

import { catalogIndex } from "./brickCatalog.js";

export const WEIGHTS = Object.freeze({
  COVERAGE: 10,
  FALSE_POSITIVE: 14,
  FIT: 6,
  SUPPORT: 3,
  CONTACT: 0.4,
  AREA: 0.25,
});

/** Contacts above this stop helping, so a long wall cannot outvote coverage. */
export const MAX_SCORED_CONTACTS = 12;

/**
 * Score one legal candidate.
 *
 * @param {object} candidate
 * @param {number} candidate.newlyCovered  target cells this brick fills first
 * @param {number} candidate.outside       cells outside the target shape
 * @param {number} candidate.fit           covered / total cells (0..1)
 * @param {number} candidate.support       footprint fraction on placed bricks
 * @param {number} candidate.contacts      shared faces with placed bricks
 * @param {number} candidate.area          brick footprint in studs
 * @returns {number}
 */
export function scoreCandidate({
  newlyCovered = 0,
  outside = 0,
  fit = 1,
  support = 0,
  contacts = 0,
  area = 1,
}) {
  return (
    newlyCovered * WEIGHTS.COVERAGE -
    outside * WEIGHTS.FALSE_POSITIVE +
    clamp01(fit) * WEIGHTS.FIT +
    clamp01(support) * WEIGHTS.SUPPORT +
    Math.min(contacts, MAX_SCORED_CONTACTS) * WEIGHTS.CONTACT +
    area * WEIGHTS.AREA
  );
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Compare two scored candidates. Returns a negative number when `a` is the
 * better one, so an array of candidates can be `.sort(compareCandidates)`ed
 * and the winner read off the front.
 *
 * Every field used here is an integer or a bounded ratio, and the chain ends
 * in grid coordinates, so no two distinct candidates can compare equal.
 */
export function compareCandidates(a, b) {
  return (
    diff(b.score, a.score) ||
    diff(b.newlyCovered, a.newlyCovered) ||
    diff(a.outside, b.outside) ||          // fewer stray cells wins
    diff(b.support, a.support) ||
    diff(b.contacts, a.contacts) ||
    diff(b.area, a.area) ||                // larger brick wins
    diff(catalogIndex(a.partId), catalogIndex(b.partId)) ||
    diff(a.rotation, b.rotation) ||
    diff(a.position.y, b.position.y) ||
    diff(a.position.z, b.position.z) ||
    diff(a.position.x, b.position.x)
  );
}

/** Ordinary numeric comparison, with float noise treated as a tie. */
function diff(left, right) {
  const delta = left - right;
  return Math.abs(delta) < 1e-9 ? 0 : delta;
}

/** True when `a` should be chosen over `b`. */
export function isBetterCandidate(a, b) {
  return b === null || compareCandidates(a, b) < 0;
}
