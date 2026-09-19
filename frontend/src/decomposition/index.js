/**
 * Public surface of the decomposition layer: VoxelGrid -> LEGO model data.
 *
 * Pure JavaScript. It may depend on src/voxel (grid data) and on the LEGO
 * DATA definitions in src/lego (coordinates.js, model format), but never on
 * React, Three.js, R3F, LDraw Object3Ds or any UI component.
 */
export { LegoOccupancy, LEGO_CELL_SIZE, MAX_LEGO_CELLS } from "./LegoOccupancy.js";
export {
  describeVoxelScale,
  legoGridSizeFor,
  voxelGridToLegoOccupancy,
  worldToLegoCell,
  DEFAULT_FILL_THRESHOLD,
} from "./voxelToLegoGrid.js";
export {
  brickCells,
  canPlaceBrick,
  getPart,
  isValidRotation,
  markPlaced,
  footingRatio,
  neighbourContacts,
  placementFootprint,
  scorePlacement,
  supportRatio,
  toModelBrick,
  DISTINCT_ROTATIONS,
  MIN_SUPPORT_RATIO,
  PART_3001,
  REJECTED,
  VALID_ROTATIONS,
} from "./brickPlacement.js";
export { decomposeOccupancy, decomposeVoxelGrid, DEFAULT_BRICK_COLOR } from "./decomposer.js";
export {
  findOverlaps,
  validateDecompositionOptions,
  validateDecompositionResult,
  validateVoxelGridInput,
} from "./decompositionValidation.js";
export { DECOMPOSITION_SHAPES, getDecompositionShape, voxelizeLegoBox } from "./demoShapes.js";
