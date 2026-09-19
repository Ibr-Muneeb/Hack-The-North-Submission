import { useEffect, useState } from "react";
import PartsPanel from "./components/PartsPanel.jsx";
import LegoViewer from "./viewer/LegoViewer.jsx";


export default function App() {
  const [model, setModel] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [demos, setDemos] = useState([]);
  const [selectedDemo, setSelectedDemo] = useState("house");
  const [autoRotate, setAutoRotate] = useState(true);
  const [resetSignal, setResetSignal] = useState(0);

  async function loadDemo(modelId = selectedDemo) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/lego/demo?model=${encodeURIComponent(modelId)}`);
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }
      setModel(await response.json());
      setResetSignal((value) => value + 1);
    } catch (loadError) {
      setError(
        `Could not load the LEGO demo. Make sure the FastAPI backend is running. ${loadError.message}`,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function initialize() {
      try {
        const response = await fetch("/api/lego/demos");
        if (response.ok) {
          const result = await response.json();
          setDemos(result.models);
        }
      } catch {
        // The model request below provides the actionable backend error state.
      }
      await loadDemo("house");
    }

    initialize();
  }, []);

  function selectDemo(event) {
    const modelId = event.target.value;
    setSelectedDemo(modelId);
    loadDemo(modelId);
  }

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
            <label className="model-select">
              <span>Model</span>
              <select value={selectedDemo} onChange={selectDemo}>
                {(demos.length ? demos : [{ model_id: "house", model_name: "Brickify House" }])
                  .map((demo) => (
                    <option key={demo.model_id} value={demo.model_id}>
                      {demo.model_name}
                    </option>
                  ))}
              </select>
            </label>
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

        <div className="model-workspace">
          <div className="viewer-frame">
            {loading && <div className="status-message">Assembling bricks…</div>}
            {error && (
              <div className="status-message error-message">
                <p>{error}</p>
                <button type="button" onClick={() => loadDemo(selectedDemo)}>Try again</button>
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
          {model && <PartsPanel model={model} />}
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
            <div>
              <dt>Piece types</dt>
              <dd>{model.statistics.unique_piece_types}</dd>
            </div>
            <div>
              <dt>Colors</dt>
              <dd>{model.statistics.color_count}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}
