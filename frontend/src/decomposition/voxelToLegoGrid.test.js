import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VoxelGrid } from "../voxel/VoxelGrid.js";
import { LegoOccupancy } from "./LegoOccupancy.js";
import {
  describeVoxelScale,
  legoGridSizeFor,
  voxelGridToLegoOccupancy,
  worldToLegoCell,
} from "./voxelToLegoGrid.js";

/** A grid with every cell occupied. */
function solid(width, height, depth, options) {
  const grid = new VoxelGrid(width, height, depth, options);
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) grid.set(x, y, z, true);
    }
  }
  return grid;
}

describe("describeVoxelScale", () => {
  it("maps 0.2 to 5 voxels per stud and 2 per plate", () => {
    const scale = describeVoxelScale(0.2);
    assert.equal(scale.voxelsPerStud, 5);
    assert.equal(Math.round(scale.voxelsPerPlate), 2);
    assert.equal(scale.aligned, true);
  });

  it("handles other aligned sizes without hard-coding 0.2", () => {
    const scale = describeVoxelScale(0.1);
    assert.equal(scale.voxelsPerStud, 10);
    assert.equal(Math.round(scale.voxelsPerPlate), 4);
    assert.equal(scale.aligned, true);
  });

  it("reports sizes that do not divide LEGO dimensions evenly", () => {
    const scale = describeVoxelScale(0.5);
    assert.equal(scale.voxelsPerStud, 2);
    assert.equal(scale.studAligned, true);
    assert.equal(scale.plateAligned, false); // 0.4 / 0.5 = 0.8
    assert.equal(scale.aligned, false);
  });

  it("rejects invalid voxel sizes", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      assert.throws(() => describeVoxelScale(bad), RangeError);
    }
  });
});

describe("legoGridSizeFor", () => {
  it("covers the voxel grid's world box, rounding up to whole LEGO cells", () => {
    // 10 x 6 x 20 voxels at 0.2 = 2 x 1.2 x 4 world units = 2 studs x 3 plates x 4 studs.
    assert.deepEqual(legoGridSizeFor(solid(10, 6, 20, { voxelSize: 0.2 })), {
      sizeX: 2, sizeY: 3, sizeZ: 4,
    });
  });

  it("rounds a partial LEGO cell up rather than dropping it", () => {
    // 1 voxel of 0.2 => 0.2 world units => still needs one whole stud/plate cell.
    assert.deepEqual(legoGridSizeFor(solid(1, 1, 1, { voxelSize: 0.2 })), {
      sizeX: 1, sizeY: 1, sizeZ: 1,
    });
  });

  it("is driven by world size, not by cell counts", () => {
    // Same cell count, different voxel size => different LEGO grid.
    assert.deepEqual(legoGridSizeFor(solid(10, 10, 10, { voxelSize: 1 })), {
      sizeX: 10, sizeY: 25, sizeZ: 10,
    });
  });
});

describe("worldToLegoCell", () => {
  it("converts world points using 1 stud / 0.4 plate", () => {
    assert.deepEqual(worldToLegoCell([0, 0, 0]), { x: 0, y: 0, z: 0 });
    assert.deepEqual(worldToLegoCell([1.5, 0.5, 2.25]), { x: 1, y: 1, z: 2 });
    assert.deepEqual(worldToLegoCell([0, 1.2, 0]), { x: 0, y: 3, z: 0 });
  });

  it("puts a point exactly on a boundary in the higher cell", () => {
    assert.equal(worldToLegoCell([1, 0, 0]).x, 1);
    assert.equal(worldToLegoCell([0, 0.4, 0]).y, 1);
  });

  it("respects a non-zero (and negative) origin", () => {
    assert.deepEqual(worldToLegoCell([-3, -1.2, -3], [-3, -1.2, -3]), { x: 0, y: 0, z: 0 });
    assert.deepEqual(worldToLegoCell([-2, -0.8, -1], [-3, -1.2, -3]), { x: 1, y: 1, z: 2 });
  });
});

