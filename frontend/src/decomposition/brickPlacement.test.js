import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LegoOccupancy } from "./LegoOccupancy.js";
import {
  brickCells,
  canPlaceBrick,
  footingRatio,
  getPart,
  isValidRotation,
  markPlaced,
  PART_3001,
  placementFootprint,
  REJECTED,
  supportRatio,
  toModelBrick,
  VALID_ROTATIONS,
} from "./brickPlacement.js";

/** A fully occupied target of the given LEGO cell size. */
function target(sizeX, sizeY, sizeZ) {
  const occupancy = new LegoOccupancy(sizeX, sizeY, sizeZ);
  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) occupancy.set(x, y, z, true);
    }
  }
  return occupancy;
}

const at = (x, y, z, rotation = 0) => ({ partId: "3001", position: { x, y, z }, rotation });

describe("part 3001", () => {
  it("matches the existing LEGO model convention for a 2x4 brick", () => {
    assert.equal(PART_3001.partId, "3001");
    assert.equal(PART_3001.width, 2);
    assert.equal(PART_3001.depth, 4);
    assert.equal(PART_3001.height, 3);
    assert.equal(getPart("3001"), PART_3001);
    assert.equal(getPart("9999"), null);
    assert.equal(getPart(undefined), null);
  });

  it("accepts only quarter turns", () => {
    assert.deepEqual([...VALID_ROTATIONS], [0, 90, 180, 270]);
    for (const rotation of VALID_ROTATIONS) assert.equal(isValidRotation(rotation), true);
    for (const bad of [45, 30, -90, 360, 1.5, NaN, "90"]) {
      assert.equal(isValidRotation(bad), false, `rotation ${bad}`);
    }
  });
});

describe("footprint and cells", () => {
  it("swaps the footprint on a quarter turn", () => {
    assert.deepEqual(placementFootprint(PART_3001, 0), { width: 2, depth: 4 });
    assert.deepEqual(placementFootprint(PART_3001, 90), { width: 4, depth: 2 });
    assert.deepEqual(placementFootprint(PART_3001, 180), { width: 2, depth: 4 });
    assert.deepEqual(placementFootprint(PART_3001, 270), { width: 4, depth: 2 });
  });

  it("occupies 24 cells measured from the min corner of the rotated footprint", () => {
    const cells = brickCells(PART_3001, { x: 0, y: 0, z: 0 }, 0);
    assert.equal(cells.length, 24);
    assert.ok(cells.some((c) => c.x === 1 && c.y === 2 && c.z === 3));
    assert.ok(!cells.some((c) => c.x === 2));
    assert.ok(!cells.some((c) => c.z === 4));

    const rotated = brickCells(PART_3001, { x: 0, y: 0, z: 0 }, 90);
    assert.equal(rotated.length, 24);
    assert.ok(rotated.some((c) => c.x === 3 && c.z === 1));
    assert.ok(!rotated.some((c) => c.z === 2));
  });

  it("offsets every cell by the position", () => {
    const cells = brickCells(PART_3001, { x: 5, y: 3, z: 2 }, 0);
    assert.ok(cells.every((c) => c.x >= 5 && c.y >= 3 && c.z >= 2));
    assert.ok(cells.some((c) => c.x === 6 && c.y === 5 && c.z === 5));
  });

  it("gives 180/270 the same cells as 0/90 (a 2x4 is symmetric)", () => {
    const key = (cells) => cells.map((c) => `${c.x},${c.y},${c.z}`).sort().join("|");
    assert.equal(
      key(brickCells(PART_3001, { x: 1, y: 0, z: 1 }, 0)),
      key(brickCells(PART_3001, { x: 1, y: 0, z: 1 }, 180)),
    );
    assert.equal(
      key(brickCells(PART_3001, { x: 1, y: 0, z: 1 }, 90)),
      key(brickCells(PART_3001, { x: 1, y: 0, z: 1 }, 270)),
    );
  });
});

