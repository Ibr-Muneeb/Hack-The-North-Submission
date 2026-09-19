import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertValidModel, validateModel } from "../lego/modelValidation.js";
import { VoxelGrid } from "../voxel/VoxelGrid.js";
import { voxelizeSphere } from "../voxel/voxelizeSphere.js";
import { brickCells, PART_3001 } from "./brickPlacement.js";
import { decomposeOccupancy, decomposeVoxelGrid } from "./decomposer.js";
import { findOverlaps, validateDecompositionResult } from "./decompositionValidation.js";
import { getDecompositionShape, voxelizeLegoBox } from "./demoShapes.js";
import { LegoOccupancy } from "./LegoOccupancy.js";

const VOXEL_SIZE = 0.2; // 5 voxels per stud, 2 per plate

/** Snapshot of a grid's occupancy, for mutation checks. */
const snapshot = (grid) => grid.getOccupiedVoxels().map(({ x, y, z }) => `${x},${y},${z}`).join("|");

/** Every LEGO cell used by a list of bricks. */
function occupiedCellKeys(bricks) {
  return bricks.flatMap((brick) =>
    brickCells(PART_3001, brick.position, brick.rotation).map(({ x, y, z }) => `${x},${y},${z}`),
  );
}

describe("decomposeVoxelGrid: exact LEGO-sized solids", () => {
  it("turns an exact 2x4 brick-sized solid into exactly one 3001 at full coverage", () => {
    const grid = voxelizeLegoBox({ studsX: 2, studsZ: 4, plates: 3, voxelSize: VOXEL_SIZE });
    const result = decomposeVoxelGrid(grid);

    assert.equal(result.bricks.length, 1);
    assert.deepEqual(result.bricks[0], {
      partId: "3001",
      type: "brick",
      width: 2,
      depth: 4,
      height: 3,
      color: "red",
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
    });
    assert.equal(result.coverageRatio, 1);
    assert.equal(result.coveredVolume, result.targetVolume);
    assert.deepEqual(result.uncoveredVoxels, []);
  });

  it("tiles a 4x4 stud solid with two bricks and no overlap", () => {
    const grid = voxelizeLegoBox({ studsX: 4, studsZ: 4, plates: 3, voxelSize: VOXEL_SIZE });
    const result = decomposeVoxelGrid(grid);

    assert.equal(result.bricks.length, 2);
    assert.equal(result.coverageRatio, 1);
    assert.deepEqual(findOverlaps(result.bricks), []);
  });

  it("tiles a larger multi-course solid completely", () => {
    // 8 x 4 studs x 6 plates = 2 courses of 4 bricks each.
    const grid = voxelizeLegoBox({ studsX: 8, studsZ: 4, plates: 6, voxelSize: VOXEL_SIZE });
    const result = decomposeVoxelGrid(grid);

    assert.equal(result.bricks.length, 8);
    assert.equal(result.coverageRatio, 1);
    assert.deepEqual(findOverlaps(result.bricks), []);
    assert.equal(result.stats.filledCells, result.stats.targetCells);
  });

  it("stacks a tall tower course by course", () => {
    const grid = voxelizeLegoBox({ studsX: 2, studsZ: 4, plates: 15, voxelSize: VOXEL_SIZE });
    const result = decomposeVoxelGrid(grid);

    assert.equal(result.bricks.length, 5);
    assert.deepEqual(result.bricks.map((b) => b.position.y), [0, 3, 6, 9, 12]);
    assert.equal(result.coverageRatio, 1);
  });

  it("works the same at a different aligned voxel size", () => {
    const coarse = decomposeVoxelGrid(voxelizeLegoBox({ studsX: 4, studsZ: 4, plates: 6, voxelSize: 0.2 }));
    const fine = decomposeVoxelGrid(voxelizeLegoBox({ studsX: 4, studsZ: 4, plates: 6, voxelSize: 0.1 }));

    assert.deepEqual(fine.bricks, coarse.bricks);
    assert.equal(fine.coverageRatio, 1);
  });

  it("leaves height that cannot hold a whole brick uncovered instead of faking it", () => {
    // 4 plates tall: one course fits, the 4th plate cannot be bricked.
    const grid = voxelizeLegoBox({ studsX: 2, studsZ: 4, plates: 4, voxelSize: VOXEL_SIZE });
    const result = decomposeVoxelGrid(grid);

    assert.equal(result.bricks.length, 1);
    assert.equal(result.coverageRatio, 0.75);
    assert.equal(result.uncoveredVoxelCount, result.targetVolume - result.coveredVolume);
    assert.ok(result.uncoveredVoxels.length > 0);
  });
});

