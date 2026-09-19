import { useEffect, useState } from "react";
import { instantiateLegoPart } from "./LegoPart.js";

/**
 * Resolves real LDraw geometry for `partId` in `colorHex`.
 *
 * Returns:
 *   - null while loading, when `partId` is not set, or if loading failed
 *     (Brick.jsx treats null as "use the procedural fallback instead")
 *   - a ready-to-render THREE.Object3D once loaded
 */
export function useLDrawPart(partId, colorHex) {
  const [object, setObject] = useState(null);

  useEffect(() => {
    // Nothing to load. Don't setState synchronously here - just skip the
    // effect; the ternary below already returns null for this render.
    if (!partId) return undefined;

    let cancelled = false;
    let loaded = null;

    instantiateLegoPart(partId, colorHex)
      .then((instance) => {
        if (cancelled) return;
        loaded = instance;
        setObject(instance);
      })
      .catch((error) => {
        // Real LDraw geometry couldn't be loaded (bad partId, network issue,
        // missing dependency, ...) - stay on the procedural fallback rather
        // than crashing the viewer.
        console.warn(`[Brickify] Falling back to procedural geometry for part "${partId}":`, error);
        if (!cancelled) setObject(null);
      });

    return () => {
      cancelled = true;
      // Dispose the per-instance material clones made in LegoPart.js; the
      // (shared, cached) geometries are intentionally left alone.
      loaded?.traverse((child) => {
        if (child.isMesh) child.material?.dispose();
      });
    };
  }, [partId, colorHex]);

  return partId ? object : null;
}
