/**
 * LEGO OCCUPANCY GRID
 * ===================
 *
 * The intermediate representation that sits between a VoxelGrid (cubic cells)
 * and a LEGO model (bricks). It is the LEGO equivalent of VoxelGrid: a dense
 * grid of on/off cells, except a cell is not a cube - it is exactly one
 * LEGO "cell":
 *
 *   1 stud along X  x  1 plate along Y  x  1 stud along Z
 *   = 1 x 0.4 x 1 world units   (see src/lego/coordinates.js)
 *
 * Cell (x, y, z) is therefore the same integer coordinate a brick's
 * `position` uses in the existing LEGO model format, which is what makes
 * brick placement cheap: a 3001 at position (x, y, z) simply occupies
 * x..x+width, y..y+3, z..z+depth of THIS grid.
 *
 * Two instances are used during decomposition:
 *   target  - derived (read-only) from the VoxelGrid: "the shape we want"
 *   placed  - written as bricks are chosen:            "what we have built"
 *
 * Nothing here knows about React, Three.js, LDraw or rendering. Plain data.
 *
 * `origin` is the world position of the minimum corner of cell (0, 0, 0). It
 * is carried along so callers can map back to world space, but brick
 * positions produced by the decomposer stay in these non-negative integer
 * cell coordinates (which is what the existing renderer expects), even when
 * the source VoxelGrid lives at negative world coordinates.
 */

import { PLATE_HEIGHT, STUD_PITCH } from "../lego/coordinates.js";

/** World size of one LEGO cell, [x, y, z]. */
export const LEGO_CELL_SIZE = Object.freeze([STUD_PITCH, PLATE_HEIGHT, STUD_PITCH]);

/** Same guard as VoxelGrid: refuse absurd grids instead of freezing the tab. */
export const MAX_LEGO_CELLS = 2 ** 24;

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`LegoOccupancy ${name} must be a positive integer, got ${value}`);
  }
}

export class LegoOccupancy {
  #cells;
  #count = 0;

  /**
   * @param {number} sizeX  cells along X (studs)
   * @param {number} sizeY  cells along Y (plates, up)
   * @param {number} sizeZ  cells along Z (studs)
   * @param {object} [options]
   * @param {number[]} [options.origin=[0,0,0]]  world position of cell (0,0,0)'s min corner
   */
  constructor(sizeX, sizeY, sizeZ, { origin = [0, 0, 0] } = {}) {
    assertPositiveInteger("sizeX", sizeX);
    assertPositiveInteger("sizeY", sizeY);
    assertPositiveInteger("sizeZ", sizeZ);
    if (!Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)) {
      throw new TypeError(`LegoOccupancy origin must be [x, y, z] of finite numbers, got ${JSON.stringify(origin)}`);
    }
    if (sizeX * sizeY * sizeZ > MAX_LEGO_CELLS) {
      throw new RangeError(
        `LegoOccupancy ${sizeX}x${sizeY}x${sizeZ} has ${sizeX * sizeY * sizeZ} cells; the maximum is ${MAX_LEGO_CELLS}`,
      );
    }

    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.sizeZ = sizeZ;
    this.origin = Object.freeze([...origin]);
    this.#cells = new Uint8Array(sizeX * sizeY * sizeZ);
    Object.freeze(this);
  }

  /** Number of occupied cells. O(1). */
  get count() {
    return this.#count;
  }

  isInBounds(x, y, z) {
    return (
      Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) &&
      x >= 0 && x < this.sizeX &&
      y >= 0 && y < this.sizeY &&
      z >= 0 && z < this.sizeZ
    );
  }

  #index(x, y, z) {
    return x + this.sizeX * (z + this.sizeZ * y);
  }

  /** Is the cell occupied? Out of bounds -> false. */
  get(x, y, z) {
    return this.isInBounds(x, y, z) && this.#cells[this.#index(x, y, z)] === 1;
  }

  /** Occupy (default) or empty a cell. Out of bounds -> RangeError. Returns this. */
  set(x, y, z, occupied = true) {
    if (!this.isInBounds(x, y, z)) {
      throw new RangeError(
        `LEGO cell (${x}, ${y}, ${z}) is outside the ${this.sizeX}x${this.sizeY}x${this.sizeZ} grid`,
      );
    }
    const index = this.#index(x, y, z);
    const next = occupied ? 1 : 0;
    if (this.#cells[index] !== next) {
      this.#cells[index] = next;
      this.#count += next ? 1 : -1;
    }
    return this;
  }

  /** An empty grid with the same dimensions and origin (used for `placed`). */
  createEmptyLike() {
    return new LegoOccupancy(this.sizeX, this.sizeY, this.sizeZ, { origin: [...this.origin] });
  }

  /** Independent copy, occupancy included. */
  clone() {
    const copy = this.createEmptyLike();
    copy.#cells.set(this.#cells);
    copy.#count = this.#count;
    return copy;
  }

  /** Lazily yields {x, y, z} per occupied cell, bottom layer first (y, then z, then x). */
  *occupiedCells() {
    const cells = this.#cells;
    let index = 0;
    for (let y = 0; y < this.sizeY; y++) {
      for (let z = 0; z < this.sizeZ; z++) {
        for (let x = 0; x < this.sizeX; x++) {
          if (cells[index++] === 1) yield { x, y, z };
        }
      }
    }
  }

  /** Occupied cells in one layer (constant y). */
  countInLayer(y) {
    if (!Number.isInteger(y) || y < 0 || y >= this.sizeY) return 0;
    let total = 0;
    for (let z = 0; z < this.sizeZ; z++) {
      for (let x = 0; x < this.sizeX; x++) {
        if (this.#cells[this.#index(x, y, z)] === 1) total++;
      }
    }
    return total;
  }

  /** World position of a cell's minimum corner, as [x, y, z]. */
  cellMinCorner(x, y, z) {
    const [ox, oy, oz] = this.origin;
    return [ox + x * LEGO_CELL_SIZE[0], oy + y * LEGO_CELL_SIZE[1], oz + z * LEGO_CELL_SIZE[2]];
  }
}
