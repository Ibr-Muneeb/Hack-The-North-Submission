/**
 * VOXEL GRID -> LEGO OCCUPANCY
 * ============================
 *
 * Resampling step. A VoxelGrid is made of CUBES of `voxelSize` world units;
 * a LEGO cell is 1 x 0.4 x 1 world units (1 stud x 1 plate x 1 stud). The two
 * grids are therefore never the same grid, and the conversion has to be
 * explicit about it.
 *
 * ---- Coordinate mapping -------------------------------------------------
 *
 * Both grids live in the same WORLD space (X/Z horizontal, +Y up, 1 unit =
 * 1 stud), so the mapping goes through world coordinates rather than through
 * any assumed cell ratio:
 *
 *   LEGO cell (cx, cy, cz) covers the half-open world box
 *     [ox + cx,        ox + cx + 1      )  on X
 *     [oy + cy * 0.4,  oy + (cy+1)*0.4  )  on Y
 *     [oz + cz,        oz + cz + 1      )  on Z
 *
 * where (ox, oy, oz) = the voxel grid's own `origin`. The LEGO grid's origin
 * is deliberately the SAME world point as the voxel grid's origin, so cell
 * (0, 0, 0) of both grids starts at the same corner. Negative world origins
 * are fine: LEGO cell indices stay non-negative, and the world offset is kept
 * on the occupancy as `origin`.
 *
 * The LEGO grid is sized to cover the voxel grid's whole world box, rounding
 * UP to whole LEGO cells:
 *
 *   sizeX = ceil(worldSizeX / 1)      sizeY = ceil(worldSizeY / 0.4)
 *   sizeZ = ceil(worldSizeZ / 1)
 *
 * ---- Occupancy rule (rounding behaviour) --------------------------------
 *
 * A LEGO cell is occupied when MORE than `fillThreshold` (default 0.5) of its
 * VOLUME is covered by occupied voxels. The overlap is computed exactly, by
 * volume, per axis - not by counting whole voxels - so the rule is the same
 * whether or not the voxel size divides a stud or a plate evenly. Anything
 * outside the voxel grid counts as empty. A cell that is completely full is
 * always occupied, whatever the threshold.
 *
 * With an aligned voxel size this degenerates to the obvious thing: "a LEGO
 * cell is occupied if more than half of the voxels inside it are occupied".
 *
 * The comparison is STRICT (Milestone 6 fix). A surface that lands exactly on
 * the midpoint of a LEGO cell - which happens whenever a shape's features are
 * not whole studs/plates, e.g. a staircase with 1.5-stud treads - leaves that
 * cell exactly half full. Milestone 5 rounded those ties up, which always grew
 * the shape outward and upward by one cell and made stair treads look shifted
 * along +X and one plate too tall. Rounding a tie DOWN instead keeps the LEGO
 * model inside the voxel geometry, matching the rule everywhere else in the
 * decomposer that a brick never bulges past the target.
 *
 * ---- Voxel-size alignment ------------------------------------------------
 *
 * voxelSize is NOT assumed to be 0.2. `describeVoxelScale` reports how many
 * voxels fit in a stud (1 / voxelSize) and in a plate (0.4 / voxelSize):
 *
 *   voxelSize 0.2 -> 5 voxels per stud, 2 per plate      ALIGNED
 *   voxelSize 0.1 -> 10 voxels per stud, 4 per plate     ALIGNED
 *   voxelSize 0.5 -> 2 voxels per stud, 0.8 per plate    NOT ALIGNED
 *
 * A non-aligned size is NOT an error - the volume rule above still produces a
 * well-defined result - but voxel boundaries then fall inside LEGO cells, so
 * the LEGO model cannot reproduce the target exactly even in principle. The
 * conversion reports this as a warning (see `warnings` on the result) instead
 * of silently pretending the geometry lines up.
 *
 * The source VoxelGrid is only ever read; it is never modified.
 */

import { PLATE_HEIGHT, STUD_PITCH } from "../lego/coordinates.js";
import { LegoOccupancy } from "./LegoOccupancy.js";

const EPSILON = 1e-9;

export const DEFAULT_FILL_THRESHOLD = 0.5;

/** Is `value` a whole number, allowing for float noise (0.4 / 0.2 = 2.0000000000000004)? */
function isWholeNumber(value) {
  return Math.abs(value - Math.round(value)) < 1e-6;
}

/**
 * How the voxel size relates to LEGO dimensions.
 *
 * @returns {{voxelSize:number, voxelsPerStud:number, voxelsPerPlate:number,
 *            studAligned:boolean, plateAligned:boolean, aligned:boolean}}
 */
export function describeVoxelScale(voxelSize) {
  if (!Number.isFinite(voxelSize) || voxelSize <= 0) {
    throw new RangeError(`voxelSize must be a positive finite number, got ${voxelSize}`);
  }
  const voxelsPerStud = STUD_PITCH / voxelSize;
  const voxelsPerPlate = PLATE_HEIGHT / voxelSize;
  const studAligned = isWholeNumber(voxelsPerStud);
  const plateAligned = isWholeNumber(voxelsPerPlate);
  return {
    voxelSize,
    voxelsPerStud,
    voxelsPerPlate,
    studAligned,
    plateAligned,
    aligned: studAligned && plateAligned,
  };
}

/**
 * The voxel cells overlapping the world interval [lo, hi) on one axis, with
 * the length of each overlap. Cells outside [0, count) are skipped, so the
 * caller automatically treats "outside the grid" as empty.
 */
