import { useState } from "react";
import { decomposeVoxelGrid } from "../decomposition/decomposer.js";
import { DECOMPOSITION_SHAPES, getDecompositionShape } from "../decomposition/demoShapes.js";
import LEGOViewer from "./LEGOViewer.jsx";
import VoxelViewer from "./VoxelViewer.jsx";

const DEFAULT_SHAPE_ID = "exact-slab";
// 0.2 world units = 1/5 stud = 1/2 plate: the coarsest size that still maps
// exactly onto LEGO cells (see src/decomposition/voxelToLegoGrid.js).
const DEFAULT_VOXEL_SIZE = 0.2;
const MIN_VOXEL_SIZE = 0.1;
const MAX_VOXEL_SIZE = 2;
// Every brick is its own LDraw Object3D, so keep the demo's draw calls sane.
const MAX_BRICKS = 600;

function run(shapeId, voxelSize) {
  const grid = getDecompositionShape(shapeId).generate({ voxelSize });
  return { shapeId, grid, result: decomposeVoxelGrid(grid, { maxBricks: MAX_BRICKS }) };
}

const percent = (ratio) => `${(ratio * 100).toFixed(1)}%`;

/**
 * Milestone 5 demo:
 *   shape -> VoxelGrid (src/voxel) -> decomposition (src/decomposition)
 *         -> LEGO model data -> existing LDraw renderer (src/lego).
 *
 * The voxel target and the LEGO result are shown with the two EXISTING
 * viewers; nothing here contains rendering or decomposition logic of its own.
 */
export default function DecomposeDemo() {
  const [shapeId, setShapeId] = useState(DEFAULT_SHAPE_ID);
  const [voxelSizeText, setVoxelSizeText] = useState(String(DEFAULT_VOXEL_SIZE));
  const [view, setView] = useState("lego");
  const [error, setError] = useState(null);
  const [state, setState] = useState(() => run(DEFAULT_SHAPE_ID, DEFAULT_VOXEL_SIZE));

  function handleSubmit(event) {
    event.preventDefault();
    const voxelSize = Number(voxelSizeText);
    if (!Number.isFinite(voxelSize) || voxelSize < MIN_VOXEL_SIZE || voxelSize > MAX_VOXEL_SIZE) {
      setError(`Voxel size must be between ${MIN_VOXEL_SIZE} and ${MAX_VOXEL_SIZE}.`);
      return;
    }
    try {
      setState(run(shapeId, voxelSize));
      setError(null);
    } catch (problem) {
      setError(problem.message);
    }
  }

  const { grid, result } = state;
  const shape = getDecompositionShape(state.shapeId);

  return (
    <>
      <div className="viewer">
        {view === "lego" ? (
          // key: a new decomposition gets a fresh camera framing.
          <LEGOViewer key={`lego-${state.shapeId}-${grid.voxelSize}`} model={result.model} />
        ) : (
          <VoxelViewer key={`voxel-${state.shapeId}-${grid.voxelSize}`} grid={grid} />
        )}
      </div>

      <aside className="panel">
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Shape</span>
            <select value={shapeId} onChange={(e) => setShapeId(e.target.value)}>
              {DECOMPOSITION_SHAPES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.description})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Voxel size (world units)</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min={MIN_VOXEL_SIZE}
              max={MAX_VOXEL_SIZE}
              value={voxelSizeText}
              onChange={(e) => setVoxelSizeText(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Show</span>
            <select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="lego">LEGO bricks (decomposed)</option>
              <option value="voxel">Voxel target</option>
            </select>
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary">
            Decompose
          </button>
        </form>

        <dl className="stats">
          <dt>Showing</dt>
          <dd>{shape.label}</dd>
          <dt>Voxel size</dt>
          <dd>{grid.voxelSize}</dd>
          <dt>Target voxels</dt>
          <dd>{result.targetVolume.toLocaleString()}</dd>
          <dt>LEGO grid</dt>
          <dd>{result.legoGrid.sizeX} × {result.legoGrid.sizeY} × {result.legoGrid.sizeZ}</dd>
          <dt>Generated bricks</dt>
          <dd>{result.bricks.length.toLocaleString()} × 3001</dd>
          <dt>Covered volume</dt>
          <dd>{result.coveredVolume.toLocaleString()} voxels</dd>
          <dt>Uncovered</dt>
          <dd>{result.uncoveredVoxelCount.toLocaleString()} voxels</dd>
          <dt>Coverage</dt>
          <dd>{percent(result.coverageRatio)}</dd>
        </dl>

        {result.warnings.length > 0 && (
          <p className="legend" role="status">
            {result.warnings.join(" ")}
          </p>
        )}

        <p className="legend">
          Only part <strong>3001</strong> (2×4 brick) is placed, in whole 3-plate courses, and only
          where it fits entirely inside the target shape — so coverage below 100% is expected for
          anything that is not a multiple of a brick.
        </p>
      </aside>

      <p className="hint">Drag to rotate. Scroll to zoom.</p>
    </>
  );
}