describe("voxelGridToLegoOccupancy: aligned voxel sizes", () => {
  it("turns an exact 2x4 brick-sized solid into a full 2 x 3 x 4 LEGO block", () => {
    const grid = solid(10, 6, 20, { voxelSize: 0.2 }); // 2 studs x 3 plates x 4 studs
    const { occupancy, scale, warnings } = voxelGridToLegoOccupancy(grid);

    assert.ok(occupancy instanceof LegoOccupancy);
    assert.equal(scale.aligned, true);
    assert.deepEqual(warnings, []);
    assert.deepEqual(
      [occupancy.sizeX, occupancy.sizeY, occupancy.sizeZ],
      [2, 3, 4],
    );
    assert.equal(occupancy.count, 2 * 3 * 4);
  });

  it("gives the same LEGO block for a different (but aligned) voxel size", () => {
    const coarse = voxelGridToLegoOccupancy(solid(10, 6, 20, { voxelSize: 0.2 })).occupancy;
    const fine = voxelGridToLegoOccupancy(solid(20, 12, 40, { voxelSize: 0.1 })).occupancy;

    assert.deepEqual(
      [fine.sizeX, fine.sizeY, fine.sizeZ],
      [coarse.sizeX, coarse.sizeY, coarse.sizeZ],
    );
    assert.equal(fine.count, coarse.count);
  });

  it("leaves a LEGO cell empty when at most half of its volume is occupied", () => {
    // One stud x one plate needs 5 x 2 x 5 = 50 voxels at 0.2; fill only 20.
    const grid = new VoxelGrid(5, 2, 5, { voxelSize: 0.2 });
    for (let z = 0; z < 2; z++) {
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 5; x++) grid.set(x, y, z, true);
      }
    }
    assert.equal(grid.count, 20);
    assert.equal(voxelGridToLegoOccupancy(grid).occupancy.count, 0);

    // The same 20 voxels (40% of the cell) are enough at a lower threshold.
    assert.equal(voxelGridToLegoOccupancy(grid, { fillThreshold: 0.3 }).occupancy.count, 1);
    // ...but not at exactly 40%: the comparison is strict.
    assert.equal(voxelGridToLegoOccupancy(grid, { fillThreshold: 0.4 }).occupancy.count, 0);
  });

  it("rounds an exactly-half-full cell DOWN, so the shape never inflates", () => {
    // A surface landing exactly on a cell midpoint is a tie. Milestone 5 broke
    // it toward "occupied", which grew every such boundary by one cell and made
    // staircase treads look shifted along +X. M6 breaks it toward "empty".
    const grid = new VoxelGrid(5, 2, 5, { voxelSize: 0.2 });
    for (let z = 0; z < 5; z++) {
      for (let x = 0; x < 5; x++) grid.set(x, 0, z, true); // exactly half the height
    }
    assert.equal(grid.count, 25);
    assert.equal(voxelGridToLegoOccupancy(grid).occupancy.count, 0);

    // One more voxel layer tips it past half.
    grid.set(0, 1, 0, true);
    assert.equal(voxelGridToLegoOccupancy(grid).occupancy.count, 1);
  });

  it("fills a cell that is completely full, whatever the threshold", () => {
    const grid = solid(5, 2, 5, { voxelSize: 0.2 });
    assert.equal(voxelGridToLegoOccupancy(grid, { fillThreshold: 1 }).occupancy.count, 1);
  });

  it("carries the voxel grid's origin, including negative world coordinates", () => {
    const grid = solid(10, 6, 20, { voxelSize: 0.2, origin: [-4, -1.2, -2] });
    const { occupancy } = voxelGridToLegoOccupancy(grid);
    assert.deepEqual([...occupancy.origin], [-4, -1.2, -2]);
    // Cell indices stay non-negative even though the world origin is negative.
    assert.equal(occupancy.get(0, 0, 0), true);
    assert.deepEqual(occupancy.cellMinCorner(0, 0, 0), [-4, -1.2, -2]);
  });

  it("never modifies the source voxel grid", () => {
    const grid = solid(10, 6, 20, { voxelSize: 0.2 });
    const before = grid.getOccupiedVoxels();
    voxelGridToLegoOccupancy(grid);
    assert.equal(grid.count, before.length);
    assert.deepEqual(grid.getOccupiedVoxels(), before);
  });
});

