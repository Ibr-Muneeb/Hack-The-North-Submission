/**
 * Public surface of the reconstruction layer: uploaded image -> VoxelGrid.
 *
 * May depend on src/voxel (grid data) and its own siblings only - never on
 * React, Three.js, R3F, LDraw Object3Ds, decomposition, or UI components.
 * Enforced by tests/architecture.test.js.
 */
export {
  RECONSTRUCTION_STATUS,
  SUPPORTED_IMAGE_TYPES,
  SUPPORTED_IMAGE_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  MAX_IMAGE_DIMENSION,
  DEFAULT_MAX_PROCESSING_DIMENSION,
  DEFAULT_MAX_VOXEL_DIMENSION,
  DEFAULT_RECONSTRUCTION_VOXEL_SIZE,
  ReconstructionError,
} from "./reconstructionTypes.js";
export {
  validateImageFile,
  validateImageDimensions,
  computeProcessingSize,
  decodeImageFile,
} from "./imagePreprocessing.js";
export { extractForegroundMask, computeLuminance, hasUsableAlpha, centerEllipseMask } from "./segmentation.js";
export { computeDepthField, distanceTransform } from "./depthField.js";
export { buildVoxelGridFromSilhouette } from "./depthToVoxels.js";
export {
  cleanupVoxelGrid,
  fillSmallHoles,
  removeIsolatedVoxels,
  keepLargestComponent3D,
} from "./voxelCleanup.js";
export { reconstructFromImage, reconstructVoxelGridFromImageData } from "./reconstructFromImage.js";