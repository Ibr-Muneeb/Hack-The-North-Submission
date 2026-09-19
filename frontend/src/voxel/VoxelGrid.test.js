import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_CELLS, VoxelGrid } from "./VoxelGrid.js";

const key = ({ x, y, z }) => `${x},${y},${z}`;

describe("VoxelGrid: construction", () => {
  it("reports dimensions and defaults", () => {
    const grid = new VoxelGrid(3, 4, 5);
    assert.equal(grid.width, 3);
    assert.equal(grid.height, 4);
    assert.equal(grid.depth, 5);
    assert.equal(grid.voxelSize, 1);
    assert.deepEqual([...grid.origin], [0, 0, 0]);
    assert.equal(grid.count, 0);
    assert.deepEqual(grid.getOccupiedVoxels(), []);
  });

  it("rejects invalid dimensions", () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, "3", undefined]) {
      assert.throws(() => new VoxelGrid(bad, 2, 2), RangeError, `width ${bad}`);
      assert.throws(() => new VoxelGrid(2, bad, 2), RangeError, `height ${bad}`);
      assert.throws(() => new VoxelGrid(2, 2, bad), RangeError, `depth ${bad}`);
    }
  });

  it("rejects invalid voxelSize and origin", () => {
    for (const bad of [0, -0.5, NaN, Infinity]) {
      assert.throws(() => new VoxelGrid(2, 2, 2, { voxelSize: bad }), RangeError);
    }
    assert.throws(() => new VoxelGrid(2, 2, 2, { origin: [0, 0] }), TypeError);
    assert.throws(() => new VoxelGrid(2, 2, 2, { origin: [0, NaN, 0] }), TypeError);
  });

  it("refuses grids larger than MAX_CELLS", () => {
    assert.throws(() => new VoxelGrid(MAX_CELLS, 2, 1), RangeError);
  });

  it("dimensions and scale cannot be reassigned", () => {
    const grid = new VoxelGrid(2, 2, 2);
    assert.throws(() => {
      grid.width = 10;
    }, TypeError);
    assert.throws(() => {
      grid.voxelSize = 10;
    }, TypeError);
  });

  it("holds only spatial data (no LEGO / render fields)", () => {
    const grid = new VoxelGrid(2, 2, 2);
    assert.deepEqual(Object.keys(grid).sort(), ["depth", "height", "origin", "voxelSize", "width"]);
  });
});

describe("VoxelGrid: get / set / clear", () => {
  it("set then get", () => {
    const grid = new VoxelGrid(4, 4, 4);
    assert.equal(grid.get(2, 3, 1), false);
    grid.set(2, 3, 1, true);
    assert.equal(grid.get(2, 3, 1), true);
    assert.equal(grid.count, 1);
  });

  it("set defaults to occupied and returns the grid", () => {
    const grid = new VoxelGrid(2, 2, 2);
    assert.equal(grid.set(1, 1, 1), grid);
    assert.equal(grid.get(1, 1, 1), true);
  });

  it("set(false) empties, and clear empties", () => {
    const grid = new VoxelGrid(3, 3, 3);
    grid.set(1, 1, 1).set(0, 0, 0);
    grid.set(1, 1, 1, false);
    assert.equal(grid.get(1, 1, 1), false);
    grid.clear(0, 0, 0);
    assert.equal(grid.get(0, 0, 0), false);
    assert.equal(grid.count, 0);
  });

  it("count stays correct when setting/clearing repeatedly", () => {
    const grid = new VoxelGrid(3, 3, 3);
    grid.set(1, 1, 1).set(1, 1, 1);
    assert.equal(grid.count, 1);
    grid.clear(1, 1, 1).clear(1, 1, 1);
    assert.equal(grid.count, 0);
  });

  it("every cell is addressable and independent (index mapping is a bijection)", () => {
    const w = 3, h = 4, d = 5;
    const grid = new VoxelGrid(w, h, d);
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          grid.set(x, y, z);
          assert.equal(grid.count, 1);
          assert.deepEqual(grid.getOccupiedVoxels(), [{ x, y, z }]);
          grid.clear(x, y, z);
        }
      }
    }
    assert.equal(grid.count, 0);
  });

  it("corner cells work", () => {
    const grid = new VoxelGrid(3, 4, 5);
    grid.set(0, 0, 0).set(2, 3, 4);
    assert.equal(grid.get(0, 0, 0), true);
    assert.equal(grid.get(2, 3, 4), true);
    assert.equal(grid.count, 2);
  });
});

