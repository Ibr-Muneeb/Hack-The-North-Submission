import { voxelizeCube } from "./voxelizeCube.js";
import { voxelizeCylinder } from "./voxelizeCylinder.js";
import { voxelizeSphere } from "./voxelizeSphere.js";
import { voxelizeStaircase } from "./voxelizeStaircase.js";

/**
 * The shapes offered by the voxel demo, each with fixed, sensible dimensions
 * (world units) so the UI only has to choose a shape and a voxel size.
 * Plain data + functions: no UI or rendering knowledge lives here.
 */
export const DEMO_SHAPES = [
  {
    id: "sphere",
    label: "Sphere",
    description: "radius 5",
    generate: ({ voxelSize }) => voxelizeSphere({ radius: 5, voxelSize }),
  },
  {
    id: "cube",
    label: "Cube",
    description: "edge 8",
    generate: ({ voxelSize }) => voxelizeCube({ size: 8, voxelSize }),
  },
  {
    id: "cylinder",
    label: "Cylinder",
    description: "radius 4, height 10",
    generate: ({ voxelSize }) => voxelizeCylinder({ radius: 4, height: 10, voxelSize }),
  },
  {
    id: "staircase",
    label: "Staircase",
    description: "6 steps, climbs toward +X",
    generate: ({ voxelSize }) =>
      voxelizeStaircase({ steps: 6, stepRun: 1.5, stepRise: 1, width: 4, voxelSize }),
  },
];

export function getDemoShape(id) {
  const shape = DEMO_SHAPES.find((s) => s.id === id);
  if (!shape) throw new Error(`Unknown demo shape "${id}"`);
  return shape;
}