function axisOverlaps(lo, hi, origin, voxelSize, count) {
  const first = Math.max(0, Math.floor((lo - origin) / voxelSize + EPSILON));
  const last = Math.min(count - 1, Math.ceil((hi - origin) / voxelSize - EPSILON) - 1);
  const spans = [];
  for (let i = first; i <= last; i++) {
    const a = Math.max(lo, origin + i * voxelSize);
    const b = Math.min(hi, origin + (i + 1) * voxelSize);
    if (b - a > EPSILON) spans.push({ index: i, length: b - a });
  }
  return spans;
}

/** Size of the LEGO grid needed to cover a voxel grid's world box. */
export function legoGridSizeFor(grid) {
  const { size } = grid.getWorldBounds();
  return {
    sizeX: Math.max(1, Math.ceil(size[0] / STUD_PITCH - EPSILON)),
    sizeY: Math.max(1, Math.ceil(size[1] / PLATE_HEIGHT - EPSILON)),
    sizeZ: Math.max(1, Math.ceil(size[2] / STUD_PITCH - EPSILON)),
  };
}

/**
 * The LEGO cell containing a world point, as {x, y, z}. Not clamped: the
 * result may be outside the occupancy grid (check with isInBounds).
 */
export function worldToLegoCell([wx, wy, wz], origin = [0, 0, 0]) {
  const [ox, oy, oz] = origin;
  return {
    x: Math.floor((wx - ox) / STUD_PITCH + EPSILON),
    y: Math.floor((wy - oy) / PLATE_HEIGHT + EPSILON),
    z: Math.floor((wz - oz) / STUD_PITCH + EPSILON),
  };
}

/**
 * Resample a VoxelGrid into a LegoOccupancy (see module docs).
 *
 * @param {import("../voxel/VoxelGrid.js").VoxelGrid} grid  read only, never modified
 * @param {object} [options]
 * @param {number} [options.fillThreshold=0.5]  fraction of a LEGO cell's volume
 *        that must be occupied by voxels for the cell to count as target geometry
 * @returns {{occupancy: LegoOccupancy, scale: object, warnings: string[]}}
 */
export function voxelGridToLegoOccupancy(grid, { fillThreshold = DEFAULT_FILL_THRESHOLD } = {}) {
  if (!grid || typeof grid.get !== "function" || typeof grid.getWorldBounds !== "function") {
    throw new TypeError("voxelGridToLegoOccupancy expects a VoxelGrid");
  }
  if (!Number.isFinite(fillThreshold) || fillThreshold <= 0 || fillThreshold > 1) {
    throw new RangeError(`fillThreshold must be in (0, 1], got ${fillThreshold}`);
  }

  const scale = describeVoxelScale(grid.voxelSize);
  const warnings = [];
  if (!scale.aligned) {
    warnings.push(
      `voxelSize ${grid.voxelSize} does not divide LEGO dimensions evenly ` +
        `(${scale.voxelsPerStud.toFixed(3)} voxels per stud, ${scale.voxelsPerPlate.toFixed(3)} per plate). ` +
        `LEGO cells are filled by majority volume, so the result is an approximation even where the shape is flat. ` +
        `Use 0.2 or 0.1 for an exact mapping.`,
    );
  }

  const { sizeX, sizeY, sizeZ } = legoGridSizeFor(grid);
  const origin = [...grid.origin];
  const occupancy = new LegoOccupancy(sizeX, sizeY, sizeZ, { origin });

  const s = grid.voxelSize;
  const cellVolume = STUD_PITCH * PLATE_HEIGHT * STUD_PITCH;
  const required = cellVolume * fillThreshold;
  const full = cellVolume - EPSILON;

  // Overlaps depend only on the index along each axis, so compute them once
  // per axis instead of once per cell.
  const xSpans = [];
  for (let cx = 0; cx < sizeX; cx++) {
    const lo = origin[0] + cx * STUD_PITCH;
    xSpans.push(axisOverlaps(lo, lo + STUD_PITCH, origin[0], s, grid.width));
  }
  const ySpans = [];
  for (let cy = 0; cy < sizeY; cy++) {
    const lo = origin[1] + cy * PLATE_HEIGHT;
    ySpans.push(axisOverlaps(lo, lo + PLATE_HEIGHT, origin[1], s, grid.height));
  }
  const zSpans = [];
  for (let cz = 0; cz < sizeZ; cz++) {
    const lo = origin[2] + cz * STUD_PITCH;
    zSpans.push(axisOverlaps(lo, lo + STUD_PITCH, origin[2], s, grid.depth));
  }

  for (let cy = 0; cy < sizeY; cy++) {
    const ys = ySpans[cy];
    if (ys.length === 0) continue;
    for (let cz = 0; cz < sizeZ; cz++) {
      const zs = zSpans[cz];
      if (zs.length === 0) continue;
      for (let cx = 0; cx < sizeX; cx++) {
        const xs = xSpans[cx];
        if (xs.length === 0) continue;

        let filled = 0;
        for (const yy of ys) {
          for (const zz of zs) {
            for (const xx of xs) {
              if (grid.get(xx.index, yy.index, zz.index)) {
                filled += xx.length * yy.length * zz.length;
              }
            }
          }
        }
        if (filled > required + EPSILON || filled >= full) occupancy.set(cx, cy, cz, true);
      }
    }
  }

  return { occupancy, scale, warnings };
}
