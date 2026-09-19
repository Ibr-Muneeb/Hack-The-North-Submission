import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { VoxelGrid } from "./VoxelGrid.js";
import { loadVoxelJson } from "./loadVoxelJson.js";

describe("loadVoxelJson", () => {
  it("constructs and populates the existing VoxelGrid", () => {
    const grid = loadVoxelJson({
      voxelSize: 0.2,
      dimensions: [3, 2, 4],
      voxels: [[0, 0, 0], [2, 1, 3]],
    });

    assert.ok(grid instanceof VoxelGrid);
    assert.equal(grid.width, 3);
    assert.equal(grid.height, 2);
    assert.equal(grid.depth, 4);
    assert.equal(grid.voxelSize, 0.2);
    assert.equal(grid.count, 2);
    assert.equal(grid.get(0, 0, 0), true);
    assert.equal(grid.get(2, 1, 3), true);
  });

  it("loads the Python cube sample as a full 6 x 6 x 6 grid", async () => {
    const sampleUrl = new URL("../../public/samples/output_voxels.json", import.meta.url);
    const data = JSON.parse(await readFile(sampleUrl, "utf8"));
    const grid = loadVoxelJson(data);

    assert.deepEqual([grid.width, grid.height, grid.depth], [6, 6, 6]);
    assert.equal(grid.voxelSize, 0.2);
    assert.equal(grid.count, 216);
    for (let y = 0; y < 6; y++) {
      for (let z = 0; z < 6; z++) {
        for (let x = 0; x < 6; x++) assert.equal(grid.get(x, y, z), true);
      }
    }
  });

  it("keeps duplicate occupied coordinates idempotent", () => {
    const grid = loadVoxelJson({
      voxelSize: 1,
      dimensions: [1, 1, 1],
      voxels: [[0, 0, 0], [0, 0, 0]],
    });
    assert.equal(grid.count, 1);
  });

  it("rejects invalid top-level data and voxel sizes", () => {
    for (const data of [null, [], "json"]) {
      assert.throws(() => loadVoxelJson(data), /expected an object/);
    }
    for (const voxelSize of [undefined, 0, -1, NaN, Infinity, "0.2"]) {
      assert.throws(
        () => loadVoxelJson({ voxelSize, dimensions: [1, 1, 1], voxels: [] }),
        /voxelSize must be a positive finite number/,
      );
    }
  });

  it("rejects malformed dimensions", () => {
    for (const dimensions of [undefined, [1, 1], [1, 1, 1, 1], [0, 1, 1], [1.5, 1, 1], ["1", 1, 1]]) {
      assert.throws(
        () => loadVoxelJson({ voxelSize: 0.2, dimensions, voxels: [] }),
        /dimensions must be/,
      );
    }
  });

  it("rejects a missing or malformed voxels array", () => {
    assert.throws(
      () => loadVoxelJson({ voxelSize: 0.2, dimensions: [2, 2, 2] }),
      /voxels must be an array/,
    );

    for (const coordinate of [[0, 0], [0, 0, 0, 0], [0.5, 0, 0], ["0", 0, 0], null]) {
      assert.throws(
        () => loadVoxelJson({ voxelSize: 0.2, dimensions: [2, 2, 2], voxels: [coordinate] }),
        /must be an integer \[x, y, z\] coordinate/,
      );
    }
  });

  it("rejects coordinates outside the declared dimensions", () => {
    for (const coordinate of [[-1, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2]]) {
      assert.throws(
        () => loadVoxelJson({ voxelSize: 0.2, dimensions: [2, 2, 2], voxels: [coordinate] }),
        /is outside dimensions \[2, 2, 2\]/,
      );
    }
  });
});
