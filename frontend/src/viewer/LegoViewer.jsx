import { ContactShadows, Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import LegoPiece from "./LegoPiece.jsx";


function CameraControls({ dimensions, autoRotate, resetSignal }) {
  const controls = useRef();
  const { camera } = useThree();
  const modelSize = Math.max(...dimensions);
  const cameraPosition = useMemo(
    () => [modelSize * 1.45, modelSize * 1.15, modelSize * 1.45],
    [modelSize],
  );
  const target = useMemo(() => [0, dimensions[1] * 0.34, 0], [dimensions]);

  useEffect(() => {
    camera.position.set(...cameraPosition);
    camera.far = modelSize * 12;
    camera.updateProjectionMatrix();
    controls.current?.target.set(...target);
    controls.current?.update();
  }, [camera, cameraPosition, modelSize, resetSignal, target]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      autoRotate={autoRotate}
      autoRotateSpeed={0.75}
      enableDamping
      dampingFactor={0.07}
      minDistance={modelSize * 0.65}
      maxDistance={modelSize * 4}
      maxPolarAngle={Math.PI / 2.04}
      target={target}
    />
  );
}


function LegoScene({ model, autoRotate, resetSignal }) {
  return (
    <>
      <color attach="background" args={["#e8edf3"]} />
      <fog attach="fog" args={["#e8edf3", 18, 42]} />
      <ambientLight intensity={1.25} />
      <hemisphereLight args={["#ffffff", "#6d7890", 1.4]} />
      <directionalLight
        position={[8, 14, 10]}
        intensity={2.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <directionalLight position={[-8, 6, -5]} intensity={0.7} color="#b9d2ff" />

      <group>
        {model.bricks.map((placement) => (
          <LegoPiece
            key={`${placement.position.join("-")}-${placement.piece_id}`}
            placement={placement}
            piece={model.piece_catalog[placement.piece_id]}
            color={model.color_catalog[placement.color_id]}
            dimensions={model.dimensions}
            gridMode={model.grid_mode}
          />
        ))}
      </group>

      <ContactShadows
        position={[0, -0.03, 0]}
        opacity={0.33}
        scale={22}
        blur={2.2}
        far={12}
        resolution={512}
      />
      <Grid
        position={[0, -0.045, 0]}
        args={[30, 30]}
        cellSize={1}
        cellThickness={0.55}
        cellColor="#c4ccd8"
        sectionSize={5}
        sectionThickness={0.85}
        sectionColor="#aab5c5"
        fadeDistance={25}
        infiniteGrid
      />
      <CameraControls
        dimensions={model.dimensions}
        autoRotate={autoRotate}
        resetSignal={resetSignal}
      />
    </>
  );
}


export default function LegoViewer({ model, autoRotate, resetSignal }) {
  return (
    <Canvas
      camera={{ fov: 38, near: 0.1, far: 100 }}
      dpr={[1, 1.5]}
      shadows
      gl={{ antialias: true }}
    >
      <LegoScene model={model} autoRotate={autoRotate} resetSignal={resetSignal} />
    </Canvas>
  );
}
