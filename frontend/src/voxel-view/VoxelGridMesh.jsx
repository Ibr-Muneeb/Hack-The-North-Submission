import { useCallback, useMemo } from "react";
import * as THREE from "three";

/**
 * Debug renderer for a VoxelGrid (see src/voxel/VoxelGrid.js).
 *
 * Every occupied voxel is one instance of a unit cube in a single
 * InstancedMesh (one draw call however many voxels there are). Each instance
 * is scaled to `voxelSize * fill` and placed at the voxel's world-space
 * centre, so the pitch between cubes is exactly `voxelSize`. `fill` < 1
 * leaves a thin visible gap between neighbours, which is what makes the
 * discrete grid readable instead of looking like one smooth blob.
 *
 * Colour is display-only: a low -> high gradient by height (grid Y) so the
 * shape's vertical structure and orientation are easy to read. It is NOT part
 * of the voxel data, which has no colour.
 */

const LOW_COLOR = new THREE.Color("#3f6db3");
const HIGH_COLOR = new THREE.Color("#f0a93a");

export const DEFAULT_VOXEL_FILL = 0.92;

export default function VoxelGridMesh({ grid, fill = DEFAULT_VOXEL_FILL }) {
  const voxels = useMemo(() => grid.getOccupiedVoxels(), [grid]);
  const count = voxels.length;

  // A callback ref runs whenever the InstancedMesh is (re)created or this
  // callback changes, i.e. when the grid or fill changes - exactly when the
  // per-instance data has to be rewritten.
  const writeInstances = useCallback(
    (mesh) => {
      if (!mesh) return;
      const matrix = new THREE.Matrix4();
      const color = new THREE.Color();
      const scale = grid.voxelSize * fill;
      const topLayer = Math.max(1, grid.height - 1);

      voxels.forEach(({ x, y, z }, i) => {
        const [cx, cy, cz] = grid.voxelCenter(x, y, z);
        mesh.setMatrixAt(i, matrix.makeScale(scale, scale, scale).setPosition(cx, cy, cz));
        mesh.setColorAt(i, color.lerpColors(LOW_COLOR, HIGH_COLOR, y / topLayer));
      });

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    [grid, voxels, fill],
  );

  if (count === 0) return null;

  return (
    // key={count}: the instance buffers are sized at creation, so a different
    // voxel count needs a fresh InstancedMesh rather than an in-place update.
    <instancedMesh
      key={count}
      ref={writeInstances}
      args={[undefined, undefined, count]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.65} metalness={0.05} />
    </instancedMesh>
  );
}