describe("canPlaceBrick: validity", () => {
  it("accepts a valid placement on the ground layer", () => {
    const result = canPlaceBrick({ target: target(2, 3, 4), placed: null }, at(0, 0, 0));
    assert.equal(result.ok, true);
    assert.equal(result.reason, null);
    assert.equal(result.cells.length, 24);
    assert.equal(result.support, 1);
    assert.equal(result.footing, 1);
  });

  it("accepts a 90 degree rotation that fits the other way round", () => {
    const wide = target(4, 3, 2); // 4 studs x 2 studs: only the rotated brick fits
    assert.equal(canPlaceBrick({ target: wide }, at(0, 0, 0, 90)).ok, true);
    assert.equal(canPlaceBrick({ target: wide }, at(0, 0, 0, 0)).reason, REJECTED.BOUNDS);
  });

  it("accepts 180 and 270 as legal rotations", () => {
    assert.equal(canPlaceBrick({ target: target(2, 3, 4) }, at(0, 0, 0, 180)).ok, true);
    assert.equal(canPlaceBrick({ target: target(4, 3, 2) }, at(0, 0, 0, 270)).ok, true);
  });

  it("rejects an unsupported part id", () => {
    const result = canPlaceBrick({ target: target(4, 3, 4) }, { partId: "9999", position: { x: 0, y: 0, z: 0 } });
    assert.equal(result.ok, false);
    assert.equal(result.reason, REJECTED.PART);
  });

  it("rejects a rotation that is not a quarter turn", () => {
    const result = canPlaceBrick({ target: target(4, 3, 4) }, at(0, 0, 0, 45));
    assert.equal(result.ok, false);
    assert.equal(result.reason, REJECTED.ROTATION);
  });

  it("rejects non-integer or missing positions", () => {
    const t = target(4, 3, 4);
    assert.equal(canPlaceBrick({ target: t }, { partId: "3001", position: { x: 0.5, y: 0, z: 0 } }).reason, REJECTED.POSITION);
    assert.equal(canPlaceBrick({ target: t }, { partId: "3001" }).reason, REJECTED.POSITION);
  });

  it("rejects a placement that runs outside the grid", () => {
    const t = target(2, 3, 4);
    assert.equal(canPlaceBrick({ target: t }, at(1, 0, 0)).reason, REJECTED.BOUNDS);
    assert.equal(canPlaceBrick({ target: t }, at(0, 0, 1)).reason, REJECTED.BOUNDS);
    assert.equal(canPlaceBrick({ target: t }, at(-1, 0, 0)).reason, REJECTED.BOUNDS);
    assert.equal(canPlaceBrick({ target: t }, at(0, 1, 0)).reason, REJECTED.BOUNDS); // needs 3 plates
  });

  it("rejects a placement through empty space", () => {
    const empty = new LegoOccupancy(4, 3, 4);
    assert.equal(canPlaceBrick({ target: empty }, at(0, 0, 0)).reason, REJECTED.OUTSIDE_TARGET);
  });

  it("rejects a placement where part of the target volume is missing", () => {
    const t = target(2, 3, 4);
    t.set(1, 2, 3, false); // one corner cell hollowed out
    assert.equal(canPlaceBrick({ target: t }, at(0, 0, 0)).reason, REJECTED.OUTSIDE_TARGET);
  });

  it("rejects an overlapping placement", () => {
    const t = target(4, 3, 4);
    const placed = t.createEmptyLike();
    markPlaced(placed, canPlaceBrick({ target: t, placed }, at(0, 0, 0)).cells);

    assert.equal(canPlaceBrick({ target: t, placed }, at(0, 0, 0)).reason, REJECTED.OVERLAP);
    assert.equal(canPlaceBrick({ target: t, placed }, at(1, 0, 0)).reason, REJECTED.OVERLAP);
    // ...but the free half of the grid is still available.
    assert.equal(canPlaceBrick({ target: t, placed }, at(2, 0, 0)).ok, true);
  });

  it("accepts a bare LegoOccupancy as the target (no placed grid)", () => {
    assert.equal(canPlaceBrick(target(2, 3, 4), at(0, 0, 0)).ok, true);
  });

  it("rejects a malformed context", () => {
    assert.throws(() => canPlaceBrick(null, at(0, 0, 0)), TypeError);
    assert.throws(() => canPlaceBrick({ target: {} }, at(0, 0, 0)), TypeError);
  });
});

