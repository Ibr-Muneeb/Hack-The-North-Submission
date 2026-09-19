# Brickify V2

Brickify turns 3D meshes into voxel grids and deterministic LEGO brick
placements. The React frontend renders the backend decomposition as an
interactive Three.js model made from individual procedural bricks.

## Backend

```bash
cd backend
python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate.ps1

# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
python -m uvicorn app:app --reload
```

The API is available at `http://127.0.0.1:8000`.

- `GET /api/health` checks API availability.
- `POST /api/voxelize` accepts an OBJ, GLB, or glTF file in the `mesh` form
  field and an optional `voxel_size` form field.
- `POST /api/lego/decompose` accepts the serialized voxel grid JSON returned by
  the voxelizer and returns LEGO brick placements.
- `GET /api/lego/demo` returns a deterministic house generated as voxels and
  passed through the same LEGO decomposer used for normal models.

Run the local voxelization demo from the backend directory:

```bash
python -m voxel.cli test_models/cube.obj --voxel-size 0.1
```

Meshes retain their source axes. Brickify interprets +X as right, +Y as up,
and +Z as front. Before voxelization, the bounding-box center is moved to the
origin and the longest dimension is uniformly scaled to 1.0.

Run the voxel-to-LEGO decomposition demo:

```bash
python -m lego.decomposer
```

The decomposer treats each voxel as one logical stud and processes every Y
layer independently. It greedily tries 2x4, 2x3, 2x2, 1x4, 1x3, 1x2, then
1x1 footprints, using fixed XZ/ZX orientation order. It models logical brick
placements only; physical dimensions, colors, stability, and rendering are
future milestones.

Generate a GLB through the hosted Stable Fast 3D Space:

```bash
python -m reconstruction.cli path/to/image.png --output generated/model.glb
```

The client connects to the public `stabilityai/stable-fast-3d` Gradio Space.
It uses `/requires_bg_remove` for preprocessing state and `/run_button` for
generation. No model weights are downloaded or run locally. If Hugging Face
requires authentication or additional ZeroGPU capacity, set an optional
`HF_TOKEN` environment variable before running the command.

`POST /api/reconstruct` accepts a PNG or JPEG in the `image` multipart field
and stores validated GLB results under `backend/generated/models/`.

Run the backend test:

```bash
python -m pytest
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

With the backend running at `http://127.0.0.1:8000`, open
`http://127.0.0.1:5173`. Vite proxies `/api` to FastAPI during development.
The demo supports drag-to-rotate, scroll/pinch zoom, right-drag pan, camera
reset, and optional auto-rotation.

Create a production build with:

```bash
npm run build
```
