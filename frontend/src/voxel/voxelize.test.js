import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DEMO_SHAPES, getDemoShape } from "./shapes.js";
import { voxelizeCube } from "./voxelizeCube.js";
import { voxelizeCylinder } from "./voxelizeCylinder.js";
import { voxelizeImplicit } from "./voxelizeImplicit.js";
import { voxelizeSphere } from "./voxelizeSphere.js";
import { voxelizeStaircase } from "./voxelizeStaircase.js";

const key = (x, y, z) => `${x},${y},${z}`;
const keysOf = (grid) => new Set(grid.getOccupiedVoxels().map(({ x, y, z }) => key(x, y, z)));
const setsEqual = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

/** Reference set: every cell (in a w x h x d grid) for which `predicate(x, y, z)` holds. */
function expectedCells(w, h, d, predicate) {
  const out = new Set();
  for (let y = 0; y < h; y++)
    for (let z = 0; z < d; z++)
      for (let x = 0; x < w; x++) if (predicate(x, y, z)) out.add(key(x, y, z));
  return out;
}

describe("voxelizeImplicit (shared engine)", () => {
  it("sizes the grid by rounding the extent UP, without float noise", () => {
    // 2.1 / 0.3 === 7.000000000000001 in floating point: a naive ceil() gives 8.
    assert.ok(2.1 / 0.3 > 7);
    const grid = voxelizeImplicit({ extent: [2.1, 0.3, 0.25], voxelSize: 0.3, contains: () => false });
    assert.deepEqual([grid.width, grid.height, grid.depth], [7, 1, 1]);
    // ...while a genuinely partial voxel still rounds up
    const partial = voxelizeImplicit({ extent: [2.2, 0.3, 0.31], voxelSize: 0.3, contains: () => false });
    assert.deepEqual([partial.width, partial.height, partial.depth], [8, 1, 2]);
  });

  it("samples each voxel exactly once, at its centre, as an offset from the grid centre", () => {
    const seen = [];
    voxelizeImplicit({
      extent: [2, 2, 2],
      voxelSize: 1,
      contains: (dx, dy, dz, size) => {
        seen.push([dx, dy, dz, ...size]);
        return false;
      },
    });
    assert.equal(seen.length, 8);
    assert.deepEqual(new Set(seen.map((s) => s.slice(0, 3).join())).size, 8);
    for (const [dx, dy, dz, sx, sy, sz] of seen) {
      assert.ok([dx, dy, dz].every((v) => v === -0.5 || v === 0.5));
      assert.deepEqual([sx, sy, sz], [2, 2, 2]);
    }
  });

  it("rejects bad arguments", () => {
    const contains = () => true;
    assert.throws(() => voxelizeImplicit({ extent: [1, 1], voxelSize: 1, contains }), RangeError);
    assert.throws(() => voxelizeImplicit({ extent: [1, 0, 1], voxelSize: 1, contains }), RangeError);
    assert.throws(() => voxelizeImplicit({ extent: [1, 1, 1], voxelSize: 0, contains }), RangeError);
    assert.throws(() => voxelizeImplicit({ extent: [1, 1, 1], voxelSize: 1, contains: null }), TypeError);
  });
});

