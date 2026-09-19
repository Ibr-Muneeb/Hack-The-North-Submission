/**
 * A LEGO model is plain data: a list of bricks in GRID space
 * (see coordinates.js). Nothing here knows about Three.js.
 *
 * Brick fields:
 *   partId    LEGO design id ("3001" = brick 2x4). Unused by the procedural renderer,
 *             but it is the key for LDraw / Rebrickable lookups later.
 *   type      "brick" | "plate" | ... (informational for now)
 *   width     studs along X
 *   depth     studs along Z
 *   height    plates (brick = 3, plate = 1)
 *   color     LEGO colour name or any CSS colour
 *   position  {x, y, z} min corner of the occupied cells: studs, plates, studs
 *   rotation  degrees about Y, multiple of 90
 */
export const testModel = {
  bricks: [
    {
      // partId "3001" (LEGO 2x4 brick) makes Brick.jsx load the real LDraw
      // geometry for this brick (see LegoPart.js). width/depth/height still
      // describe its grid footprint and are also what the procedural
      // fallback uses if the LDraw geometry can't be loaded.
      partId: "3001",
      type: "brick",
      width: 2,
      depth: 4,
      height: 3,
      color: "red",
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
    },
  ],
};
