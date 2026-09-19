/**
 * BRICKIFY LEGO COORDINATE SYSTEM
 * ===============================
 *
 * There are two spaces. Model data lives in GRID space; only the renderer
 * ever touches WORLD space.
 *
 * GRID space (what model data, voxelization and brick placement use)
 *   X = width direction   (studs)   integer
 *   Y = height            (plates)  integer, up
 *   Z = depth direction   (studs)   integer
 *
 *   1 stud  = 1 unit along X or Z
 *   1 plate = 1 unit along Y
 *   1 brick = 3 plates
 *
 *   1x1 brick: width 1, depth 1, height 3
 *   2x4 brick: width 2, depth 4, height 3
 *   1x1 plate: width 1, depth 1, height 1
 *
 * A brick's `position` is the MINIMUM CORNER of the cells it occupies:
 * it fills x..x+width, y..y+height, z..z+depth. Bricks that touch in grid
 * space therefore tile with no gaps or overlaps, which is what voxelization needs.
 *
 * `rotation` is degrees about the Y axis, multiples of 90. A quarter turn swaps
 * the footprint (a 2x4 at 90 deg occupies 4 along X and 2 along Z). `position`
 * still refers to the min corner of the rotated footprint (see `footprint`).
 *
 * WORLD space (Three.js)
 *   Horizontal: 1 world unit = 1 stud (8 mm real-world pitch).
 *   Vertical:   a plate is NOT one world unit. It is 3.2 mm / 8 mm = 0.4 units,
 *               so real LEGO proportions are preserved. A brick is 1.2 units tall.
 *               Convert with `gridToWorld`; never hand-write 0.4 elsewhere.
 *
 * Dimensions below match LDraw (1 stud = 20 LDU, 1 plate = 8 LDU, stud radius
 * = 6 LDU, stud height = 4 LDU), so LDraw parts can be dropped in later by
 * scaling by 1/20 and flipping Y (LDraw's Y axis points down).
 */

export const STUD_PITCH = 1; // world units per stud
export const PLATE_HEIGHT = 0.4; // world units per plate
export const BRICK_PLATES = 3; // plates in a standard brick

export const STUD_RADIUS = 0.3; // 4.8 mm diameter
export const STUD_HEIGHT = 0.2; // 1.6 mm
export const BRICK_INSET = 0.0125; // 0.1 mm gap per side so neighbouring bricks show a seam
export const EDGE_RADIUS = 0.03; // small bevel on the body's edges

/** Footprint (in studs) after applying rotation. */
export function footprint({ width, depth, rotation = 0 }) {
  const quarterTurn = (((rotation % 180) + 180) % 180) === 90;
  return quarterTurn ? { width: depth, depth: width } : { width, depth };
}

/** Grid position -> world position. */
export function gridToWorld({ x = 0, y = 0, z = 0 }) {
  return [x * STUD_PITCH, y * PLATE_HEIGHT, z * STUD_PITCH];
}

/** Accepts {x,y,z} (model data) or [x,y,z] (handy in JSX) and returns {x,y,z}. */
export function toPosition(p) {
  if (Array.isArray(p)) return { x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 };
  return { x: p?.x ?? 0, y: p?.y ?? 0, z: p?.z ?? 0 };
}

/**
 * World-space bounding box of a whole model (studs included).
 * Used by the viewer to frame the camera and size the ground/shadows.
 */
export function getModelBounds(model) {
  const bricks = model?.bricks ?? [];
  if (bricks.length === 0) {
    return { min: [0, 0, 0], max: [1, 1, 1], center: [0.5, 0.5, 0.5], size: [1, 1, 1] };
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const brick of bricks) {
    const { x, y, z } = toPosition(brick.position);
    const fp = footprint(brick);
    const [wx, wy, wz] = gridToWorld({ x, y, z });
    const top = wy + brick.height * PLATE_HEIGHT + STUD_HEIGHT;

    min[0] = Math.min(min[0], wx);
    min[1] = Math.min(min[1], wy);
    min[2] = Math.min(min[2], wz);
    max[0] = Math.max(max[0], wx + fp.width * STUD_PITCH);
    max[1] = Math.max(max[1], top);
    max[2] = Math.max(max[2], wz + fp.depth * STUD_PITCH);
  }

  const size = max.map((v, i) => v - min[i]);
  const center = max.map((v, i) => (v + min[i]) / 2);
  return { min, max, center, size };
}
