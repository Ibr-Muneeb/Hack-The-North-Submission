/**
 * RECONSTRUCTION UTILITIES
 * ========================
 *
 * Small, generic, dependency-free helpers shared by the reconstruction
 * modules. Pure JavaScript operating on plain arrays/typed arrays - no
 * browser APIs, no Three.js, no React. Everything here is deterministic and
 * easy to unit test with synthetic data (no real image needed).
 */

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Scale (width, height) down (never up) so neither side exceeds `maxSize`,
 * preserving aspect ratio and always returning integers >= 1. Pure - used
 * both for "don't process a 6000x4000 photo at full res" and for "downsample
 * the mask to voxel-grid resolution".
 */
export function computeScaledDimensions(width, height, maxSize) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError(`computeScaledDimensions expects positive width/height, got ${width}x${height}`);
  }
  if (!Number.isFinite(maxSize) || maxSize <= 0) {
    throw new RangeError(`computeScaledDimensions expects a positive maxSize, got ${maxSize}`);
  }
  const longest = Math.max(width, height);
  if (longest <= maxSize) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxSize / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Downsample a boolean mask (Uint8Array, 1 = foreground) from
 * srcWidth x srcHeight to dstWidth x dstHeight using box sampling: a
 * destination cell is foreground when at least `threshold` (default half) of
 * the source cells inside its box are foreground. Deterministic, no
 * interpolation artefacts, works for both up- and down-sampling.
 */
export function resizeMask(mask, srcWidth, srcHeight, dstWidth, dstHeight, threshold = 0.5) {
  const out = new Uint8Array(dstWidth * dstHeight);
  for (let dy = 0; dy < dstHeight; dy++) {
    const sy0 = Math.floor((dy * srcHeight) / dstHeight);
    const sy1 = Math.max(sy0 + 1, Math.floor(((dy + 1) * srcHeight) / dstHeight));
    for (let dx = 0; dx < dstWidth; dx++) {
      const sx0 = Math.floor((dx * srcWidth) / dstWidth);
      const sx1 = Math.max(sx0 + 1, Math.floor(((dx + 1) * srcWidth) / dstWidth));
      let total = 0;
      let on = 0;
      for (let sy = sy0; sy < sy1 && sy < srcHeight; sy++) {
        for (let sx = sx0; sx < sx1 && sx < srcWidth; sx++) {
          total++;
          if (mask[sy * srcWidth + sx]) on++;
        }
      }
      out[dy * dstWidth + dx] = total > 0 && on / total >= threshold ? 1 : 0;
    }
  }
  return out;
}

/** Same box-sampling idea as resizeMask, but for a continuous field (averages instead of a threshold vote). */
export function resizeField(field, srcWidth, srcHeight, dstWidth, dstHeight) {
  const out = new Float32Array(dstWidth * dstHeight);
  for (let dy = 0; dy < dstHeight; dy++) {
    const sy0 = Math.floor((dy * srcHeight) / dstHeight);
    const sy1 = Math.max(sy0 + 1, Math.floor(((dy + 1) * srcHeight) / dstHeight));
    for (let dx = 0; dx < dstWidth; dx++) {
      const sx0 = Math.floor((dx * srcWidth) / dstWidth);
      const sx1 = Math.max(sx0 + 1, Math.floor(((dx + 1) * srcWidth) / dstWidth));
      let total = 0;
      let sum = 0;
      for (let sy = sy0; sy < sy1 && sy < srcHeight; sy++) {
        for (let sx = sx0; sx < sx1 && sx < srcWidth; sx++) {
          total++;
          sum += field[sy * srcWidth + sx];
        }
      }
      out[dy * dstWidth + dx] = total > 0 ? sum / total : 0;
    }
  }
  return out;
}

/**
 * Largest 4-connected component of a boolean mask, everything else cleared.
 * Removes stray background blobs that survive thresholding. Deterministic
 * (components are found in scan order; ties keep the first one found).
 */
export function keepLargestComponent(mask, width, height) {
  const n = width * height;
  const labels = new Int32Array(n).fill(-1);
  let bestLabel = -1;
  let bestSize = 0;
  let nextLabel = 0;
  const stack = [];

  for (let start = 0; start < n; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const label = nextLabel++;
    let size = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length > 0) {
      const idx = stack.pop();
      size++;
      const x = idx % width;
      const y = (idx / width) | 0;
      const neighbours = [
        x > 0 ? idx - 1 : -1,
        x < width - 1 ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y < height - 1 ? idx + width : -1,
      ];
      for (const nb of neighbours) {
        if (nb >= 0 && mask[nb] && labels[nb] === -1) {
          labels[nb] = label;
          stack.push(nb);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
    }
  }

  const out = new Uint8Array(n);
  if (bestLabel !== -1) {
    for (let i = 0; i < n; i++) if (labels[i] === bestLabel) out[i] = 1;
  }
  return out;
}

/**
 * One pass of majority-vote despeckling: a cell flips to match the majority
 * of its 8 neighbours (ties keep the current value). Cheap substitute for a
 * full morphological open/close; removes isolated salt-and-pepper noise from
 * a thresholded mask.
 */
export function despeckleMask(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      let on = 0;
      let total = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          total++;
          if (mask[ny * width + nx]) on++;
        }
      }
      out[idx] = on * 2 > total ? 1 : on * 2 === total ? mask[idx] : 0;
    }
  }
  return out;
}