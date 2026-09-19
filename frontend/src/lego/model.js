/**
 * A LEGO model is plain data: a list of bricks in GRID space
 * (see coordinates.js). Nothing here knows about Three.js.
 *
 * Brick fields:
 *   partId    LEGO design id ("3001" = brick 2x4). Used as the key for
 *             LDraw / Rebrickable lookups (see LegoPart.js). Optional: a
 *             brick with no partId always uses the procedural geometry.
 *   type      "brick" | "plate" | ... (informational for now)
 *   width     studs along X (before rotation - see coordinates.js `footprint`)
 *   depth     studs along Z (before rotation)
 *   height    plates (brick = 3, plate = 1)
 *   color     LEGO colour name (see Brick.jsx LEGO_COLORS) or any CSS colour
 *   position  {x, y, z} MIN CORNER of the occupied cells (studs, plates, studs),
 *             already accounting for rotation - see coordinates.js
 *   rotation  degrees about Y, multiple of 90
 *
 * This test model is a small two-course "wall" built entirely out of 3001
 * (2x4 brick), the only part currently in public/ldraw. It exists to
 * demonstrate - and let you visually verify - every placement rule in
 * coordinates.js at once:
 *
 *   - side-by-side placement (three bricks tiling the bottom course)
 *   - stacking (a second course sitting exactly on top of the first)
 *   - a classic LEGO "staggered" offset between courses, so seams don't align
 *   - 90 degree rotation (every wall brick is rotated so its long side runs
 *     along X instead of Z)
 *   - multiple bricks sharing the same partId (all six bricks are "3001",
 *     see LegoPart.js for why this only downloads/parses the part once)
 *   - multiple colors (four different colors across the model)
 *
 * A 2x4 brick is 2 studs x 4 studs. Rotated 90 degrees its footprint becomes
 * 4 studs x 2 studs (see `footprint` in coordinates.js), which is what lets
 * three of them tile edge-to-edge into a 12-stud-long, 2-stud-deep course:
 *
 *   course 0 (y=0):  [0,4)x[0,2)  [4,8)x[0,2)  [8,12)x[0,2)
 *   course 1 (y=3):        [2,6)x[0,2)  [6,10)x[0,2)
 *
 * course 1 sits at grid y=3 because course 0 is 3 plates tall (one brick),
 * and it's shifted 2 studs relative to course 0 so no vertical seam lines up
 * between the two courses - the same trick real LEGO walls use for strength.
 */
export const testModel = {
  bricks: [
    // --- Course 0: three 2x4 bricks laid end-to-end (rotated 90deg so the
    // long "4 stud" side runs along X), forming a 12x2 stud base row. ---
    {
      partId: "3001",
      type: "brick",
      width: 2,
      depth: 4,
      height: 3,
      color: "red",
      position: { x: 0, y: 0, z: 0 },
      rotation: 90,
    },
    {
      partId: "3001",
      type: "brick",
      width: 2,
      depth: 4,
      height: 3,
      color: "yellow",
      position: { x: 4, y: 0, z: 0 },
      rotation: 90,
    },
    {
      partId: "3001",
      type: "brick",
      width: 2,
      depth: 4,
      height: 3,
      color: "blue",
      position: { x: 8, y: 0, z: 0 },
      rotation: 90,
    },

    // --- Course 1: stacked on top of course 0 (y=3, i.e. one brick height
    // up), shifted 2 studs so the seams stagger like a real LEGO wall. ---
    {
      partId: "3001",
      type: "brick",
      width: 2,
      depth: 4,
      height: 3,
      color: "blue",
      position: { x: 2, y: 3, z: 0 },
      rotation: 90,
    },
    {
      partId: "3001",
      type: "brick",
      width: 2,
      depth: 4,
      height: 3,
      color: "red",
      position: { x: 6, y: 3, z: 0 },
      rotation: 90,
    },

    // --- A single UNROTATED brick off to the side, so the default
    // orientation is still directly visible next to the rotated ones. ---
    {
      partId: "3001",
      type: "brick",
      width: 2,
      depth: 4,
      height: 3,
      color: "green",
      position: { x: 0, y: 0, z: 4 },
      rotation: 0,
    },
  ],
};
