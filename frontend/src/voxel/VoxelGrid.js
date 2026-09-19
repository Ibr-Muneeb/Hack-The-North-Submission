/**
 * VOXEL GRID
 * ==========
 *
 * A dense 3D grid of on/off cells. Plain JavaScript: nothing in src/voxel
 * imports Three.js, React, or anything from src/lego. A voxel is *only*
 * "this cell is occupied" - no colour, no part id, no mesh. Later stages
 * (brick selection, rendering) read a VoxelGrid; they never live inside it.
 *
 * ---- Two coordinate spaces ----------------------------------------------
 *
 * GRID space (what get / set / clear / occupiedVoxels use)
 *   Integer cell coordinates (x, y, z) with
 *     0 <= x < width,  0 <= y < height,  0 <= z < depth
 *   X and Z are horizontal, +Y is up. Cell (0, 0, 0) is the minimum corner
 *   and y = 0 is the floor layer.
 *
 * WORLD space (what the renderer uses)
 *   Same axes as the rest of Brickify: X/Z horizontal, +Y up, and the same
 *   world unit as the LEGO viewer (1 unit = 1 stud = 8 mm).
 *   Every voxel is a CUBE with edge length `voxelSize` world units.
 *
 *   Cell (x, y, z) occupies the half-open box
 *     [origin + x*s, origin + (x+1)*s)  along X   (likewise Y and Z)
 *   where s = voxelSize and `origin` is the world position of the minimum
 *   corner of cell (0, 0, 0). So:
 *     voxelMinCorner(x, y, z) = origin + (x,     y,     z    ) * s
 *     voxelCenter(x, y, z)    = origin + (x+0.5, y+0.5, z+0.5) * s
 *   and worldToVoxel() is the inverse (floor). A point exactly on a face
 *   shared by two cells belongs to the cell with the HIGHER index.
 *
 * NOTE: this is deliberately not the LEGO grid. A LEGO cell is 1 stud x
 * 1 plate x 1 stud, i.e. 1 x 0.4 x 1 world units - not a cube. Voxels are
 * cubes so shapes keep their proportions; turning voxels into bricks (a
 * later milestone) means resampling between the two. A voxelSize of 0.2
 * divides both a stud (5x) and a plate (2x), which makes it a natural
 * choice for that step.
 *
 * ---- Out-of-bounds behaviour --------------------------------------------
 *   get(...)   -> false        "nothing is there" (handy for neighbour tests)
 *   clear(...) -> no-op        nothing there to clear
 *   set(...)   -> RangeError   silently dropping a write would hide bugs
 * Non-integer or NaN coordinates count as out of bounds.
 *
 * ---- Storage & iteration order ------------------------------------------
 * One byte per cell in a Uint8Array, indexed  x + width * (z + depth * y).
 * Iteration therefore walks the grid layer by layer from the bottom (y
 * slowest), then z, then x - the natural order for building bottom-up.
 */

/** Refuse absurd grids (2^25 cells = 32 MB) instead of freezing the tab. */
export const MAX_CELLS = 2 ** 25;

const EPSILON = 1e-9; // absorbs float error in worldToVoxel (e.g. 0.3 / 0.1)

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`VoxelGrid ${name} must be a positive integer, got ${value}`);
  }
}

export class VoxelGrid {
  #cells;
  #count = 0;

  /**
   * @param {number} width   cells along X
   * @param {number} height  cells along Y (up)
   * @param {number} depth   cells along Z
   * @param {object} [options]
   * @param {number} [options.voxelSize=1]  edge length of one voxel, world units
   * @param {number[]} [options.origin=[0,0,0]]  world position of cell (0,0,0)'s min corner
   */
  constructor(width, height, depth, { voxelSize = 1, origin = [0, 0, 0] } = {}) {
    assertPositiveInteger("width", width);
    assertPositiveInteger("height", height);
    assertPositiveInteger("depth", depth);

    if (!Number.isFinite(voxelSize) || voxelSize <= 0) {
      throw new RangeError(`VoxelGrid voxelSize must be a positive finite number, got ${voxelSize}`);
    }
    if (!Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)) {
      throw new TypeError(`VoxelGrid origin must be [x, y, z] of finite numbers, got ${JSON.stringify(origin)}`);
    }
    if (width * height * depth > MAX_CELLS) {
      throw new RangeError(
        `VoxelGrid ${width}x${height}x${depth} has ${width * height * depth} cells; the maximum is ${MAX_CELLS}`,
      );
    }

