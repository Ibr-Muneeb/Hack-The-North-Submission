import LEGOViewer from "./components/LEGOViewer.jsx";
import { testModel } from "./lego/model.js";

export default function App() {
  return (
    <main className="app">
      <header className="masthead">
        <h1>BRICKIFY</h1>
        <p>3D LEGO brick viewer</p>
      </header>
      <div className="viewer">
        <LEGOViewer model={testModel} />
      </div>
      <p className="hint">Drag to rotate. Scroll to zoom.</p>
    </main>
  );
}
