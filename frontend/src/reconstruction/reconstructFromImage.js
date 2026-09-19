/**
 * IMAGE -> VOXELGRID (Milestone 7)
 * =================================
 *
 *   uploaded image
 *        v
 *   decode + resize            (imagePreprocessing.js, browser canvas)
 *        v
 *   foreground silhouette      (segmentation.js)
 *        v
 *   depth field (silhouette inflation + brightness cue)  (depthField.js)
 *        v
 *   VoxelGrid                  (depthToVoxels.js -> src/voxel)
 *        v
 *   cleanup                    (voxelCleanup.js)
 *
 * ---- What this is, honestly --------------------------------------------
 * This is a deterministic 2.5D approximation, NOT photogrammetry, NOT a
 * learned monocular-depth model, and not a claim of "true" 3D reconstruction.
 * A single photograph does not contain enough information to recover an
 * object's actual back surface; instead, an object's silhouette is inflated
 * into a plausible rounded volume (see depthField.js for the technique and
 * why it looks convincing for the mug/bottle/toy-shaped "single object,
 * simple background" inputs this milestone targets).
 *
 * This choice (classical CV over an in-browser ML depth model) is
 * deliberate: it needs no model download, cannot fail to load, runs in a
 * few tens of milliseconds even on a large photo, and - per the milestone's
 * own priority order - a simple approximation that reliably looks good beats
 * a fancier one that can fail during a demo. See the M7 section of the
 * README for the full rationale.
 *
 * There is no ML model here, so "fallback" means something narrower than a
 * failed model load: if segmentation cannot find a plausible object (an
 * almost-empty or almost-full mask - see segmentation.js), it falls back to
 * a centred, image-shaped ellipse rather than aborting, so the demo stays
 * driven by the uploaded image instead of failing outright.
 *
 * This module is the one place the browser-only decode step (see
 * imagePreprocessing.js) is wired to the pure, unit-tested steps below it.
 * It imports only src/voxel and its own siblings - no React, no Three.js, no
 * LDraw, no decomposition - so `reconstructVoxelGridFromImageData` (the pure
 * half of this pipeline) can be exercised directly in tests, and the whole
 * pipeline's output plugs straight into the existing M6 decomposer.
 */

import { computeLuminance, extractForegroundMask } from "./segmentation.js";
import { computeDepthField } from "./depthField.js";
import { buildVoxelGridFromSilhouette } from "./depthToVoxels.js";
import { cleanupVoxelGrid } from "./voxelCleanup.js";
import { decodeImageFile } from "./imagePreprocessing.js";
import { DEFAULT_MAX_PROCESSING_DIMENSION, RECONSTRUCTION_STATUS, ReconstructionError } from "./reconstructionTypes.js";

/**
 * The pure half of the pipeline: an already-decoded ImageData-shaped object
 * ({ width, height, data }) in, a cleaned-up VoxelGrid out. No browser APIs,
 * so this is what the test suite exercises directly with synthetic pixels.
 *
 * @param {{width:number, height:number, data:Uint8ClampedArray}} imageData
 * @param {object} [options]
 * @param {object} [options.segmentation]  forwarded to extractForegroundMask
 * @param {object} [options.depth]         forwarded to computeDepthField
 * @param {object} [options.voxel]         forwarded to buildVoxelGridFromSilhouette
 * @param {object} [options.cleanup]       forwarded to cleanupVoxelGrid
 * @param {(status: string) => void} [onStatus]
 */
export function reconstructVoxelGridFromImageData(imageData, options = {}, onStatus) {
  const { width, height } = imageData;

  onStatus?.(RECONSTRUCTION_STATUS.RECONSTRUCTING);
  const { mask, method, ratio } = extractForegroundMask(imageData, options.segmentation);
  const luminance = computeLuminance(imageData);
  const { radius, offset } = computeDepthField(mask, width, height, luminance, options.depth);

  onStatus?.(RECONSTRUCTION_STATUS.GENERATING_VOXELS);
  let grid = buildVoxelGridFromSilhouette({ mask, radius, offset, width, height }, options.voxel);
  grid = cleanupVoxelGrid(grid, options.cleanup);

  if (grid.count === 0) {
    throw new ReconstructionError(
      "empty-result",
      "No object could be reconstructed from this image. Try a photo with a single clear object on a plainer background.",
    );
  }

  return {
    grid,
    meta: {
      segmentationMethod: method,
      foregroundRatio: ratio,
      sourceWidth: width,
      sourceHeight: height,
    },
  };
}

/**
 * Full pipeline: an uploaded File/Blob in, `{ grid, meta }` out, where `grid`
 * is a plain `VoxelGrid` (src/voxel) ready for the existing M6 decomposer.
 *
 * @param {File|Blob} file
 * @param {object} [options]
 * @param {number} [options.maxProcessingDimension]  longest side to decode the image at (perf guard)
 * @param {object} [options.segmentation]
 * @param {object} [options.depth]
 * @param {object} [options.voxel]                    e.g. { maxDimension, voxelSize, depthScale }
 * @param {object} [options.cleanup]
 * @param {(status: string) => void} [onStatus]        called with RECONSTRUCTION_STATUS values as the pipeline progresses
 */
export async function reconstructFromImage(file, options = {}, onStatus) {
  try {
    onStatus?.(RECONSTRUCTION_STATUS.LOADING_IMAGE);
    const imageData = await decodeImageFile(file, options.maxProcessingDimension ?? DEFAULT_MAX_PROCESSING_DIMENSION);

    onStatus?.(RECONSTRUCTION_STATUS.PROCESSING);
    const result = reconstructVoxelGridFromImageData(imageData, options, onStatus);

    onStatus?.(RECONSTRUCTION_STATUS.COMPLETE);
    return {
      ...result,
      meta: {
        ...result.meta,
        originalWidth: imageData.originalWidth,
        originalHeight: imageData.originalHeight,
      },
    };
  } catch (error) {
    onStatus?.(RECONSTRUCTION_STATUS.ERROR);
    if (error instanceof ReconstructionError) throw error;
    throw new ReconstructionError("decode-failed", error?.message ?? "Reconstruction failed unexpectedly.");
  }
}