describe("VoxelGrid: out-of-bounds behaviour", () => {
  const grid = new VoxelGrid(3, 4, 5);
  grid.set(0, 0, 0).set(2, 3, 4);
  const outside = [
    [-1, 0, 0], [0, -1, 0], [0, 0, -1],
    [3, 0, 0], [0, 4, 0], [0, 0, 5],
    [0.5, 0, 0], [NaN, 0, 0], [0, Infinity, 0], ["1", 0, 0],
  ];

  it("get returns false", () => {
    for (const p of outside) assert.equal(grid.get(...p), false, JSON.stringify(p));
  });

  it("set throws RangeError and changes nothing", () => {
    for (const p of outside) assert.throws(() => grid.set(...p), RangeError, JSON.stringify(p));
    assert.equal(grid.count, 2);
  });

  it("get never aliases onto a real cell (checked against a completely full grid)", () => {
    const full = new VoxelGrid(3, 4, 5);
    for (let y = 0; y < 4; y++) for (let z = 0; z < 5; z++) for (let x = 0; x < 3; x++) full.set(x, y, z);
    for (const p of outside) assert.equal(full.get(...p), false, JSON.stringify(p));
  });

  it("clear is a harmless no-op", () => {
    for (const p of outside) grid.clear(...p);
    assert.equal(grid.count, 2);
  });

  it("isInBounds agrees", () => {
    assert.equal(grid.isInBounds(2, 3, 4), true);
    for (const p of outside) assert.equal(grid.isInBounds(...p), false);
  });
});

describe("VoxelGrid: iteration", () => {
  it("yields exactly the occupied cells, bottom layer first (y, then z, then x)", () => {
    const grid = new VoxelGrid(3, 3, 3);
    grid.set(2, 2, 2).set(0, 0, 0).set(1, 0, 0).set(0, 0, 1).set(0, 1, 0);
    assert.deepEqual(grid.getOccupiedVoxels(), [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
      { x: 2, y: 2, z: 2 },
    ]);
  });

  it("length equals count and every yielded cell is occupied", () => {
    const grid = new VoxelGrid(4, 4, 4);
    for (let i = 0; i < 4; i++) grid.set(i, i, 3 - i);
    const voxels = grid.getOccupiedVoxels();
    assert.equal(voxels.length, grid.count);
    assert.equal(new Set(voxels.map(key)).size, voxels.length);
    for (const v of voxels) assert.equal(grid.get(v.x, v.y, v.z), true);
  });

  it("the generator and array forms agree; mutating the array does not affect the grid", () => {
    const grid = new VoxelGrid(2, 2, 2).set(1, 0, 1);
    assert.deepEqual([...grid.occupiedVoxels()], grid.getOccupiedVoxels());
    const array = grid.getOccupiedVoxels();
    array[0].x = 0;
    array.pop();
    assert.equal(grid.get(1, 0, 1), true);
    assert.equal(grid.count, 1);
  });

  it("occupied bounds: null when empty, inclusive min/max otherwise", () => {
    const grid = new VoxelGrid(5, 5, 5);
    assert.equal(grid.getOccupiedBounds(), null);
    grid.set(1, 2, 3).set(3, 2, 1);
    assert.deepEqual(grid.getOccupiedBounds(), {
      min: { x: 1, y: 2, z: 1 },
      max: { x: 3, y: 2, z: 3 },
    });
  });
});

describe("VoxelGrid: clone", () => {
  it("copies occupancy and settings, then evolves independently", () => {
    const grid = new VoxelGrid(3, 3, 3, { voxelSize: 0.25, origin: [1, 2, 3] });
    grid.set(1, 1, 1);
    const copy = grid.clone();
    assert.equal(copy.count, 1);
    assert.equal(copy.voxelSize, 0.25);
    assert.deepEqual([...copy.origin], [1, 2, 3]);
    copy.set(0, 0, 0);
    grid.clear(1, 1, 1);
    assert.equal(grid.count, 0);
    assert.equal(grid.get(0, 0, 0), false);
    assert.equal(copy.get(1, 1, 1), true);
    assert.equal(copy.count, 2);
  });
});

