# Brickify

A 3D LEGO brick viewer built with React, Vite, Three.js and React Three Fiber.

## Development

```bash
npm install
npm run dev
```

## Real LEGO Geometry

Brickify uses Three.js's `LDrawLoader` to render official LDraw LEGO geometry.

For the current milestone, only the LEGO 2×4 brick (`3001`) is supported. The
LDraw → Brickify coordinate conversion and part loading/caching live in
`src/lego/LegoPart.js`. If LDraw geometry fails to load, Brick.jsx falls back
to the procedural brick geometry in `src/lego/brickGeometry.js`.

## Voxel representation (Milestone 4)

Brickify's intermediate 3D representation is a **voxel grid**: a dense grid of
occupied / empty cells. It is plain JavaScript in `src/voxel/` and is
independent of LEGO and of rendering (no Three.js, React, part ids or colours).

```text
3D shape -> voxelization -> occupied grid cells -> (debug view)
```

```js
import { VoxelGrid, voxelizeSphere } from "./src/voxel/index.js";

const grid = new VoxelGrid(4, 4, 4, { voxelSize: 0.5 });
grid.set(2, 3, 1);                 // occupy
grid.get(2, 3, 1);                 // true   (out of bounds -> false)
grid.clear(2, 3, 1);               // empty  (out of bounds -> no-op; set() throws)
grid.getOccupiedVoxels();          // [{ x, y, z }, ...] bottom layer first

const sphere = voxelizeSphere({ radius: 5, voxelSize: 0.5 });
sphere.voxelCenter(3, 4, 5);       // world-space centre of a cell, [x, y, z]
sphere.worldToVoxel(1.2, 2.2, 3);  // the cell containing a world point, {x, y, z}
```

**Coordinates.** Grid space is integer cells `(x, y, z)`, X/Z horizontal, +Y up,
cell `(0,0,0)` at the minimum corner. World space uses the same axes and the same
unit as the LEGO viewer (1 unit = 1 stud). Every voxel is a cube of `voxelSize`
world units; cell `(x,y,z)` spans `origin + [x, x+1) * voxelSize` on each axis.
This is *not* the LEGO grid (a LEGO cell is 1 stud x 1 plate x 1 stud, not a
cube); see the header of `src/voxel/VoxelGrid.js`.

**Shapes.** `voxelizeSphere`, `voxelizeCube`, `voxelizeCylinder`,
`voxelizeStaircase`, all built on `voxelizeImplicit` (a voxel is occupied when its
centre is inside the shape).

**Demo.** The *Voxel Demo* tab (top right). Pick a shape and voxel size, then
*Generate*. The rendering lives in `src/voxel-view/` and
`src/components/Voxel*.jsx`, separate from the data layer.

## Voxel -> LEGO decomposition (Milestone 5)

This is the step that finally joins the two halves of the project:

```text
VoxelGrid -> LEGO occupancy -> brick placement -> LEGO model data -> LDraw renderer
```

It lives in its own layer, `src/decomposition/`, which is plain JavaScript: it
may read voxel data (`src/voxel`) and the LEGO *data* definitions
(`src/lego/coordinates.js`, `model.js`, `modelValidation.js`), but never React,
Three.js, R3F, LDraw `Object3D`s or UI components. That boundary is enforced by
a test (`src/decomposition/architecture.test.js`), not just by convention.

```js
import { decomposeVoxelGrid } from "./src/decomposition/index.js";

const result = decomposeVoxelGrid(grid);
result.model;            // { bricks: [...] } - feed straight to <LEGOModel>
result.coverageRatio;    // 0..1, measured in voxels
result.uncoveredVoxels;  // where the LEGO model falls short of the target
```

**Supported part.** Only `3001`, the 2x4 brick (2 studs x 4 studs x 3 plates),
at rotations 0 / 90 / 180 / 270. Following the existing convention in
`coordinates.js`, a 2x4 is `width: 2, depth: 4`, so "4 studs along X" is
rotation 90. (0 and 180 occupy the same cells, as do 90 and 270, so the
decomposer only enumerates 0 and 90.)

