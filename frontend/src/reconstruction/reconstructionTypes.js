/**
 * RECONSTRUCTION TYPES & CONSTANTS
 * ================================
 *
 * Shared vocabulary for the reconstruction layer: the status values the UI
 * shows while an image turns into a VoxelGrid, the image formats we accept,
 * default limits, and a single error type so the UI can distinguish "bad
 * input" from "nothing recognisable in this image" from "internal bug".
 *
 * Plain JavaScript - no browser APIs, no React, no Three.js.
 */

/** UI-facing progress states (see README's M7 section for the full flow). */
export const RECONSTRUCTION_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING_IMAGE: "loading-image",
  PROCESSING: "processing",
  RECONSTRUCTING: "reconstructing",
  GENERATING_VOXELS: "generating-voxels",
  COMPLETE: "complete",
  ERROR: "error",
});

/** MIME types accepted by the upload UI and by `validateImageFile`. */
export const SUPPORTED_IMAGE_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);

/** Human-readable extensions shown in the UI (kept in sync with the MIME list above). */
export const SUPPORTED_IMAGE_EXTENSIONS = Object.freeze([".png", ".jpg", ".jpeg", ".webp"]);

/** Reject a file bigger than this before ever decoding it. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

/** Reject a decoded image with either side larger than this (would freeze the tab). */
export const MAX_IMAGE_DIMENSION = 6000;

/** An overly large image is downscaled to this many pixels on its longest side before any processing. */
export const DEFAULT_MAX_PROCESSING_DIMENSION = 512;

/**
 * Longest side of the output VoxelGrid, in voxels. 32-64 is the range the
 * milestone brief asks for: enough to read as a smooth-ish object, not so
 * much that the browser chokes turning it into LEGO bricks.
 */
export const DEFAULT_MAX_VOXEL_DIMENSION = 40;

/** World-space edge length of one voxel. 0.2 lines up exactly with the LEGO grid (see src/voxel). */
export const DEFAULT_RECONSTRUCTION_VOXEL_SIZE = 0.2;

/**
 * Error raised anywhere in the reconstruction pipeline. `code` lets the UI
 * show a specific message without string-matching `error.message`.
 *
 * Codes: "invalid-file", "unsupported-type", "too-large", "image-too-large",
 * "decode-failed", "no-object", "empty-result".
 */
export class ReconstructionError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "ReconstructionError";
    this.code = code;
  }
}