describe("decomposeVoxelGrid: invariants", () => {
  it("is deterministic across runs", () => {
    const build = () => voxelizeLegoBox({ studsX: 6, studsZ: 6, plates: 9, voxelSize: VOXEL_SIZE });
    const a = decomposeVoxelGrid(build());
    const b = decomposeVoxelGrid(build());

    assert.equal(JSON.stringify(a.bricks), JSON.stringify(b.bricks));
    assert.equal(a.coverageRatio, b.coverageRatio);
    assert.equal(a.coveredVolume, b.coveredVolume);
  });

  it("never mutates the source VoxelGrid", () => {
    const grid = voxelizeSphere({ radius: 3, voxelSize: 0.5 });
    const before = snapshot(grid);
    const count = grid.count;

    decomposeVoxelGrid(grid);

    assert.equal(grid.count, count);
    assert.equal(snapshot(grid), before);
  });

  it("never lets bricks overlap, on any demo shape", () => {
    for (const id of ["exact-slab", "sphere", "cube", "cylinder", "staircase"]) {
      const grid = getDecompositionShape(id).generate({ voxelSize: 0.5 });
      const result = decomposeVoxelGrid(grid);

      assert.deepEqual(findOverlaps(result.bricks), [], `${id} has overlapping bricks`);
      const keys = occupiedCellKeys(result.bricks);
      assert.equal(new Set(keys).size, keys.length, `${id} reuses LEGO cells`);
    }
  });

  it("never places a brick outside the target shape", () => {
    for (const id of ["sphere", "cylinder", "staircase"]) {
      const grid = getDecompositionShape(id).generate({ voxelSize: 0.5 });
      const result = decomposeVoxelGrid(grid);
      const { valid, errors } = validateDecompositionResult(result);
      assert.equal(valid, true, `${id}: ${errors.join("; ")}`);
    }
  });

  it("produces output that matches the existing LEGO model schema", () => {
    const grid = getDecompositionShape("cube").generate({ voxelSize: 0.5 });
    const result = decomposeVoxelGrid(grid);

    assert.ok(Array.isArray(result.model.bricks));
    assert.doesNotThrow(() => assertValidModel(result.model));
    assert.equal(validateModel(result.model).valid, true);
    // Plain data only: the model survives a JSON round trip unchanged.
    assert.deepEqual(JSON.parse(JSON.stringify(result.model)), result.model);
  });

  it("reports coverage consistently with the voxel counts", () => {
    const grid = getDecompositionShape("cylinder").generate({ voxelSize: 0.5 });
    const result = decomposeVoxelGrid(grid);

    assert.equal(result.targetVolume, grid.count);
    assert.equal(result.coveredVolume + result.uncoveredVoxelCount, result.targetVolume);
    assert.equal(result.coverageRatio, result.coveredVolume / result.targetVolume);
    assert.ok(result.coverageRatio > 0 && result.coverageRatio <= 1);
  });

  it("uses a single default colour and the only supported part", () => {
    const result = decomposeVoxelGrid(voxelizeLegoBox({ studsX: 4, studsZ: 4, plates: 6, voxelSize: VOXEL_SIZE }));
    assert.equal(new Set(result.bricks.map((b) => b.color)).size, 1);
    assert.ok(result.bricks.every((b) => b.partId === "3001"));
    assert.ok(result.bricks.every((b) => [0, 90].includes(b.rotation)));
  });

  it("accepts a custom colour", () => {
    const result = decomposeVoxelGrid(
      voxelizeLegoBox({ studsX: 2, studsZ: 4, plates: 3, voxelSize: VOXEL_SIZE }),
      { color: "blue" },
    );
    assert.equal(result.bricks[0].color, "blue");
  });

  it("can be limited with maxBricks", () => {
    const grid = voxelizeLegoBox({ studsX: 8, studsZ: 8, plates: 9, voxelSize: VOXEL_SIZE });
    const result = decomposeVoxelGrid(grid, { maxBricks: 3 });

    assert.equal(result.bricks.length, 3);
    assert.ok(result.warnings.some((w) => /maxBricks/.test(w)));
  });

  it("caps the reported uncovered voxel list but keeps the count exact", () => {
    const grid = voxelizeSphere({ radius: 4, voxelSize: 0.5 });
    const result = decomposeVoxelGrid(grid, { maxUncoveredReported: 5 });

    assert.ok(result.uncoveredVoxels.length <= 5);
    assert.equal(result.coveredVolume + result.uncoveredVoxelCount, result.targetVolume);
    assert.equal(result.uncoveredTruncated, result.uncoveredVoxelCount > result.uncoveredVoxels.length);
  });
});

