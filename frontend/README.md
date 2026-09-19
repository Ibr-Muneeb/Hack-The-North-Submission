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

## Smarter decomposition (Milestone 6)

Milestone 5 could only place 2x4 bricks, so anything curved or stepped came out
coarse. M6 keeps the same deterministic bottom-up greedy pipeline and makes it
choose better, by giving it more bricks to choose from and a proper scoring
function.

The pipeline is unchanged, and still stops short of image reconstruction:

```text
Voxel representation -> LEGO decomposition -> LEGO model
```

Image -> 3D reconstruction is a later milestone. M6 is strictly about the
middle arrow.

**Supported bricks.** Four standard 3-plate-high bricks, all defined once in
`src/decomposition/brickCatalog.js`, which is the only place dimensions live:

| Part | Size | width x depth | Rotations generated |
| --- | --- | --- | --- |
| 3001 | 2x4 | 2 x 4 | 0, 90 |
| 3003 | 2x2 | 2 x 2 | 0 |
| 3004 | 1x2 | 1 x 2 | 0, 90 |
| 3005 | 1x1 | 1 x 1 | 0 |

A rotation is only generated when it yields a different footprint, so square
bricks get one candidate and 180/270 are never duplicated (they repeat 0/90 for
a rectangle, because `position` is the min corner of the rotated footprint).
All four rotations remain legal input.

`public/ldraw/` only shipped 3001, so minimal `3003.dat`, `3004.dat` and
`3005.dat` were added, built from the LDraw primitives already present
(`stud`, `stud4`, `box5`, `box3u2p`) and following 3001's construction and
winding. They load through the existing `LegoPart.js` / LDrawLoader path;
nothing about rendering changed.

**Candidate scoring** (`src/decomposition/candidateScoring.js`). At each anchor
cell the decomposer measures every catalog shape and rotation, then scores it:

- `+10` per target cell the brick is first to cover - the main term;
- `-14` per cell it occupies that is **not** target geometry. The penalty is
  bigger than the reward, so buying one extra covered cell with one stray cell
  is a net loss. This is what keeps a 2x4 from bulldozing across a curved edge;
- `+6 x fit`, where fit is covered/total cells - a ratio, so it prefers the
  brick that follows the boundary most cleanly rather than the biggest one;
- `+3 x support`, the fraction of the footprint resting on bricks already placed;
- `+0.4` per shared cell face with a neighbouring brick (capped), so the model
  grows as connected structure instead of scattered islands;
- `+0.25 x area`, a deliberately small nudge toward fewer, larger bricks. It
  breaks ties; it can never outweigh coverage or the stray-cell penalty.

**Determinism.** No randomness, no time, no unordered iteration. Scores are
floats, so ties are broken by an explicit chain: score, covered cells, fewer
stray cells, support, connectivity, brick area, catalog order, rotation, then
grid position (y, z, x). The same voxel grid always yields byte-identical
model data.

**Support and footing** are unchanged from M5 and remain distinct: *footing*
(placed brick **or** target geometry beneath) decides whether a placement is
legal, *support* (placed bricks only) is a scoring preference. Small bricks
make narrow bases buildable, so a sphere's bottom cap is no longer a problem.

**Irregular shapes.** Large bricks win in the interior because they cover more
cells; near the surface the false-positive penalty makes the smaller brick that
fits tightly win instead. By default a brick may not leave the target shape at
all (`maxOutsideRatio: 0`), so the LEGO silhouette never bulges past the voxel
geometry. The Decompose tab's *Boundary* dropdown switches to
`maxOutsideRatio: 0.25`, which lets bricks round outward over a curved surface -
higher coverage, and every stray cell counted as a false positive in the stats.

