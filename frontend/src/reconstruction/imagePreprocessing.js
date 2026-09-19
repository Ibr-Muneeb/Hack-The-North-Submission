/**
 * IMAGE PREPROCESSING
 * ===================
 *
 * Turns an uploaded `File`/`Blob` into an `ImageData`-shaped object
 * ({ width, height, data: Uint8ClampedArray RGBA }) that the rest of the
 * reconstruction layer works with.
 *
 * This is the ONE module in the reconstruction layer allowed to touch
 * browser-only APIs (Image, canvas, URL.createObjectURL, FileReader) - it
 * has no ML model, so there is nothing here that can fail to "load" beyond
 * an unsupported or corrupt file, which is handled as an ordinary error.
 *
 * The parts that do NOT need a browser (validating a File's metadata,
 * computing target dimensions) are plain functions exported separately so
 * they can be unit tested under Node without a DOM. The one part that does
 * need a browser (decoding pixels) is a thin wrapper kept as small as
 * possible; it is exercised by manual/browser testing, not the test suite.
 */

import {
  MAX_IMAGE_DIMENSION,
  MAX_UPLOAD_BYTES,
  ReconstructionError,
  SUPPORTED_IMAGE_TYPES,
} from "./reconstructionTypes.js";
import { computeScaledDimensions } from "./reconstructionUtils.js";

/**
 * Checks a File's declared type and size before we ever try to decode it.
 * Pure (no browser decoding) - only reads metadata already on the File/Blob.
 * Throws ReconstructionError on any problem; returns the file unchanged.
 */
export function validateImageFile(file) {
  if (!file || typeof file !== "object") {
    throw new ReconstructionError("invalid-file", "No image file was provided.");
  }
  if (typeof file.size === "number" && file.size <= 0) {
    throw new ReconstructionError("invalid-file", "The selected file is empty.");
  }
  if (typeof file.size === "number" && file.size > MAX_UPLOAD_BYTES) {
    const mb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
    throw new ReconstructionError("too-large", `Image is too large (max ${mb} MB).`);
  }
  if (file.type && !SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    throw new ReconstructionError(
      "unsupported-type",
      `Unsupported image type "${file.type}". Use PNG, JPEG or WebP.`,
    );
  }
  return file;
}

/**
 * Checks decoded pixel dimensions are sane. Pure. Throws on a pathological
 * image (e.g. a 1x40000 pixel PNG) that would otherwise freeze the tab.
 */
export function validateImageDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new ReconstructionError("decode-failed", "Could not read the image's dimensions.");
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new ReconstructionError(
      "image-too-large",
      `Image dimensions (${width}x${height}) exceed the ${MAX_IMAGE_DIMENSION}px limit.`,
    );
  }
  return { width, height };
}

/**
 * How big to decode/process the image at, preserving aspect ratio. Pure -
 * exported mainly so it is directly testable; also used by decodeImageFile.
 */
export function computeProcessingSize(width, height, maxProcessingDimension) {
  return computeScaledDimensions(width, height, maxProcessingDimension);
}

/**
 * Decodes a File/Blob into an ImageData-shaped object, resized (preserving
 * aspect ratio) so its longest side is at most `maxProcessingDimension`.
 * Browser-only: uses createImageBitmap/Image + canvas. Not covered by the
 * Node test suite; kept intentionally small.
 */
export async function decodeImageFile(file, maxProcessingDimension) {
  validateImageFile(file);

  const bitmap = await loadBitmap(file);
  try {
    validateImageDimensions(bitmap.width, bitmap.height);
    const { width, height } = computeProcessingSize(bitmap.width, bitmap.height, maxProcessingDimension);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new ReconstructionError("decode-failed", "Canvas 2D context is unavailable.");
    ctx.drawImage(bitmap.drawable, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    return {
      width,
      height,
      data: imageData.data,
      originalWidth: bitmap.width,
      originalHeight: bitmap.height,
    };
  } finally {
    bitmap.close?.();
  }
}

async function loadBitmap(file) {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      return { width: bitmap.width, height: bitmap.height, drawable: bitmap, close: () => bitmap.close() };
    }
  } catch {
    // fall through to the <img> based path below (older browsers, odd MIME types)
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight, drawable: img, close() {} });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ReconstructionError("decode-failed", "The file could not be decoded as an image."));
    };
    img.src = url;
  });
}