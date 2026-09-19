import { useState } from "react";
import DecomposeDemo from "./components/DecomposeDemo.jsx";
import LEGOViewer from "./components/LEGOViewer.jsx";
import VoxelDemo from "./components/VoxelDemo.jsx";
import { testModel } from "./lego/model.js";

// Three views, selectable for development. "Decompose" is the one that joins
// the voxel layer (src/voxel) to the LEGO layer (src/lego), via the
// decomposition layer (src/decomposition); the other two stay standalone.
const MODES = [
  { id: "lego", label: "LEGO Model", subtitle: "3D LEGO brick viewer" },
  { id: "voxel", label: "Voxel Demo", subtitle: "3D voxel grid (no LEGO)" },
  { id: "decompose", label: "Decompose", subtitle: "voxels → LEGO bricks (3001)" },
];
const DEFAULT_MODE = "decompose";

export default function App() {
  const [mode, setMode] = useState(DEFAULT_MODE);
  const active = MODES.find((m) => m.id === mode);

  return (
    <main className="app">
      <header className="masthead">
        <h1>BRICKIFY</h1>
        <p>{active.subtitle}</p>
      </header>

      <nav className="mode-switch" aria-label="Viewer mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={m.id === mode ? "active" : ""}
            aria-pressed={m.id === mode}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </nav>

      {mode === "lego" && (
        <>
          <div className="viewer">
            <LEGOViewer model={testModel} />
          </div>
          <p className="hint">Drag to rotate. Scroll to zoom.</p>
        </>
      )}
      {mode === "voxel" && <VoxelDemo />}
      {mode === "decompose" && <DecomposeDemo />}
    </main>
  );
}