**Occupancy representation.** `LegoOccupancy` is the LEGO counterpart of
`VoxelGrid`: a dense grid whose cell is 1 stud x 1 plate x 1 stud
(1 x 0.4 x 1 world units), indexed exactly like a brick's `position`. Two are
used: the *target* (derived from the voxel grid) and the *placed* cells. The
source `VoxelGrid` is only ever read.

**Voxel size.** Not assumed to be 0.2. Both grids live in the same world space,
so the mapping goes through world coordinates rather than an assumed cell
ratio. A LEGO cell counts as target geometry when at least half of its *volume*
is covered by occupied voxels, computed by exact per-axis overlap. Sizes that
divide LEGO dimensions evenly (0.2 -> 5 voxels per stud, 2 per plate; 0.1 ->
10 and 4) map exactly; other sizes still work but put voxel boundaries inside
LEGO cells, and the result carries an explicit warning rather than pretending
the geometry lines up.

**Strategy.** Deterministic bottom-up greedy - no randomness, no optimizer, no
ML. Bricks are built in 3-plate courses from `y = 0`. Within a course, every
anchor is scanned in a fixed order (z, then x, then rotation 0, then 90), each
valid candidate is scored, the best one is placed, and the course is rescanned
until nothing more fits. Ties always go to the first candidate in scan order,
so the same input gives byte-identical output. Scoring, in strict priority
order: target coverage, then support underneath, then contact with
neighbouring bricks.

**Support.** Two numbers over the footprint directly beneath a brick, both 1 on
the ground course. *Footing* (placed brick **or** target geometry below)
decides validity; *support* (placed bricks only) is the scoring term. Footing
counts target geometry because with 3001 alone some layers cannot be bricked at
all - a sphere's base is narrower than a 2x4 - and requiring placed bricks
underneath would reject everything above them and produce an empty model. A
brick with neither bricks nor target geometry below it is still rejected. This
is a footprint test, not LEGO physics.

**Coverage.** Measured in voxels against the untouched grid: a voxel is covered
when its centre falls inside a LEGO cell occupied by a brick. The result
reports `targetVolume`, `coveredVolume`, `coverageRatio`, `uncoveredVoxels` and
`uncoveredVoxelCount`. The target is never quietly edited to match the model -
knowing where the approximation differs is the point.

**Current limitations.**

- 3001 only, so anything not a multiple of 2x4x3 plates is under-covered.
- Bricks are only placed where they fit *entirely* inside the target, so the
  model never bulges outward - it just leaves thin features out.
- Height is consumed in whole 3-plate courses; leftover plates at the top stay
  uncovered (no plates or tiles yet).
- Greedy and local: it does not backtrack or look for a globally better tiling.
- Colour is not part of the problem yet - every brick uses one default colour.

**Demo.** The *Decompose* tab. Pick a shape and voxel size, press *Decompose*,
and the generated bricks render through the existing LDraw pipeline
(`LEGOViewer` -> `LEGOModel` -> `Brick`); there is no second renderer. The
"Show" dropdown switches between the LEGO result and the voxel target using the
existing voxel viewer. Statistics show target voxels, LEGO grid size, generated
bricks, covered/uncovered volume and coverage %. Alongside the Milestone 4
shapes there are LEGO-sized reference solids with a known answer, e.g. *Exact
2x4 brick* -> exactly one 3001 at 100 % coverage.

**Deferred to later milestones.** Image-to-3D reconstruction, colour from the
source model, additional parts, plates/tiles for leftover height, optimisation
beyond greedy, real connection/stability simulation, parts lists and building
instructions.

## Tests

```bash
npm test        # node's built-in test runner, no extra dependencies
```

Tests cover the voxel layer, the decomposition layer (mapping, placement,
rotation, overlap, support, coverage, determinism) and the layer boundaries.
