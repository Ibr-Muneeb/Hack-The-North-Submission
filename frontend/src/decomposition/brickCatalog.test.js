import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRICK_PLATES } from "../lego/coordinates.js";
import { validateBrick } from "../lego/modelValidation.js";
import {
  BRICK_CATALOG,
  candidateShapes,
  catalogIndex,
  getBrickDefinition,
  isSupportedPart,
  LARGEST_BRICK,
  PART_3001,
} from "./brickCatalog.js";

const EXPECTED = [
  { partId: "3001", width: 2, depth: 4, area: 8 },
  { partId: "3003", width: 2, depth: 2, area: 4 },
  { partId: "3004", width: 1, depth: 2, area: 2 },
  { partId: "3005", width: 1, depth: 1, area: 1 },
];

describe("brick catalog: contents", () => {
  it("contains exactly the four Milestone 6 parts", () => {
    assert.deepEqual(
      BRICK_CATALOG.map((brick) => brick.partId),
      EXPECTED.map((brick) => brick.partId),
    );
  });

  it("has the right dimensions for each part", () => {
    for (const expected of EXPECTED) {
      const brick = getBrickDefinition(expected.partId);
      assert.ok(brick, `${expected.partId} missing`);
      assert.equal(brick.width, expected.width, `${expected.partId} width`);
      assert.equal(brick.depth, expected.depth, `${expected.partId} depth`);
      assert.equal(brick.area, expected.area, `${expected.partId} area`);
      assert.equal(brick.area, brick.width * brick.depth, `${expected.partId} area is w*d`);
      assert.equal(brick.height, BRICK_PLATES, `${expected.partId} is 3 plates tall`);
      assert.equal(brick.type, "brick");
    }
  });

  it("has no duplicate entries", () => {
    const ids = BRICK_CATALOG.map((brick) => brick.partId);
    assert.equal(new Set(ids).size, ids.length);

    const footprints = BRICK_CATALOG.map((brick) => `${brick.width}x${brick.depth}`);
    assert.equal(new Set(footprints).size, footprints.length);
  });

  it("is ordered largest area first", () => {
    const areas = BRICK_CATALOG.map((brick) => brick.area);
    assert.deepEqual(areas, [...areas].sort((a, b) => b - a));
    assert.equal(LARGEST_BRICK.partId, "3001");
  });

  it("produces entries the existing LEGO model validator accepts", () => {
    for (const brick of BRICK_CATALOG) {
      const asModelBrick = { ...brick, color: "red", position: { x: 0, y: 0, z: 0 }, rotation: 0 };
      assert.deepEqual(validateBrick(asModelBrick), [], brick.partId);
    }
  });

  it("is frozen, so nothing can edit dimensions at runtime", () => {
    assert.throws(() => { BRICK_CATALOG.push({}); });
    assert.throws(() => { getBrickDefinition("3001").width = 9; }, TypeError);
  });

  it("reports unknown parts as unsupported", () => {
    assert.equal(getBrickDefinition("9999"), null);
    assert.equal(getBrickDefinition(undefined), null);
    assert.equal(isSupportedPart("3003"), true);
    assert.equal(isSupportedPart("9999"), false);
    assert.equal(catalogIndex("9999"), Infinity);
  });

  it("still exposes 3001 for Milestone 5 callers", () => {
    assert.equal(PART_3001, getBrickDefinition("3001"));
  });
});

describe("brick catalog: rotations", () => {
  it("gives oblong bricks two rotations and square bricks one", () => {
    assert.deepEqual([...getBrickDefinition("3001").rotations], [0, 90]);
    assert.deepEqual([...getBrickDefinition("3004").rotations], [0, 90]);
    assert.deepEqual([...getBrickDefinition("3003").rotations], [0]);
    assert.deepEqual([...getBrickDefinition("3005").rotations], [0]);
  });

  it("never lists a rotation that repeats a footprint", () => {
    for (const brick of BRICK_CATALOG) {
      const seen = new Set();
      for (const rotation of brick.rotations) {
        const quarterTurn = rotation % 180 === 90;
        const key = quarterTurn ? `${brick.depth}x${brick.width}` : `${brick.width}x${brick.depth}`;
        assert.ok(!seen.has(key), `${brick.partId} repeats footprint ${key}`);
        seen.add(key);
      }
      // 180 and 270 always repeat 0 and 90 for a rectangle, so they never appear.
      assert.ok(brick.rotations.every((r) => r === 0 || r === 90), brick.partId);
    }
  });

  it("enumerates every distinct candidate shape exactly once, largest first", () => {
    const shapes = candidateShapes();
    assert.equal(shapes.length, 6); // 3001 x2, 3003, 3004 x2, 3005

    const keys = shapes.map(({ brick, rotation }) => `${brick.partId}@${rotation}`);
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(keys, [
      "3001@0", "3001@90", "3003@0", "3004@0", "3004@90", "3005@0",
    ]);

    const areas = shapes.map(({ brick }) => brick.area);
    assert.deepEqual(areas, [...areas].sort((a, b) => b - a));
  });
});
