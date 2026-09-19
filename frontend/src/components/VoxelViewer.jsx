import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import AxisGizmo from "../voxel-view/AxisGizmo.jsx";
import GridBounds from "../voxel-view/GridBounds.jsx";
import VoxelGridMesh from "../voxel-view/VoxelGridMesh.jsx";

const FOV = 35;
const VIEW_DIRECTION = new THREE.Vector3(0.75, 0.65, 1).normalize();

/** Camera framing for a grid's world-space box (same approach as LEGOViewer). */
function frameGrid(grid) {
  const { size } = grid.getWorldBounds();
  const radius = Math.hypot(...size) / 2;
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * 1.05;
  const target = new THREE.Vector3(0, size[1] / 2, 0);
  return {
    radius,
    target: target.toArray(),
    camera: {
      fov: FOV,
      near: radius / 50,
      far: radius * 50,
      position: target.clone().addScaledVector(VIEW_DIRECTION, distance).toArray(),
    },
  };
}

/**
 * Debug viewer for a VoxelGrid. Takes the grid as data and knows nothing
 * about how it was made (or about LEGO), so it can be toggled or swapped
 * out without touching src/voxel or src/lego.
 *
 * Camera framing is captured ONCE when the viewer mounts, so changing the
 * voxel size of the same shape does not yank the camera back while you are
 * comparing. Mount it with a `key` (e.g. the shape id) to re-frame for a
 * different shape.
 */
export default function VoxelViewer({ grid }) {
  const [{ radius, target, camera }] = useState(() => frameGrid(grid));

  // Display-only offset: centre the grid's footprint on the origin and rest
  // its floor at y = 0, so lights, shadows and the orbit target stay simple.
  // Voxel data and world coordinates are untouched.
  const { min, center } = grid.getWorldBounds();
  const offset = [-center[0], -min[1], -center[2]];

  return (
    <Canvas
      shadows="percentage"
      camera={camera}
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight
        castShadow
        position={[-radius * 1.1, radius * 3, radius * 1.5]}
        intensity={2}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-radius * 1.8}
        shadow-camera-right={radius * 1.8}
        shadow-camera-top={radius * 1.8}
        shadow-camera-bottom={-radius * 1.8}
        shadow-camera-near={0.1}
        shadow-camera-far={radius * 8}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
      />
      {/* Unshadowed fill from the opposite side so no face goes fully dark. */}
      <directionalLight position={[radius * 2, radius, -radius * 2]} intensity={0.7} />

      <group position={offset}>
        <VoxelGridMesh grid={grid} />
        <GridBounds grid={grid} />
        <AxisGizmo position={min} length={Math.max(...grid.getWorldBounds().size) * 0.3} />
      </group>

      {/* Invisible ground that only shows the shadow. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
        <planeGeometry args={[radius * 20, radius * 20]} />
        <shadowMaterial opacity={0.22} />
      </mesh>

      <OrbitControls
        makeDefault
        enableDamping
        target={target}
        minDistance={radius * 0.5}
        maxDistance={radius * 8}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </Canvas>
  );
}