describe("canPlaceBrick: support", () => {
  it("always supports the bottom layer", () => {
    const result = canPlaceBrick({ target: target(2, 6, 4), placed: new LegoOccupancy(2, 6, 4) }, at(0, 0, 0));
    assert.equal(result.ok, true);
    assert.equal(result.support, 1);
  });

  it("rejects a brick floating in empty air", () => {
    // Target: a 2x4 footprint on the ground and another one two courses up,
    // with nothing in between, so the upper one has no footing.
    const t = new LegoOccupancy(2, 9, 4);
    for (const y of [0, 1, 2, 6, 7, 8]) {
      for (let z = 0; z < 4; z++) for (let x = 0; x < 2; x++) t.set(x, y, z, true);
    }
    const placed = t.createEmptyLike();
    markPlaced(placed, canPlaceBrick({ target: t, placed }, at(0, 0, 0)).cells);

    const floating = canPlaceBrick({ target: t, placed }, at(0, 6, 0));
    assert.equal(floating.ok, false);
    assert.equal(floating.reason, REJECTED.UNSUPPORTED);
  });

  it("accepts an upper brick that rests on a placed brick", () => {
    const t = target(2, 6, 4);
    const placed = t.createEmptyLike();
    markPlaced(placed, canPlaceBrick({ target: t, placed }, at(0, 0, 0)).cells);

    const upper = canPlaceBrick({ target: t, placed }, at(0, 3, 0));
    assert.equal(upper.ok, true);
    assert.equal(upper.support, 1);
    assert.equal(upper.footing, 1);
  });

  it("accepts an upper brick resting on target geometry no brick could fill", () => {
    // A 1-stud-wide pedestal (too narrow for a 2x4) under a full-width slab.
    const t = new LegoOccupancy(2, 6, 4);
    for (let z = 0; z < 4; z++) t.set(0, 0, z, true).set(0, 1, z, true).set(0, 2, z, true);
    for (let y = 3; y < 6; y++) {
      for (let z = 0; z < 4; z++) for (let x = 0; x < 2; x++) t.set(x, y, z, true);
    }
    const placed = t.createEmptyLike();

    const result = canPlaceBrick({ target: t, placed }, at(0, 3, 0));
    assert.equal(result.ok, true);
    assert.equal(result.support, 0);   // nothing placed beneath yet
    assert.equal(result.footing, 0.5); // half the footprint has target geometry below
  });

  it("rejects an upper brick whose footing is below the minimum ratio", () => {
    const t = new LegoOccupancy(2, 6, 4);
    for (let z = 0; z < 4; z++) t.set(0, 2, z, true); // thin ledge, 50% of the footprint
    for (let y = 3; y < 6; y++) {
      for (let z = 0; z < 4; z++) for (let x = 0; x < 2; x++) t.set(x, y, z, true);
    }
    const placed = t.createEmptyLike();

    assert.equal(canPlaceBrick({ target: t, placed }, at(0, 3, 0), { minSupportRatio: 0.75 }).reason, REJECTED.UNSUPPORTED);
    assert.equal(canPlaceBrick({ target: t, placed }, at(0, 3, 0), { minSupportRatio: 0.5 }).ok, true);
  });

  it("can skip the support requirement entirely", () => {
    const t = new LegoOccupancy(2, 9, 4);
    for (let y = 6; y < 9; y++) {
      for (let z = 0; z < 4; z++) for (let x = 0; x < 2; x++) t.set(x, y, z, true);
    }
    const placed = t.createEmptyLike();
    assert.equal(canPlaceBrick({ target: t, placed }, at(0, 6, 0)).reason, REJECTED.UNSUPPORTED);
    assert.equal(canPlaceBrick({ target: t, placed }, at(0, 6, 0), { requireSupport: false }).ok, true);
  });

  it("is deterministic: identical inputs give identical results", () => {
    const build = () => {
      const t = target(4, 6, 4);
      const placed = t.createEmptyLike();
      markPlaced(placed, canPlaceBrick({ target: t, placed }, at(0, 0, 0)).cells);
      return { t, placed };
    };
    const a = build();
    const b = build();
    for (const rotation of [0, 90]) {
      for (let y of [0, 3]) {
        const ra = canPlaceBrick({ target: a.t, placed: a.placed }, at(0, y, 0, rotation));
        const rb = canPlaceBrick({ target: b.t, placed: b.placed }, at(0, y, 0, rotation));
        assert.deepEqual(ra, rb);
      }
    }
  });

  it("computes support and footing ratios directly", () => {
    const t = target(4, 6, 4);
    const placed = t.createEmptyLike();
    markPlaced(placed, brickCells(PART_3001, { x: 0, y: 0, z: 0 }, 0));

    // A brick at (0, 3, 0) sits fully on the placed brick.
    assert.equal(supportRatio(placed, PART_3001, { x: 0, y: 3, z: 0 }, 0), 1);
    // Rotated, its wider 4x2 footprint only half overlaps the 2x4 below.
    assert.equal(supportRatio(placed, PART_3001, { x: 0, y: 3, z: 0 }, 90), 0.5);
    assert.equal(footingRatio(t, placed, PART_3001, { x: 0, y: 3, z: 0 }, 90), 1);
    // Ground layer is unconditionally 1.
    assert.equal(supportRatio(placed, PART_3001, { x: 0, y: 0, z: 0 }, 0), 1);
  });
});

describe("toModelBrick", () => {
  it("produces plain data in the existing LEGO model format", () => {
    const brick = toModelBrick(PART_3001, { x: 1, y: 3, z: 2 }, 90, "blue");
    assert.deepEqual(brick, {
      partId: "3001",
      type: "brick",
      width: 2,
      depth: 4,
      height: 3,
      color: "blue",
      position: { x: 1, y: 3, z: 2 },
      rotation: 90,
    });
    assert.equal(JSON.parse(JSON.stringify(brick)).partId, "3001"); // serialisable: no class instances
  });
});
