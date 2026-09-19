import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Thin wireframe of the WHOLE grid's world-space box (occupied or not). */
export default function GridBounds({ grid, color = "#6d665b" }) {
  const { geometry, center } = useMemo(() => {
    const { size, center } = grid.getWorldBounds();
    const box = new THREE.BoxGeometry(...size);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return { geometry: edges, center };
  }, [grid]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} position={center}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}
