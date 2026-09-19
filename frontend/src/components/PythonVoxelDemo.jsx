import { useState } from "react";
import { loadVoxelJson } from "../voxel/loadVoxelJson.js";
import VoxelViewer from "./VoxelViewer.jsx";

const SAMPLE_URL = "/samples/output_voxels.json";

export default function PythonVoxelDemo() {
  const [grid, setGrid] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadSample() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(SAMPLE_URL);
      if (!response.ok) {
        throw new Error(`Could not load sample JSON (${response.status} ${response.statusText}).`);
      }
      const data = await response.json();
      setGrid(loadVoxelJson(data));
    } catch (loadError) {
      setGrid(null);
      setError(loadError instanceof Error ? loadError.message : "Could not load voxel JSON.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {grid && (
        <div className="viewer">
          <VoxelViewer key={`${grid.width}-${grid.height}-${grid.depth}-${grid.voxelSize}`} grid={grid} />
        </div>
      )}

      <aside className="panel">
        <button type="button" className="primary" onClick={loadSample} disabled={loading}>
          {loading ? "Loading…" : "Load Python Voxel JSON"}
        </button>

        {error && (
          <p className="field-error python-load-error" role="alert">
            {error}
          </p>
        )}

        {grid ? (
          <dl className="stats">
            <dt>Dimensions</dt>
            <dd>{grid.width} × {grid.height} × {grid.depth}</dd>
            <dt>Voxel size</dt>
            <dd>{grid.voxelSize}</dd>
            <dt>Occupied</dt>
            <dd>{grid.count.toLocaleString()} voxels</dd>
          </dl>
        ) : (
          <p className="legend">Load the frontend sample copied from Python's voxelizer output.</p>
        )}
      </aside>

      {grid && <p className="hint">Drag to rotate. Scroll to zoom.</p>}
    </>
  );
}