describe("VoxelGrid: grid <-> world conversion", () => {
  it("defaults: 1 voxel = 1 world unit, origin at 0", () => {
    const grid = new VoxelGrid(4, 4, 4);
    assert.deepEqual(grid.voxelMinCorner(2, 3, 1), [2, 3, 1]);
    assert.deepEqual(grid.voxelCenter(2, 3, 1), [2.5, 3.5, 1.5]);
  });

  it("voxelSize 0.5 means each voxel is a 0.5 x 0.5 x 0.5 cube", () => {
    const grid = new VoxelGrid(4, 4, 4, { voxelSize: 0.5 });
    const a = grid.voxelMinCorner(0, 0, 0);
    // neighbours along each axis are exactly one voxelSize apart
    assert.deepEqual(grid.voxelMinCorner(1, 0, 0).map((v, i) => v - a[i]), [0.5, 0, 0]);
    assert.deepEqual(grid.voxelMinCorner(0, 1, 0).map((v, i) => v - a[i]), [0, 0.5, 0]);
    assert.deepEqual(grid.voxelMinCorner(0, 0, 1).map((v, i) => v - a[i]), [0, 0, 0.5]);
    // centre is half a voxel from the min corner on every axis
    assert.deepEqual(grid.voxelCenter(0, 0, 0), [0.25, 0.25, 0.25]);
    assert.deepEqual(grid.voxelCenter(3, 2, 1), [1.75, 1.25, 0.75]);
  });

  it("origin shifts the whole grid", () => {
    const grid = new VoxelGrid(2, 2, 2, { voxelSize: 2, origin: [10, -4, 0.5] });
    assert.deepEqual(grid.voxelMinCorner(0, 0, 0), [10, -4, 0.5]);
    assert.deepEqual(grid.voxelMinCorner(1, 1, 1), [12, -2, 2.5]);
    assert.deepEqual(grid.voxelCenter(1, 0, 0), [13, -3, 1.5]);
  });

  it("worldToVoxel inverts voxelCenter and voxelMinCorner for awkward sizes too", () => {
    for (const voxelSize of [1, 0.5, 0.4, 0.2, 0.1, 0.3, 0.7]) {
      const grid = new VoxelGrid(12, 9, 7, { voxelSize, origin: [-1.3, 0.2, 4] });
      for (let y = 0; y < grid.height; y++) {
        for (let z = 0; z < grid.depth; z++) {
          for (let x = 0; x < grid.width; x++) {
            assert.deepEqual(grid.worldToVoxel(...grid.voxelCenter(x, y, z)), { x, y, z }, `center @ ${voxelSize}`);
            assert.deepEqual(grid.worldToVoxel(...grid.voxelMinCorner(x, y, z)), { x, y, z }, `min @ ${voxelSize}`);
          }
        }
      }
    }
  });

  it("a point on a shared face belongs to the higher cell; points just below stay in the lower", () => {
    const grid = new VoxelGrid(4, 4, 4, { voxelSize: 0.5 });
    assert.deepEqual(grid.worldToVoxel(0.5, 0.5, 0.5), { x: 1, y: 1, z: 1 });
    assert.deepEqual(grid.worldToVoxel(0.4999, 0.4999, 0.4999), { x: 0, y: 0, z: 0 });
  });

  it("worldToVoxel is not clamped", () => {
    const grid = new VoxelGrid(2, 2, 2);
    const v = grid.worldToVoxel(-0.1, 5.5, 1.9);
    assert.deepEqual(v, { x: -1, y: 5, z: 1 });
    assert.equal(grid.isInBounds(v.x, v.y, v.z), false);
  });

  it("getWorldBounds covers every cell, for non-cubic grids", () => {
    const grid = new VoxelGrid(2, 4, 6, { voxelSize: 0.5, origin: [1, 0, -1] });
    const { min, max, size, center } = grid.getWorldBounds();
    assert.deepEqual(min, [1, 0, -1]);
    assert.deepEqual(size, [1, 2, 3]);
    assert.deepEqual(max, [2, 2, 2]);
    assert.deepEqual(center, [1.5, 1, 0.5]);
    // last cell's far corner lands exactly on max
    const last = grid.voxelMinCorner(1, 3, 5).map((v) => v + grid.voxelSize);
    assert.deepEqual(last, max);
  });
});
