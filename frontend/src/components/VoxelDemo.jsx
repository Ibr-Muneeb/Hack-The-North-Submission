import { useState } from "react";
import { DEMO_SHAPES, getDemoShape } from "../voxel/shapes.js";
import VoxelViewer from "./VoxelViewer.jsx";

const DEFAULT_SHAPE_ID = "sphere";
const DEFAULT_VOXEL_SIZE = 0.5;
// 0.2 world units = 1/5 stud = 1/2 plate: the finest size worth offering
// (a radius-5 sphere is already ~65k voxels there).
const MIN_VOXEL_SIZE = 0.2;
const MAX_VOXEL_SIZE = 2;

function generate(shapeId, voxelSize) {
  return { shapeId, grid: getDemoShape(shapeId).generate({ voxelSize }) };
}

const format = (values) => values.map((v) => +v.toFixed(2)).join(" × ");

/**
 * Development demo for the voxel layer:
 *   pick a shape + voxel size -> voxelize (src/voxel, pure JS) -> view it.
 * Nothing here turns voxels into LEGO; that is a later milestone.
 */
export default function VoxelDemo() {
  const [shapeId, setShapeId] = useState(DEFAULT_SHAPE_ID);
  const [voxelSizeText, setVoxelSizeText] = useState(String(DEFAULT_VOXEL_SIZE));
  const [error, setError] = useState(null);
  const [result, setResult] = useState(() => generate(DEFAULT_SHAPE_ID, DEFAULT_VOXEL_SIZE));

  function handleSubmit(event) {
    event.preventDefault();
    const voxelSize = Number(voxelSizeText);
    if (!Number.isFinite(voxelSize) || voxelSize < MIN_VOXEL_SIZE || voxelSize > MAX_VOXEL_SIZE) {
      setError(`Voxel size must be between ${MIN_VOXEL_SIZE} and ${MAX_VOXEL_SIZE}.`);
      return;
    }
    setError(null);
    setResult(generate(shapeId, voxelSize));
  }

  const { grid } = result;
  const shape = getDemoShape(result.shapeId);

  return (
    <>
      <div className="viewer">
        {/* key: a different shape gets a fresh camera framing (see VoxelViewer). */}
        <VoxelViewer key={result.shapeId} grid={grid} />
      </div>

      <aside className="panel">
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Shape</span>
            <select value={shapeId} onChange={(e) => setShapeId(e.target.value)}>
              {DEMO_SHAPES.map((s) => (
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
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary">
            Generate
          </button>
        </form>

        <dl className="stats">
          <dt>Showing</dt>
          <dd>{shape.label}</dd>
          <dt>Voxel size</dt>
          <dd>{grid.voxelSize}</dd>
          <dt>Grid</dt>
          <dd>{grid.width} × {grid.height} × {grid.depth} cells</dd>
          <dt>Occupied</dt>
          <dd>{grid.count.toLocaleString()} voxels</dd>
          <dt>World size</dt>
          <dd>{format(grid.getWorldBounds().size)}</dd>
        </dl>

        <p className="legend">
          <span style={{ color: "#d64545" }}>X</span>{" "}
          <span style={{ color: "#2f9e44" }}>Y (up)</span>{" "}
          <span style={{ color: "#3b6fd6" }}>Z</span> axes start at the corner of cell (0, 0, 0). Colour
          shows height only.
        </p>
      </aside>

      <p className="hint">Drag to rotate. Scroll to zoom.</p>
    </>
  );
}
