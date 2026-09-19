import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import LEGOModel from "../lego/LEGOModel.jsx";
import { getModelBounds } from "../lego/coordinates.js";

const FOV = 35;
const VIEW_DIRECTION = new THREE.Vector3(0.75, 0.65, 1).normalize();

export default function LEGOViewer({ model }) {
  const { center, radius, camera } = useMemo(() => {
    const { size, center } = getModelBounds(model);
    const radius = Math.hypot(...size) / 2;
    // Distance at which the model's bounding sphere just fits the vertical FOV.
    const distance = (radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * 1.05;
    // Orbit target is the model's centre once it has been moved to the origin (below).
    const target = new THREE.Vector3(0, center[1], 0);
    return {
      center,
      radius,
      camera: {
        fov: FOV,
        near: radius / 50,
        far: radius * 50,
        position: target.clone().addScaledVector(VIEW_DIRECTION, distance).toArray(),
      },
    };
  }, [model]);

  // Display-only offset: put the model's footprint centre at the origin so the
  // lights, shadows and orbit target are all simple. Model data is untouched.
  return (
    <Canvas
      shadows="percentage"
      camera={camera}
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight
        castShadow
        position={[-radius * 1.1, radius * 3, radius * 1.5]}
        intensity={1.9}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-radius * 1.8}
        shadow-camera-right={radius * 1.8}
        shadow-camera-top={radius * 1.8}
        shadow-camera-bottom={-radius * 1.8}
        shadow-camera-near={0.1}
        shadow-camera-far={radius * 8}
        shadow-bias={-0.0002}
        shadow-normalBias={0.006}
      />

      {/* Procedural studio reflections: no HDR download, works offline. */}
      <Environment resolution={256} environmentIntensity={1.1}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 4]} scale={[14, 5, 1]} onUpdate={(l) => l.lookAt(0, 0, 0)} />
        <Lightformer form="rect" intensity={1.5} position={[-7, 2, 1]} scale={[6, 4, 1]} onUpdate={(l) => l.lookAt(0, 0, 0)} />
        <Lightformer form="rect" intensity={1.5} position={[7, 2, -3]} scale={[6, 4, 1]} onUpdate={(l) => l.lookAt(0, 0, 0)} />
      </Environment>

      <group position={[-center[0], 0, -center[2]]}>
        <LEGOModel model={model} />
      </group>

      {/* Invisible ground that only shows the shadow. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
        <planeGeometry args={[radius * 20, radius * 20]} />
        <shadowMaterial opacity={0.22} />
      </mesh>

      <OrbitControls
        makeDefault
        enableDamping
        target={[0, center[1], 0]}
        minDistance={radius * 1.2}
        maxDistance={radius * 8}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </Canvas>
  );
}
