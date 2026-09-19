/**
 * Shapes for the LEGO decomposition demo.
 *
 * Two kinds:
 *   - the existing Milestone 4 shapes (sphere, cube, cylinder, staircase),
 *     reused as-is from src/voxel/shapes.js,
 *   - solids sized in LEGO units, so a correct decomposition has an obvious
 *     expected answer (e.g. a 2x4x3-plate solid must become exactly one 3001).
 *
 * The LEGO-sized solids live here rather than in src/voxel/ on purpose: they
 * need LEGO dimensions (studs, plates), and src/voxel must stay free of any
 * LEGO knowledge. This module may depend on both layers.
 */

import { VoxelGrid } from "../voxel/VoxelGrid.js";
import { DEMO_SHAPES } from "../voxel/shapes.js";
import { voxelizeStaircase } from "../voxel/voxelizeStaircase.js";
import { describeVoxelScale } from "./voxelToLegoGrid.js";

/**
 * A solid rectangular block sized in LEGO units, filling its grid exactly.
 *
 *   studsX  studs along X      studsZ  studs along Z      plates  plates along Y
 *
 * With an aligned voxelSize (0.2, 0.1, ...) the block's faces land exactly on
 * LEGO cell boundaries. With a non-aligned size the voxel counts are rounded
 * to the nearest whole voxel, so the block is the closest representable solid
 * rather than an error - the decomposition then simply reports lower coverage.
 */
export function voxelizeLegoBox({ studsX = 2, studsZ = 4, plates = 3, voxelSize = 0.2 } = {}) {
  for (const [name, value] of [["studsX", studsX], ["studsZ", studsZ], ["plates", plates]]) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive integer, got ${value}`);
    }
  }

  const scale = describeVoxelScale(voxelSize);
  const width = Math.max(1, Math.round(studsX * scale.voxelsPerStud));
  const height = Math.max(1, Math.round(plates * scale.voxelsPerPlate));
  const depth = Math.max(1, Math.round(studsZ * scale.voxelsPerStud));

  const grid = new VoxelGrid(width, height, depth, { voxelSize });
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) grid.set(x, y, z, true);
    }
  }
  return grid;
}

/** LEGO-aligned reference solids with a known expected decomposition. */
const EXACT_SHAPES = [
  {
    id: "exact-brick",
    label: "Exact 2×4 brick",
    description: "2×4 studs, 3 plates → 1 × 3001",
    generate: ({ voxelSize }) => voxelizeLegoBox({ studsX: 2, studsZ: 4, plates: 3, voxelSize }),
  },
  {
    id: "exact-4x4",
    label: "Exact 4×4 block",
    description: "4×4 studs, 3 plates → 2 × 3001",
    generate: ({ voxelSize }) => voxelizeLegoBox({ studsX: 4, studsZ: 4, plates: 3, voxelSize }),
  },
  {
    id: "exact-slab",
    label: "Large slab",
    description: "8×4 studs, 2 courses → 8 × 3001",
    generate: ({ voxelSize }) => voxelizeLegoBox({ studsX: 8, studsZ: 4, plates: 6, voxelSize }),
  },
  {
    // A staircase whose steps are whole LEGO units: 2 studs of tread per step,
    // and a rise of 1.2 world units = 3 plates = exactly one brick course. Every
    // step edge therefore lands on a LEGO cell boundary, so the decomposition can
    // reproduce it exactly. The Milestone 4 "Staircase" below uses 1.5-stud
    // treads, which no whole number of studs can represent - a useful contrast.
    id: "exact-staircase",
    label: "LEGO-aligned staircase",
    description: "4 steps, 2 studs x 1 course each",
    generate: ({ voxelSize }) =>
      voxelizeStaircase({ steps: 4, stepRun: 2, stepRise: 1.2, width: 4, voxelSize }),
  },
  {
    id: "exact-tower",
    label: "Tall tower",
    description: "2×4 studs, 5 courses → 5 × 3001",
    generate: ({ voxelSize }) => voxelizeLegoBox({ studsX: 2, studsZ: 4, plates: 15, voxelSize }),
  },
];

/** Everything the decomposition demo offers: exact solids first, then the M4 shapes. */
export const DECOMPOSITION_SHAPES = [...EXACT_SHAPES, ...DEMO_SHAPES];

export function getDecompositionShape(id) {
  const shape = DECOMPOSITION_SHAPES.find((s) => s.id === id);
  if (!shape) throw new Error(`Unknown decomposition shape "${id}"`);
  return shape;
}
