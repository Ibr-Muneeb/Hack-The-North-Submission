import { Edges, RoundedBox } from "@react-three/drei";


const PLATE_UNIT_HEIGHT = 0.24;
const BRICK_GRID_LAYER_HEIGHT = 0.78;
const PLATE_GRID_LAYER_HEIGHT = 0.26;
const STUD_HEIGHT = 0.16;
const STUD_RADIUS = 0.29;
const PIECE_GAP = 0.055;


export default function LegoPiece({ placement, piece, color, dimensions, gridMode }) {
  const [x, y, z] = placement.position;
  const rotation = placement.rotation_degrees ?? 0;
  const isQuarterTurn = rotation % 180 !== 0;
  const footprintX = isQuarterTurn ? piece.depth : piece.width;
  const footprintZ = isQuarterTurn ? piece.width : piece.depth;
  const bodyHeight = piece.height_units * PLATE_UNIT_HEIGHT;
  const layerHeight = gridMode === "plate" ? PLATE_GRID_LAYER_HEIGHT : BRICK_GRID_LAYER_HEIGHT;
  const studs = [];

  for (let studX = 0; studX < piece.width; studX += 1) {
    for (let studZ = 0; studZ < piece.depth; studZ += 1) {
      studs.push([
        studX - piece.width / 2 + 0.5,
        studZ - piece.depth / 2 + 0.5,
      ]);
    }
  }

  return (
    <group
      name={`${placement.piece_id}-${rotation}`}
      position={[
        x + footprintX / 2 - dimensions[0] / 2,
        y * layerHeight + bodyHeight / 2,
        z + footprintZ / 2 - dimensions[2] / 2,
      ]}
    >
      <group rotation={[0, -(rotation * Math.PI) / 180, 0]}>
        <RoundedBox
          args={[piece.width - PIECE_GAP, bodyHeight, piece.depth - PIECE_GAP]}
          radius={Math.min(0.055, bodyHeight * 0.2)}
          smoothness={2}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={color.hex} roughness={0.31} metalness={0.02} />
          <Edges color="#2b313b" opacity={0.2} transparent />
        </RoundedBox>

        {piece.rendering.studs && studs.map(([studX, studZ]) => (
          <mesh
            key={`${studX}-${studZ}`}
            position={[studX, bodyHeight / 2 + STUD_HEIGHT / 2 - 0.01, studZ]}
            castShadow
          >
            <cylinderGeometry args={[STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 20]} />
            <meshStandardMaterial color={color.hex} roughness={0.28} metalness={0.02} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