**Staircase fix.** The M5 staircase looked shifted toward +X. The cause was not
an offset anywhere: when a surface lands exactly on the midpoint of a LEGO
cell - which happens whenever a shape's features are not whole studs or plates,
such as the demo staircase's 1.5-stud treads - that cell is exactly half full,
and M5's "at least half" rule rounded the tie **up**, growing the shape by one
cell at every such boundary. The comparison is now strict, so a tie rounds
down and the model stays inside the voxel geometry. Checked cell by cell
against the staircase surface, the conversion went from 3 disagreeing cells to
0. A LEGO-aligned staircase demo shape (2-stud treads, one brick course of rise)
was added alongside the original, and both are covered by regression tests.

**Measured results** (voxel size 0.2, strict fit):

| Shape | M5 coverage | M6 coverage | M6 bricks |
| --- | --- | --- | --- |
| Sphere | 57.3% | 84.4% | 95 |
| Cylinder | 86.3% | 93.6% | 112 |
| Staircase | 80.1% | 88.3% | 15 |
| Cube | 90.0% | 90.0% | 48 |
| LEGO-aligned staircase | - | 100% | 10 |

The cube is unchanged because its coverage was never limited by brick choice -
its 20-plate height leaves two plates that no 3-plate brick can fill.

**Known limitations.**

- Bricks only, in whole 3-plate courses: leftover height shorter than a brick
  stays uncovered. Plates and tiles would fix this.
- Greedy and local. Each anchor is decided once, in scan order, with no
  backtracking, so the tiling is good rather than optimal.
- Support is a footprint test, not physics: no stud/tube connection check, no
  centre of mass, no toppling.
- Colour is still a single default; colour comes with image reconstruction.
- Very thin features (under half a LEGO cell) still disappear in the voxel to
  LEGO resampling.

## Image → 3D reconstruction (Milestone 7)

M7 adds the first real image-input stage in front of the existing pipeline.
It does not touch M1–M6: it produces an ordinary `VoxelGrid` and hands it to
the unmodified M6 decomposer.

```text
uploaded image -> reconstruction (src/reconstruction) -> VoxelGrid (src/voxel)
               -> existing M6 decomposer -> LEGO model -> existing LDraw renderer
```

**What "3D reconstruction" means here - please read before judging the demo.**
This is a deterministic **2.5D approximation**, not photogrammetry and not a
learned monocular-depth model. A single photograph does not contain enough
information to recover an object's true back surface. Instead, the object's
*silhouette* is inflated into a plausible rounded volume: pixels near the
centre of the silhouette bulge more than pixels near its edge, using each
pixel's distance to the silhouette boundary as a proxy for depth (a classic
"shape from silhouette" trick, sometimes called silhouette inflation).
Brightness contributes a small secondary shift, per pixel, so flat, uniform
extrusion isn't the whole story - but it is a minor effect layered on top of
the silhouette shape, not a real depth estimate. The result looks
convincingly 3D for the intended input (a single rounded/boxy object such as
a mug, bottle, toy, shoe or small appliance) and is honestly *not* a claim
that Brickify has solved general single-image 3D reconstruction.

**Why classical CV instead of a browser ML depth model.** An in-browser
monocular depth model (Option A in the milestone brief) was considered, but
introducing a new model dependency and a runtime download creates exactly
the kind of fragility - a model that can fail to fetch, a bundle size
regression, an unpredictable first-run delay - the milestone brief asks to
avoid. The classical approach needs no new dependency, cannot fail to
"load" (there is no model to load), runs in a few tens of milliseconds even
on a large photo, and is fully deterministic, which makes it possible to
unit test the geometry logic without a browser or any ML runtime. Per the
milestone's own priority order, a simple approximation that reliably looks
good in a live demo beats a fancier one that might not.

**Pipeline, module by module** (`src/reconstruction/`):

- `imagePreprocessing.js` - the only module that touches browser APIs
  (canvas, `Image`/`createImageBitmap`). Validates the uploaded file's type
  and size, decodes it, and resizes it (preserving aspect ratio) so
  processing never runs on a full-resolution photo.
