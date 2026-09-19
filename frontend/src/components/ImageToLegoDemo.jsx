import { useState } from "react";
import { reconstructFromImage, RECONSTRUCTION_STATUS } from "../reconstruction/index.js";
import { decomposeVoxelGrid } from "../decomposition/decomposer.js";
import LEGOViewer from "./LEGOViewer.jsx";
import VoxelViewer from "./VoxelViewer.jsx";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

const STATUS_LABELS = {
  [RECONSTRUCTION_STATUS.LOADING_IMAGE]: "Loading image...",
  [RECONSTRUCTION_STATUS.PROCESSING]: "Processing image...",
  [RECONSTRUCTION_STATUS.RECONSTRUCTING]: "Reconstructing 3D shape...",
  [RECONSTRUCTION_STATUS.GENERATING_VOXELS]: "Generating voxel model...",
  [RECONSTRUCTION_STATUS.COMPLETE]: "Complete",
  [RECONSTRUCTION_STATUS.ERROR]: "Error",
};

const percent = (ratio) => `${(ratio * 100).toFixed(1)}%`;

export default function ImageToLegoDemo() {
  const [file, setFile] = useState(null);
  const [grid, setGrid] = useState(null);
  const [result, setResult] = useState(null);
  const [meta, setMeta] = useState(null);
  const [view, setView] = useState("lego");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!file) {
      setError("Choose an image first.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Image is too large. Please choose an image under 15 MB.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(RECONSTRUCTION_STATUS.LOADING_IMAGE);

    try {
      const reconstruction = await reconstructFromImage(
        file,
        {
          voxel: {
            voxelSize: 0.2,
          },
        },
        setStatus,
      );

      const decomposition = decomposeVoxelGrid(reconstruction.grid);

      setGrid(reconstruction.grid);
      setMeta(reconstruction.meta);
      setResult(decomposition);
      setView("lego");
    } catch (problem) {
      setError(problem.message || "Something went wrong while processing the image.");
      setGrid(null);
      setResult(null);
      setMeta(null);
    } finally {
      setBusy(false);
    }
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0] ?? null;

    setFile(selected);
    setError(null);

    if (!selected) {
      setGrid(null);
      setResult(null);
      setMeta(null);
      setStatus(null);
    }
  }

  return (
    <>
      <div className="viewer">
        {grid && result ? (
          view === "lego" ? (
            <LEGOViewer key="image-lego" model={result.model} />
          ) : (
            <VoxelViewer key="image-voxel" grid={grid} />
          )
        ) : (
          <div className="empty-viewer">
            <h2>Image → LEGO</h2>
            <p>
              Upload a photo of a single solid object to reconstruct it as a
              voxel model and LEGO model.
            </p>
          </div>
        )}
      </div>

      <aside className="panel">
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Object image</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
            />
          </label>

          {file && (
            <p className="legend">
              {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}

          {status && (
            <p className="legend" role="status">
              {STATUS_LABELS[status] ?? status}
            </p>
          )}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Building..." : "Create LEGO Model"}
          </button>
        </form>

        {grid && result && (
          <>
            <label className="field">
              <span>Show</span>
              <select
                value={view}
                onChange={(event) => setView(event.target.value)}
              >
                <option value="lego">LEGO model</option>
                <option value="voxel">Voxel reconstruction</option>
              </select>
            </label>

            <dl className="stats">
              <dt>Source image</dt>
              <dd>
                {meta.originalWidth} × {meta.originalHeight}
              </dd>

              <dt>Processed image</dt>
              <dd>
                {meta.sourceWidth} × {meta.sourceHeight}
              </dd>

              <dt>Segmentation</dt>
              <dd>{meta.segmentationMethod}</dd>

              <dt>Foreground</dt>
              <dd>{percent(meta.foregroundRatio)}</dd>

              <dt>Voxel size</dt>
              <dd>{grid.voxelSize}</dd>

              <dt>Target voxels</dt>
              <dd>{result.targetVolume.toLocaleString()}</dd>

              <dt>Bricks</dt>
              <dd>{result.bricks.length.toLocaleString()}</dd>

              <dt>Coverage</dt>
              <dd>{percent(result.coverageRatio)}</dd>

              <dt>False positives</dt>
              <dd>{result.stats.falsePositiveCells.toLocaleString()}</dd>
            </dl>

            {result.warnings.length > 0 && (
              <p className="legend" role="status">
                {result.warnings.join(" ")}
              </p>
            )}

            <p className="legend">
              Brickify uses a deterministic 2.5D reconstruction from the
              uploaded image. It is designed for a single object against a
              relatively simple background rather than true photogrammetry.
            </p>
          </>
        )}
      </aside>

      <p className="hint">Drag to rotate. Scroll to zoom.</p>
    </>
  );
}