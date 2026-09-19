import { useMemo } from "react";
import * as THREE from "three";
import { getBrickGeometry } from "./brickGeometry.js";
import { BRICK_PLATES, footprint, gridToWorld, STUD_PITCH, toPosition } from "./coordinates.js";

// Approximate LEGO colours. Anything not listed is passed through as a CSS colour.
const LEGO_COLORS = {
  red: "#C91A09",
  blue: "#0055BF",
  yellow: "#F2CD37",
  green: "#237841",
  white: "#F2F3F2",
  black: "#1B2A34",
  orange: "#FE8A18",
  gray: "#9BA19D",
  grey: "#9BA19D",
};

// One material per colour, shared by every brick of that colour.
const materials = new Map();
function getMaterial(color) {
  let material = materials.get(color);
  if (!material) {
    material = new THREE.MeshPhysicalMaterial({
      color: LEGO_COLORS[color] ?? color,
      roughness: 0.4,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
    });
    materials.set(color, material);
  }
  return material;
}

/**
 * One brick. Props are grid-space model data (see coordinates.js):
 *   width, depth  studs        height  plates (brick = 3)
 *   position      {x,y,z} or [x,y,z], min corner of the occupied cells
 *   rotation      degrees about Y, multiple of 90
 * Extra fields on a model brick (partId, type) are accepted and ignored.
 */
export default function Brick({
  width = 2,
  depth = 4,
  height = BRICK_PLATES,
  color = "red",
  position = { x: 0, y: 0, z: 0 },
  rotation = 0,
}) {
  const geometry = useMemo(() => getBrickGeometry(width, depth, height), [width, depth, height]);
  const material = useMemo(() => getMaterial(color), [color]);

  // The geometry is centred on its footprint; grid `position` is the footprint's
  // min corner, so shift by half the (rotated) footprint.
  const fp = footprint({ width, depth, rotation });
  const [wx, wy, wz] = gridToWorld(toPosition(position));
  const centre = [wx + (fp.width * STUD_PITCH) / 2, wy, wz + (fp.depth * STUD_PITCH) / 2];

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={centre}
      rotation-y={THREE.MathUtils.degToRad(rotation)}
      castShadow
      receiveShadow
    />
  );
}
