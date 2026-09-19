import { useEffect, useState } from "react";
import LegoViewer from "./viewer/LegoViewer.jsx";


export default function App() {
  const [model, setModel] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [resetSignal, setResetSignal] = useState(0);

  async function loadDemo() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/lego/demo");
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }
      setModel(await response.json());
    } catch (loadError) {
      setError(
        `Could not load the LEGO demo. Make sure the FastAPI backend is running. ${loadError.message}`,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDemo();
  }, []);

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div>
          <p className="eyebrow">PHOTO → 3D → LEGO</p>
          <h1>Brickify</h1>
          <p className="hero-copy">
            A real voxel decomposition, rebuilt brick by brick in your browser.
          </p>
        </div>
      </header>

      <section className="demo-card" aria-label="Interactive LEGO model demo">
        <div className="demo-heading">
          <div>
            <p className="section-label">LIVE PIPELINE DEMO</p>
            <h2>{model?.model_name ?? "LEGO model"}</h2>
          </div>
          <div className="viewer-actions">
            <button type="button" onClick={() => setResetSignal((value) => value + 1)}>
              Reset camera
            </button>
            <button
              type="button"
              className={autoRotate ? "active" : ""}
              aria-pressed={autoRotate}
              onClick={() => setAutoRotate((value) => !value)}
            >
              Auto-rotate {autoRotate ? "on" : "off"}
            </button>
          </div>
        </div>

        <div className="viewer-frame">
          {loading && <div className="status-message">Assembling bricks…</div>}
          {error && (
            <div className="status-message error-message">
              <p>{error}</p>
              <button type="button" onClick={loadDemo}>Try again</button>
            </div>
          )}
          {model && !loading && !error && (
            <LegoViewer
              model={model}
              autoRotate={autoRotate}
              resetSignal={resetSignal}
            />
          )}
          <p className="interaction-hint">Drag to rotate · Scroll to zoom · Right-drag to pan</p>
        </div>

        {model && (
          <dl className="stats-grid">
            <div>
              <dt>LEGO bricks</dt>
              <dd>{model.brick_count}</dd>
            </div>
            <div>
              <dt>Occupied voxels</dt>
              <dd>{model.voxel_count}</dd>
            </div>
            <div>
              <dt>Grid dimensions</dt>
              <dd>{model.dimensions.join(" × ")}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}