describe("voxelizeSphere", () => {
  it("has occupied voxels and keeps the requested voxelSize", () => {
    const grid = voxelizeSphere({ radius: 5, voxelSize: 0.5 });
    assert.ok(grid.count > 0);
    assert.equal(grid.voxelSize, 0.5);
    assert.deepEqual([...grid.origin], [0, 0, 0]);
  });

  it("grid spans the sphere's diameter: 2r / voxelSize cells per axis", () => {
    const grid = voxelizeSphere({ radius: 5, voxelSize: 0.5 });
    assert.deepEqual([grid.width, grid.height, grid.depth], [20, 20, 20]);
    assert.deepEqual(grid.getWorldBounds().size, [10, 10, 10]);
  });

  it("tiny exact case: radius 1.5 at voxelSize 1 is the 3x3x3 block minus its 8 corners (19)", () => {
    const grid = voxelizeSphere({ radius: 1.5, voxelSize: 1 });
    assert.equal(grid.count, 19);
    const corners = [0, 2].flatMap((x) => [0, 2].flatMap((y) => [0, 2].map((z) => key(x, y, z))));
    for (const c of corners) assert.equal(keysOf(grid).has(c), false, `corner ${c}`);
    assert.equal(grid.get(1, 1, 1), true);
  });

  it("volume approximates 4/3 pi r^3", () => {
    for (const voxelSize of [0.5, 0.25]) {
      const grid = voxelizeSphere({ radius: 5, voxelSize });
      const volume = grid.count * voxelSize ** 3;
      const exact = (4 / 3) * Math.PI * 5 ** 3;
      assert.ok(Math.abs(volume - exact) / exact < 0.03, `voxelSize ${voxelSize}: ${volume} vs ${exact}`);
    }
  });

  it("is approximately centred in its grid and exactly point-symmetric", () => {
    for (const voxelSize of [0.5, 0.1, 0.3]) {
      const grid = voxelizeSphere({ radius: 3, voxelSize });
      const { min, max } = grid.getOccupiedBounds();
      // occupied bounding box is centred in the grid
      assert.equal(min.x + max.x, grid.width - 1, `x @ ${voxelSize}`);
      assert.equal(min.y + max.y, grid.height - 1, `y @ ${voxelSize}`);
      assert.equal(min.z + max.z, grid.depth - 1, `z @ ${voxelSize}`);
      // mirror through the centre, and swap of axes (cubic grid), map occupied -> occupied
      for (const { x, y, z } of grid.occupiedVoxels()) {
        assert.equal(grid.get(grid.width - 1 - x, grid.height - 1 - y, grid.depth - 1 - z), true);
        assert.equal(grid.get(y, x, z), true);
        assert.equal(grid.get(x, z, y), true);
      }
    }
  });

  it("occupied voxels are exactly those whose centre lies inside the sphere", () => {
    const radius = 4, voxelSize = 0.5;
    const grid = voxelizeSphere({ radius, voxelSize });
    const c = radius; // sphere centre in world space (grid origin 0, grid size 2r)
    for (let y = 0; y < grid.height; y++)
      for (let z = 0; z < grid.depth; z++)
        for (let x = 0; x < grid.width; x++) {
          const [wx, wy, wz] = grid.voxelCenter(x, y, z);
          const inside = Math.hypot(wx - c, wy - c, wz - c) <= radius;
          assert.equal(grid.get(x, y, z), inside, key(x, y, z));
        }
  });

  it("a larger radius produces a larger grid and more voxels", () => {
    const small = voxelizeSphere({ radius: 3, voxelSize: 0.5 });
    const large = voxelizeSphere({ radius: 6, voxelSize: 0.5 });
    assert.ok(large.width > small.width && large.height > small.height && large.depth > small.depth);
    assert.ok(large.count > small.count);
  });

  it("a smaller voxelSize produces more voxels (and a finer grid) for the same sphere", () => {
    const coarse = voxelizeSphere({ radius: 5, voxelSize: 1 });
    const medium = voxelizeSphere({ radius: 5, voxelSize: 0.5 });
    const fine = voxelizeSphere({ radius: 5, voxelSize: 0.25 });
    assert.ok(coarse.count < medium.count && medium.count < fine.count);
    assert.ok(coarse.width < medium.width && medium.width < fine.width);
    // ...but the physical size stays (about) the same
    for (const g of [coarse, medium, fine]) assert.ok(Math.abs(g.getWorldBounds().size[0] - 10) < 1e-9);
  });

  it("is deterministic and rejects a bad radius", () => {
    assert.deepEqual(
      voxelizeSphere({ radius: 3, voxelSize: 0.5 }).getOccupiedVoxels(),
      voxelizeSphere({ radius: 3, voxelSize: 0.5 }).getOccupiedVoxels(),
    );
    for (const radius of [0, -1, NaN]) assert.throws(() => voxelizeSphere({ radius }), RangeError);
  });
});