- `segmentation.js` - foreground/background silhouette extraction. Three
  strategies, tried in order of reliability: (1) the image's own alpha
  channel, if it carries real transparency; (2) colour-distance from an
  estimated background (sampled from the frame's border, matching the
  "single object, simple background" brief); (3) a centred, image-shaped
  ellipse fallback if neither finds a plausible object, so the demo stays
  driven by the photo instead of failing outright.
- `depthField.js` - turns the flat silhouette into a per-pixel depth field
  via a distance transform (how far each pixel is from the silhouette's own
  edge), plus a small brightness-driven offset.
- `depthToVoxels.js` - the one place this layer touches `src/voxel`: resamples
  the mask/depth fields to the target voxel resolution and writes an ordinary
  `VoxelGrid`, extruding each silhouette column symmetrically around a
  mid-plane by an amount driven by its depth field value.
- `voxelCleanup.js` - three small, deterministic passes (fill cells fully
  surrounded by occupied neighbours, drop voxels with no occupied neighbours,
  keep only the largest connected component) instead of a mesh-processing
  framework.
- `reconstructFromImage.js` - orchestrates the above; `reconstructVoxelGridFromImageData`
  is the pure half (no browser APIs) that the test suite exercises directly.

**Layer boundary.** `src/reconstruction` may depend on `src/voxel` and its own
siblings only - never React, Three.js, LDraw, or `src/decomposition`. Checked
mechanically by `src/reconstruction/tests/architecture.test.js`, the same
pattern as the M5/M6 boundary test.

**Voxel resolution.** The output grid's longest side is capped at 40 voxels
by default (configurable, 32-64 is the sensible range) at `voxelSize = 0.2`
- the same size the rest of the app uses, so a reconstructed object lines up
with the LEGO grid exactly like the M4 demo shapes do.

**Background handling.** Handled by segmentation (above): alpha channel when
present, otherwise colour-distance from the frame's border, with an ellipse
fallback. There is no attempt at general-purpose background removal for
cluttered or multi-object scenes - that is explicitly out of scope for this
milestone (see "Limitations" below).

**Status reporting.** The UI shows `Loading image… / Processing image… /
Reconstructing 3D shape… / Generating voxels… / Complete / Error` as the
pipeline runs (`RECONSTRUCTION_STATUS` in `reconstructionTypes.js`), so a
slow decode on a large photo doesn't look like a frozen tab.

**Errors handled explicitly**, each with a distinct `ReconstructionError`
code: invalid/empty file, unsupported format, file too large, decoded image
too large, decode failure, and "no object found" (an empty result after
segmentation and cleanup). Every error surfaces as a message in the UI
panel; none crash the React app.

**Demo.** The *Image → LEGO* tab. Upload a PNG/JPEG/WebP, click *Reconstruct*
to see the 3D voxel approximation, then *Convert to LEGO* to run the
unmodified M6 decomposer on it. The "Show" dropdown switches between the two,
the same way the Decompose tab does between its voxel target and LEGO result.

**Known limitations.**

- 2.5D, not real 3D: no notion of concavities, occlusion, or an object's
  actual back surface. Two very different objects with the same silhouette
  reconstruct identically.
- Designed for one object on a reasonably plain background. Cluttered
  scenes, multiple objects, busy backgrounds, and low-contrast subjects (an
  object close in colour to its background) will segment poorly.
- The colour-distance fallback samples the image's border as "background",
  so a subject that touches or fills the frame edge can confuse segmentation.
- No attempt to make the reconstruction upright/canonical beyond what the
  photo itself shows - a tilted photo produces a tilted reconstruction.
- Like M6, colour is not part of the problem yet; reconstructed models use
  the same single default brick colour.

## Tests

```bash
npm test        # node's built-in test runner, no extra dependencies
```

Tests cover the voxel layer, the decomposition layer (brick catalog, mapping,
placement, rotation, scoring, overlap, support, coverage, determinism,
staircase positioning), the reconstruction layer (silhouette extraction,
distance transform/depth field, mask/depth → VoxelGrid conversion, voxel
cleanup, and an end-to-end reconstruction → M6 decomposition integration
test), and the layer boundaries for all three layers.