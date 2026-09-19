/**
 * SEGMENTATION (foreground silhouette extraction)
 * ================================================
 *
 * M7 is a classical/2.5D reconstruction (see reconstructFromImage.js for
 * why), so "segmentation" here means a deterministic heuristic, not a neural
 * network: no model to download, nothing that can fail to load, and a result
 * you can reason about from the pixels alone.
 *
 * Three strategies, tried in order of reliability:
 *   1. Alpha channel - if the image already has real transparency (a PNG/WebP
 *      cut-out), that IS the segmentation. Best case, and common for "product
 *      shot" style images.
 *   2. Background-colour distance - sample the border of the frame (where the
 *      background usually shows, per the "single object, simple background"
 *      brief), then classify every pixel by colour distance from that
 *      estimate. Works well for the intended object-on-plain-background input.
 *   3. Centre-weighted fallback - if neither of the above finds a plausible
 *      object (near-empty or near-full mask), fall back to an image-derived
 *      ellipse over the frame's centre so the demo still shows *something*
 *      driven by the photo instead of failing outright.
 *
 * Pure JavaScript: operates on an ImageData-shaped {width, height, data}
 * object, so it is fully unit-testable without a browser or a real image.
 */

import { despeckleMask, keepLargestComponent } from "./reconstructionUtils.js";

/** Below this fraction of the frame, a mask is "suspiciously empty" (noise, not an object). */
const MIN_FOREGROUND_RATIO = 0.01;
/** Above this fraction, the mask is "suspiciously full" (background misdetected as object). */
const MAX_FOREGROUND_RATIO = 0.97;
/** Width of the border ring sampled to estimate the background colour, as a fraction of min(width,height). */
const BORDER_SAMPLE_FRACTION = 0.06;
/** Colour-distance threshold (0-255 scale per channel, combined) for "different enough from background". */
const DEFAULT_COLOR_THRESHOLD = 42;

/** True when the alpha channel carries real information (not "every pixel opaque"). */
export function hasUsableAlpha(imageData) {
  const { data } = imageData;
  let minA = 255;
  let maxA = 0;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
    if (minA < 250 && maxA > 5) return true;
  }
  return false;
}

/** Per-pixel grayscale luminance in [0, 1], ITU-R BT.601 weights. Pure. */
export function computeLuminance(imageData) {
  const { width, height, data } = imageData;
  const out = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    out[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
  }
  return out;
}

/** Average RGB of the outer border ring of the image - the background estimate. */
function estimateBackgroundColor(imageData) {
  const { width, height, data } = imageData;
  const border = Math.max(1, Math.round(Math.min(width, height) * BORDER_SAMPLE_FRACTION));
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    const onBorderRow = y < border || y >= height - border;
    for (let x = 0; x < width; x++) {
      if (!onBorderRow && x >= border && x < width - border) continue;
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
  }
  return count > 0 ? [r / count, g / count, b / count] : [255, 255, 255];
}

/** Mask from colour distance to an estimated background. 1 = foreground. */
function maskFromColorDistance(imageData, threshold) {
  const { width, height, data } = imageData;
  const [br, bg, bb] = estimateBackgroundColor(imageData);
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    const dr = data[i] - br;
    const dg = data[i + 1] - bg;
    const db = data[i + 2] - bb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    mask[p] = dist > threshold ? 1 : 0;
  }
  return mask;
}

/** Mask from the alpha channel. 1 = foreground (alpha above the midpoint). */
function maskFromAlpha(imageData) {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    mask[p] = data[p * 4 + 3] > 127 ? 1 : 0;
  }
  return mask;
}

/**
 * Deterministic ellipse covering the centre ~70% of the frame. Not derived
 * from pixel content, but the frame's own aspect ratio is - used only when
 * colour/alpha segmentation could not find a plausible object, per the "keep
 * the demo working instead of failing outright" requirement.
 */
export function centerEllipseMask(width, height, coverage = 0.7) {
  const mask = new Uint8Array(width * height);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const rx = (width / 2) * coverage;
  const ry = (height / 2) * coverage;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) mask[y * width + x] = 1;
    }
  }
  return mask;
}

/**
 * Extracts a foreground/background silhouette mask (Uint8Array, 1 =
 * foreground) from an ImageData-shaped object.
 *
 * @returns {{ mask: Uint8Array, method: "alpha"|"color-distance"|"center-fallback", ratio: number }}
 */
export function extractForegroundMask(imageData, options = {}) {
  const { width, height } = imageData;
  const colorThreshold = options.colorThreshold ?? DEFAULT_COLOR_THRESHOLD;

  let mask;
  let method;
  if (hasUsableAlpha(imageData)) {
    mask = maskFromAlpha(imageData);
    method = "alpha";
  } else {
    mask = maskFromColorDistance(imageData, colorThreshold);
    method = "color-distance";
  }

  mask = despeckleMask(mask, width, height);
  mask = keepLargestComponent(mask, width, height);

  let ratio = countOnes(mask) / mask.length;

  if (ratio < MIN_FOREGROUND_RATIO || ratio > MAX_FOREGROUND_RATIO) {
    mask = centerEllipseMask(width, height);
    method = "center-fallback";
    ratio = countOnes(mask) / mask.length;
  }

  return { mask, method, ratio };
}

function countOnes(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}