describe("voxelizeCube", () => {
  it("edge 4 at voxelSize 1 is exactly a 4x4x4 block of 64 cells", () => {
    const grid = voxelizeCube({ size: 4, voxelSize: 1 });
    assert.deepEqual([grid.width, grid.height, grid.depth], [4, 4, 4]);
    assert.equal(grid.count, 64);
    assert.ok(setsEqual(keysOf(grid), expectedCells(4, 4, 4, () => true)));
  });

  it("halving voxelSize gives 8x the voxels and the same physical size", () => {
    const grid = voxelizeCube({ size: 4, voxelSize: 0.5 });
    assert.deepEqual([grid.width, grid.height, grid.depth], [8, 8, 8]);
    assert.equal(grid.count, 512);
    assert.deepEqual(grid.getWorldBounds().size, [4, 4, 4]);
  });

  it("works with a voxel size that is not exactly representable (0.1)", () => {
    const grid = voxelizeCube({ size: 3, voxelSize: 0.1 });
    assert.deepEqual([grid.width, grid.height, grid.depth], [30, 30, 30]);
    assert.equal(grid.count, 30 ** 3);
  });

  it("no cells appear outside the cube: occupied bounds == the whole grid", () => {
    const grid = voxelizeCube({ size: 8, voxelSize: 0.5 });
    assert.deepEqual(grid.getOccupiedBounds(), {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 15, y: 15, z: 15 },
    });
  });

  it("rejects a bad size", () => {
    for (const size of [0, -2, Infinity]) assert.throws(() => voxelizeCube({ size }), RangeError);
  });
});

describe("voxelizeCylinder", () => {
  const radius = 3, height = 4, voxelSize = 0.5;
  const grid = voxelizeCylinder({ radius, height, voxelSize });

  it("grid is 2r wide/deep and `height` tall (axis along Y)", () => {
    assert.deepEqual([grid.width, grid.height, grid.depth], [12, 8, 12]);
  });

  it("occupied cells match an independent formula: circular in XZ, full height in Y", () => {
    const expected = expectedCells(12, 8, 12, (x, _y, z) => {
      const dx = x + 0.5 - 6, dz = z + 0.5 - 6; // centre offset in voxel units
      return dx * dx + dz * dz <= (radius / voxelSize) ** 2;
    });
    assert.ok(setsEqual(keysOf(grid), expected));
  });

  it("every horizontal layer is identical, so the cylinder is a true prism", () => {
    const perLayer = new Array(grid.height).fill(0);
    for (const { y } of grid.occupiedVoxels()) perLayer[y]++;
    assert.ok(perLayer.every((n) => n === perLayer[0] && n > 0), perLayer.join());
    assert.equal(grid.count, perLayer[0] * grid.height);
  });

  it("is round: the corners of the bounding box are empty, the axis is full", () => {
    assert.equal(grid.get(0, 3, 0), false);
    assert.equal(grid.get(11, 3, 11), false);
    for (let y = 0; y < grid.height; y++) assert.equal(grid.get(5, y, 5), true);
  });

  it("rejects bad radius / height", () => {
    assert.throws(() => voxelizeCylinder({ radius: 0 }), RangeError);
    assert.throws(() => voxelizeCylinder({ height: -1 }), RangeError);
  });
});