describe("decomposeVoxelGrid: edge cases", () => {
  it("handles an empty voxel grid", () => {
    const grid = new VoxelGrid(10, 10, 10, { voxelSize: VOXEL_SIZE });
    const result = decomposeVoxelGrid(grid);

    assert.deepEqual(result.bricks, []);
    assert.equal(result.targetVolume, 0);
    assert.equal(result.coveredVolume, 0);
    assert.equal(result.coverageRatio, 1); // nothing to cover: vacuously complete
    assert.deepEqual(result.uncoveredVoxels, []);
  });

  it("handles a single voxel", () => {
    const grid = new VoxelGrid(10, 10, 10, { voxelSize: VOXEL_SIZE });
    grid.set(0, 0, 0, true);
    const result = decomposeVoxelGrid(grid);

    assert.deepEqual(result.bricks, []);
    assert.equal(result.targetVolume, 1);
    assert.equal(result.coverageRatio, 0);
    assert.deepEqual(result.uncoveredVoxels, [{ x: 0, y: 0, z: 0 }]);
  });

  it("handles a shape smaller than one 3001 brick", () => {
    const grid = voxelizeLegoBox({ studsX: 1, studsZ: 2, plates: 3, voxelSize: VOXEL_SIZE });
    const result = decomposeVoxelGrid(grid);

    assert.deepEqual(result.bricks, []);
    assert.equal(result.coverageRatio, 0);
  });

  it("handles a shape shorter than one brick and says why", () => {
    const grid = voxelizeLegoBox({ studsX: 4, studsZ: 4, plates: 2, voxelSize: VOXEL_SIZE });
    const result = decomposeVoxelGrid(grid);

    assert.deepEqual(result.bricks, []);
    assert.ok(result.warnings.some((w) => /plate\(s\) tall/.test(w)));
  });

  it("handles a voxel grid at negative world coordinates", () => {
    const grid = new VoxelGrid(10, 6, 20, { voxelSize: VOXEL_SIZE, origin: [-5, -3, -7.5] });
    for (let y = 0; y < 6; y++) {
      for (let z = 0; z < 20; z++) for (let x = 0; x < 10; x++) grid.set(x, y, z, true);
    }
    const result = decomposeVoxelGrid(grid);

    assert.equal(result.bricks.length, 1);
    assert.equal(result.coverageRatio, 1);
    // Brick positions stay non-negative LEGO cell indices; the world offset
    // is reported separately.
    assert.deepEqual(result.bricks[0].position, { x: 0, y: 0, z: 0 });
    assert.deepEqual(result.legoGrid.origin, [-5, -3, -7.5]);
  });

  it("handles disconnected components", () => {
    // Two separate 2x4 blocks with a gap between them.
    const grid = new VoxelGrid(25, 6, 20, { voxelSize: VOXEL_SIZE });
    for (const xStart of [0, 15]) {
      for (let y = 0; y < 6; y++) {
        for (let z = 0; z < 20; z++) {
          for (let x = xStart; x < xStart + 10; x++) grid.set(x, y, z, true);
        }
      }
    }
    const result = decomposeVoxelGrid(grid);

    assert.equal(result.bricks.length, 2);
    assert.equal(result.coverageRatio, 1);
    assert.deepEqual(result.bricks.map((b) => b.position.x).sort((a, b) => a - b), [0, 3]);
  });

  it("handles a sparse shape without crashing", () => {
    const grid = new VoxelGrid(20, 20, 20, { voxelSize: VOXEL_SIZE });
    for (let i = 0; i < 20; i += 3) grid.set(i, i, i, true);
    const result = decomposeVoxelGrid(grid);

    assert.deepEqual(result.bricks, []);
    assert.equal(result.coverageRatio, 0);
  });

  it("handles non-aligned voxel sizes explicitly, with a warning", () => {
    const grid = voxelizeLegoBox({ studsX: 4, studsZ: 4, plates: 6, voxelSize: 0.5 });
    const result = decomposeVoxelGrid(grid);

    assert.equal(result.scale.aligned, false);
    assert.ok(result.warnings.some((w) => /does not divide LEGO dimensions evenly/.test(w)));
    assert.ok(result.bricks.length > 0);
    assert.deepEqual(findOverlaps(result.bricks), []);
  });

  it("rejects invalid input with clear errors instead of crashing", () => {
    assert.throws(() => decomposeVoxelGrid(null), TypeError);
    assert.throws(() => decomposeVoxelGrid({ width: 2 }), TypeError);

    const grid = voxelizeLegoBox({ voxelSize: VOXEL_SIZE });
    assert.throws(() => decomposeVoxelGrid(grid, { fillThreshold: 0 }), RangeError);
    assert.throws(() => decomposeVoxelGrid(grid, { minSupportRatio: 2 }), RangeError);
    assert.throws(() => decomposeVoxelGrid(grid, { maxBricks: 0 }), RangeError);
    assert.throws(() => decomposeVoxelGrid(grid, { color: "" }), TypeError);
  });
});

describe("decomposeOccupancy", () => {
  it("places bricks straight into a hand-built occupancy grid", () => {
    const target = new LegoOccupancy(2, 3, 4);
    for (let y = 0; y < 3; y++) {
      for (let z = 0; z < 4; z++) for (let x = 0; x < 2; x++) target.set(x, y, z, true);
    }
    const { bricks, placed, truncated } = decomposeOccupancy(target);

    assert.equal(bricks.length, 1);
    assert.equal(placed.count, 24);
    assert.equal(truncated, false);
    assert.equal(target.count, 24, "the target occupancy is not modified");
  });

  it("prefers the rotation that lets more bricks fit", () => {
    // 4 studs along X, 2 along Z: only rotation 90 fits at all.
    const target = new LegoOccupancy(4, 3, 2);
    for (let y = 0; y < 3; y++) {
      for (let z = 0; z < 2; z++) for (let x = 0; x < 4; x++) target.set(x, y, z, true);
    }
    const { bricks } = decomposeOccupancy(target);

    assert.equal(bricks.length, 1);
    assert.equal(bricks[0].rotation, 90);
    assert.deepEqual(bricks[0].position, { x: 0, y: 0, z: 0 });
  });
});
