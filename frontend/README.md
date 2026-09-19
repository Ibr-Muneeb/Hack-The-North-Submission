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

**Demo.** The app opens on the *Voxel Demo* tab (switch to *LEGO Model* at the top
right). Pick a shape and voxel size, then *Generate*. The rendering lives in
`src/voxel-view/` and `src/components/Voxel*.jsx`, separate from the data layer.

## Tests

```bash
npm test        # node's built-in test runner, no extra dependencies
```

Voxelization is **not** connected to LEGO bricks yet; that is a later milestone.
