import { useState } from "react";
import DecomposeDemo from "./components/DecomposeDemo.jsx";
import ImageToLegoDemo from "./components/ImageToLegoDemo.jsx";
import LEGOViewer from "./components/LEGOViewer.jsx";
import VoxelDemo from "./components/VoxelDemo.jsx";
import { testModel } from "./lego/model.js";

// Four views, selectable for development. "Decompose" joins the voxel layer
// (src/voxel) to the LEGO layer (src/lego), via the decomposition layer
// (src/decomposition). "Image → LEGO" (Milestone 7) adds a reconstruction
// layer (src/reconstruction) in front of that same pipeline: image -> voxels
// -> the same M6 decomposer -> the same LDraw renderer.
const MODES = [
  { id: "lego", label: "LEGO Model", subtitle: "3D LEGO brick viewer" },
  { id: "voxel", label: "Voxel Demo", subtitle: "3D voxel grid (no LEGO)" },
  { id: "decompose", label: "Decompose", subtitle: "voxels → LEGO bricks (3001)" },
  { id: "image", label: "Image → LEGO", subtitle: "photo → 3D reconstruction → LEGO" },
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
      {mode === "image" && <ImageToLegoDemo />}
    </main>
  );
}