    this.width = width;
    this.height = height;
    this.depth = depth;
    this.voxelSize = voxelSize;
    this.origin = Object.freeze([...origin]);
    this.#cells = new Uint8Array(width * height * depth);

    // Dimensions and scale are fixed for the life of the grid. (Private
    // fields are unaffected by freeze, so set/clear still work.)
    Object.freeze(this);
  }

  // ---- cells ------------------------------------------------------------

  /** Number of occupied cells. O(1). */
  get count() {
    return this.#count;
  }

  isInBounds(x, y, z) {
    return (
      Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) &&
      x >= 0 && x < this.width &&
      y >= 0 && y < this.height &&
      z >= 0 && z < this.depth
    );
  }

  #index(x, y, z) {
    return x + this.width * (z + this.depth * y);
  }

  /** Is the cell occupied? Out of bounds -> false. */
  get(x, y, z) {
    return this.isInBounds(x, y, z) && this.#cells[this.#index(x, y, z)] === 1;
  }

  /** Occupy (default) or empty a cell. Out of bounds -> RangeError. Returns this. */
  set(x, y, z, occupied = true) {
    if (!this.isInBounds(x, y, z)) {
      throw new RangeError(
        `Voxel (${x}, ${y}, ${z}) is outside the ${this.width}x${this.height}x${this.depth} grid`,
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

  /** Empty a cell. Out of bounds -> no-op. Returns this. */
  clear(x, y, z) {
    if (this.isInBounds(x, y, z)) this.set(x, y, z, false);
    return this;
  }

  /** Independent copy (same dimensions, voxelSize, origin, occupancy). */
  clone() {
    const copy = new VoxelGrid(this.width, this.height, this.depth, {
      voxelSize: this.voxelSize,
      origin: [...this.origin],
    });
    copy.#cells.set(this.#cells);
    copy.#count = this.#count;
    return copy;
  }

  // ---- iteration --------------------------------------------------------

  /** Lazily yields a fresh {x, y, z} per occupied cell, bottom layer first. */
  *occupiedVoxels() {
    const cells = this.#cells;
    let index = 0;
    for (let y = 0; y < this.height; y++) {
      for (let z = 0; z < this.depth; z++) {
        for (let x = 0; x < this.width; x++) {
          if (cells[index++] === 1) yield { x, y, z };
        }
      }
    }
  }

  /** All occupied cells as an array of {x, y, z}, in the same order. */
  getOccupiedVoxels() {
    return Array.from(this.occupiedVoxels());
  }

  /**
   * Inclusive grid-space bounding box of the occupied cells:
   * { min: {x,y,z}, max: {x,y,z} }, or null if the grid is empty.
   */
  getOccupiedBounds() {
    if (this.#count === 0) return null;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const { x, y, z } of this.occupiedVoxels()) {
      if (x < min.x) min.x = x;
      if (y < min.y) min.y = y;
      if (z < min.z) min.z = z;
      if (x > max.x) max.x = x;
      if (y > max.y) max.y = y;
      if (z > max.z) max.z = z;
    }
    return { min, max };
  }

  // ---- grid <-> world ---------------------------------------------------

  /** World position of a cell's minimum corner, as [x, y, z]. */
  voxelMinCorner(x, y, z) {
    const s = this.voxelSize;
    const [ox, oy, oz] = this.origin;
    return [ox + x * s, oy + y * s, oz + z * s];
  }

  /** World position of a cell's centre, as [x, y, z]. */
  voxelCenter(x, y, z) {
    const s = this.voxelSize;
    const [ox, oy, oz] = this.origin;
    return [ox + (x + 0.5) * s, oy + (y + 0.5) * s, oz + (z + 0.5) * s];
  }

  /**
   * The cell containing a world point, as {x, y, z}. NOT clamped: the result
   * may be outside the grid, so check with isInBounds() if that matters.
   */
  worldToVoxel(wx, wy, wz) {
    const s = this.voxelSize;
    const [ox, oy, oz] = this.origin;
    return {
      x: Math.floor((wx - ox) / s + EPSILON),
      y: Math.floor((wy - oy) / s + EPSILON),
      z: Math.floor((wz - oz) / s + EPSILON),
    };
  }

  /** World-space box of the whole grid (all cells, occupied or not). */
  getWorldBounds() {
    const s = this.voxelSize;
    const min = [...this.origin];
    const size = [this.width * s, this.height * s, this.depth * s];
    const max = min.map((v, i) => v + size[i]);
    const center = min.map((v, i) => v + size[i] / 2);
    return { min, max, size, center };
  }
}
