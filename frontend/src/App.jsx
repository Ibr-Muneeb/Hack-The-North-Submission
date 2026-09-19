import { useState } from "react";
import LEGOViewer from "./components/LEGOViewer.jsx";
import VoxelDemo from "./components/VoxelDemo.jsx";
import { testModel } from "./lego/model.js";

// Two independent systems, selectable for development. The voxel layer
// (src/voxel) is not connected to the LEGO layer (src/lego) yet.
const MODES = [
  { id: "lego", label: "LEGO Model", subtitle: "3D LEGO brick viewer" },
  { id: "voxel", label: "Voxel Demo", subtitle: "3D voxel grid (not LEGO yet)" },
];
const DEFAULT_MODE = "voxel";

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

      {mode === "lego" ? (
        <>
          <div className="viewer">
            <LEGOViewer model={testModel} />
          </div>
          <p className="hint">Drag to rotate. Scroll to zoom.</p>
        </>
      ) : (
        <VoxelDemo />
      )}
    </main>
  );
}
