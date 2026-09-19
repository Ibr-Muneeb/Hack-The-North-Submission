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
- `GET /api/lego/demos` lists the deterministic demo models.
- `GET /api/lego/demo?model=house` returns either the `house` or `robot` demo,
  generated as voxels and passed through the normal LEGO decomposer.

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
layer independently. It greedily tries the reusable brick catalog from largest
to smallest, including 1×1 through 1×8 and 2×2 through 2×8 footprints. Output
placements include stable piece IDs, 0°/90° rotation, and deterministic color
IDs. The API derives its parts aggregation from those actual placements.

Catalog height is expressed in plate units: a standard brick is three units
tall and a plate is one. The current voxel/decomposition pipeline remains in
`brick` grid mode, where one Y cell is one complete brick height. Plate pieces
are cataloged and supported by the procedural renderer, but intentionally have
decomposition disabled until a distinct plate-resolution voxel grid is added.

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
Use the model selector to switch between Brickify House and Brickify Robot.
The parts panel shows counts by catalog piece and assigned color.

Create a production build with:

```bash
npm run build
```