describe("voxelGridToLegoOccupancy: non-aligned voxel sizes", () => {
  it("still produces a result, but warns explicitly", () => {
    const grid = solid(4, 4, 4, { voxelSize: 0.5 }); // 0.4 / 0.5 is not a whole number
    const { occupancy, scale, warnings } = voxelGridToLegoOccupancy(grid);

    assert.equal(scale.aligned, false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /does not divide LEGO dimensions evenly/);
    assert.ok(occupancy.count > 0);
  });

  it("splits voxels across LEGO cells by volume rather than snapping them", () => {
    // 1 voxel of 0.5 spans plates 0 (full) and 1 (0.1 of 0.4 = 25%): only
    // the first LEGO cell reaches the 50% threshold.
    const grid = new VoxelGrid(2, 1, 2, { voxelSize: 0.5 });
    for (let z = 0; z < 2; z++) for (let x = 0; x < 2; x++) grid.set(x, 0, z, true);

    const { occupancy } = voxelGridToLegoOccupancy(grid);
    assert.equal(occupancy.get(0, 0, 0), true);
    assert.equal(occupancy.get(0, 1, 0), false);
  });

  it("rejects invalid arguments instead of guessing", () => {
    assert.throws(() => voxelGridToLegoOccupancy(null), TypeError);
    assert.throws(() => voxelGridToLegoOccupancy({}), TypeError);
    assert.throws(
      () => voxelGridToLegoOccupancy(solid(2, 2, 2, { voxelSize: 0.2 }), { fillThreshold: 0 }),
      RangeError,
    );
    assert.throws(
      () => voxelGridToLegoOccupancy(solid(2, 2, 2, { voxelSize: 0.2 }), { fillThreshold: 2 }),
      RangeError,
    );
  });
});

describe("LegoOccupancy", () => {
  it("stores and reports cells, treating out of bounds as empty", () => {
    const occupancy = new LegoOccupancy(2, 3, 4);
    assert.equal(occupancy.count, 0);
    occupancy.set(1, 2, 3, true);
    assert.equal(occupancy.get(1, 2, 3), true);
    assert.equal(occupancy.count, 1);
    assert.equal(occupancy.get(5, 5, 5), false);
    assert.equal(occupancy.get(-1, 0, 0), false);
    assert.equal(occupancy.get(0.5, 0, 0), false);
  });

  it("throws when writing out of bounds", () => {
    const occupancy = new LegoOccupancy(2, 2, 2);
    assert.throws(() => occupancy.set(2, 0, 0, true), RangeError);
    assert.throws(() => occupancy.set(0, -1, 0, true), RangeError);
  });

  it("iterates bottom layer first", () => {
    const occupancy = new LegoOccupancy(2, 2, 2);
    occupancy.set(1, 1, 1, true);
    occupancy.set(0, 0, 0, true);
    assert.deepEqual([...occupancy.occupiedCells()], [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    ]);
  });

  it("counts a single layer", () => {
    const occupancy = new LegoOccupancy(2, 2, 2);
    occupancy.set(0, 0, 0, true).set(1, 0, 0, true).set(0, 1, 0, true);
    assert.equal(occupancy.countInLayer(0), 2);
    assert.equal(occupancy.countInLayer(1), 1);
    assert.equal(occupancy.countInLayer(9), 0);
  });

  it("clones and creates empty siblings independently", () => {
    const occupancy = new LegoOccupancy(2, 2, 2, { origin: [1, 2, 3] });
    occupancy.set(0, 0, 0, true);

    const copy = occupancy.clone();
    copy.set(1, 1, 1, true);
    assert.equal(occupancy.get(1, 1, 1), false);
    assert.equal(copy.get(0, 0, 0), true);

    const empty = occupancy.createEmptyLike();
    assert.equal(empty.count, 0);
    assert.deepEqual([...empty.origin], [1, 2, 3]);
  });
});
