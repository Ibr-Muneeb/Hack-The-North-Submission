import { Edges, RoundedBox } from "@react-three/drei";


const BODY_HEIGHT = 0.72;
const LAYER_HEIGHT = 0.78;
const STUD_HEIGHT = 0.16;
const STUD_RADIUS = 0.29;
const BRICK_GAP = 0.055;


function brickColor(layer, dimensions) {
  if (layer >= dimensions[1] - 3) return "#d9362b";
  if (layer === 0) return "#2764c7";
  return "#f2c230";
}


export default function LegoBrick({ brick, dimensions }) {
  const [x, y, z] = brick.position;
  const footprintX = brick.orientation === "XZ" ? brick.width : brick.length;
  const footprintZ = brick.orientation === "XZ" ? brick.length : brick.width;
  const color = brickColor(y, dimensions);
  const studs = [];

  for (let studX = 0; studX < footprintX; studX += 1) {
    for (let studZ = 0; studZ < footprintZ; studZ += 1) {
      studs.push([studX - footprintX / 2 + 0.5, studZ - footprintZ / 2 + 0.5]);
    }
  }

  return (
    <group
      name={`${brick.type}-${brick.orientation}`}
      position={[
        x + footprintX / 2 - dimensions[0] / 2,
        y * LAYER_HEIGHT + BODY_HEIGHT / 2,
        z + footprintZ / 2 - dimensions[2] / 2,
      ]}
    >
      <RoundedBox
        args={[footprintX - BRICK_GAP, BODY_HEIGHT, footprintZ - BRICK_GAP]}
        radius={0.055}
        smoothness={2}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={0.31} metalness={0.02} />
        <Edges color="#481d18" opacity={0.22} transparent />
      </RoundedBox>

      {studs.map(([studX, studZ]) => (
        <mesh
          key={`${studX}-${studZ}`}
          position={[studX, BODY_HEIGHT / 2 + STUD_HEIGHT / 2 - 0.01, studZ]}
          castShadow
        >
          <cylinderGeometry args={[STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 20]} />
          <meshStandardMaterial color={color} roughness={0.28} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}