describe("voxelizeStaircase", () => {
  const params = { steps: 3, stepRun: 2, stepRise: 1, width: 2, voxelSize: 1 };
  const grid = voxelizeStaircase(params);

  it("grid covers run x rise x width", () => {
    assert.deepEqual([grid.width, grid.height, grid.depth], [6, 3, 2]);
  });

  it("occupied cells are exactly the expected steps (heights 1, 2, 3 toward +X)", () => {
    const expected = expectedCells(6, 3, 2, (x, y) => y < Math.floor(x / 2) + 1);
    assert.equal(grid.count, 24);
    assert.ok(setsEqual(keysOf(grid), expected));
  });

  it("column heights rise toward +X and the floor layer is y = 0", () => {
    const heightAt = (x) => {
      let n = 0;
      for (let y = 0; y < grid.height; y++) if (grid.get(x, y, 0)) n++;
      return n;
    };
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(heightAt), [1, 1, 2, 2, 3, 3]);
    assert.equal(grid.get(0, 0, 0), true);
    assert.equal(grid.get(0, 1, 0), false); // nothing floats above the first step
  });

  it("is uniform along Z", () => {
    for (const { x, y } of grid.occupiedVoxels()) {
      assert.equal(grid.get(x, y, 0), grid.get(x, y, 1));
    }
  });

  it("no cells appear above the staircase profile at finer voxel sizes", () => {
    const fine = voxelizeStaircase({ ...params, voxelSize: 0.25 });
    for (const { x, y } of fine.occupiedVoxels()) {
      const [wx, wy] = fine.voxelCenter(x, y, 0);
      assert.ok(wy < (Math.floor(wx / 2) + 1) * 1, `voxel ${x},${y} is above its step`);
    }
    // and every voxel centre under the profile IS occupied
    for (let y = 0; y < fine.height; y++)
      for (let x = 0; x < fine.width; x++) {
        const [wx, wy] = fine.voxelCenter(x, y, 0);
        assert.equal(fine.get(x, y, 0), wy < (Math.floor(wx / 2) + 1) * 1);
      }
  });

  it("rejects bad parameters", () => {
    assert.throws(() => voxelizeStaircase({ steps: 0 }), RangeError);
    assert.throws(() => voxelizeStaircase({ steps: 2.5 }), RangeError);
    assert.throws(() => voxelizeStaircase({ stepRun: -1 }), RangeError);
  });
});

describe("demo shape registry", () => {
  it("has unique ids and every shape voxelizes to a non-empty grid at several voxel sizes", () => {
    assert.equal(new Set(DEMO_SHAPES.map((s) => s.id)).size, DEMO_SHAPES.length);
    for (const shape of DEMO_SHAPES) {
      for (const voxelSize of [2, 0.5, 0.2]) {
        const grid = shape.generate({ voxelSize });
        assert.ok(grid.count > 0, `${shape.id} @ ${voxelSize}`);
        assert.equal(grid.voxelSize, voxelSize);
      }
    }
  });

  it("finer voxels give more voxels for every shape", () => {
    for (const shape of DEMO_SHAPES) {
      assert.ok(shape.generate({ voxelSize: 0.25 }).count > shape.generate({ voxelSize: 0.5 }).count, shape.id);
    }
  });

  it("getDemoShape looks up by id and rejects unknown ids", () => {
    assert.equal(getDemoShape("cube").id, "cube");
    assert.throws(() => getDemoShape("teapot"));
  });
});

describe("voxel layer independence", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  const sources = readdirSync(dir).filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"));

  it("finds the source files", () => {
    assert.ok(sources.length >= 8, sources.join());
  });

  it("imports only sibling voxel files: no three, react, @react-three, or src/lego", () => {
    for (const file of sources) {
      const text = readFileSync(dir + file, "utf8");
      const specifiers = [...text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?from\s*["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of specifiers) {
        assert.match(spec, /^\.\/[\w]+\.js$/, `${file} imports "${spec}"`);
      }
      assert.doesNotMatch(text, /\bimport\s*\(/, `${file} uses dynamic import`);
      assert.doesNotMatch(text, /\brequire\s*\(/, `${file} uses require`);
    }
  });
});
