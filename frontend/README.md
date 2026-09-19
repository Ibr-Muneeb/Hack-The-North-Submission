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
