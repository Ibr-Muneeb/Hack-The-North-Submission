import { Html } from "@react-three/drei";

/**
 * X / Y / Z axes drawn from a world-space point (we put it at the grid's
 * minimum corner, i.e. the corner of cell (0, 0, 0)).
 * Colours follow the usual convention: X red, Y green (up), Z blue.
 *
 * Each arrow is modelled pointing along +Y and then rotated onto its axis:
 *   +X: rotate -90 deg about Z      +Z: rotate +90 deg about X
 */
const AXES = [
  { label: "X", color: "#d64545", rotation: [0, 0, -Math.PI / 2] },
  { label: "Y", color: "#2f9e44", rotation: [0, 0, 0] },
  { label: "Z", color: "#3b6fd6", rotation: [Math.PI / 2, 0, 0] },
];

export default function AxisGizmo({ position = [0, 0, 0], length = 2 }) {
  const shaft = length * 0.018;
  const head = length * 0.14;

  return (
    <group position={position}>
      {AXES.map(({ label, color, rotation }) => (
        <group key={label} rotation={rotation}>
          <mesh position={[0, length / 2, 0]}>
            <cylinderGeometry args={[shaft, shaft, length, 10]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh position={[0, length + head / 2, 0]}>
            <coneGeometry args={[shaft * 3.5, head, 16]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <Html position={[0, length + head * 1.8, 0]} center style={{ pointerEvents: "none" }}>
            <span className="axis-label" style={{ color }}>
              {label}
            </span>
          </Html>
        </group>
      ))}
    </group>
  );
}
