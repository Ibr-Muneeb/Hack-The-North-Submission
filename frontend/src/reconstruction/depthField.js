/**
 * DEPTH FIELD (silhouette -> pseudo-depth)
 * =========================================
 *
 * The classical "shape from silhouette" trick this MVP leans on: a flat
 * silhouette alone only tells you the object's outline, not its thickness.
 * A simple and visually effective heuristic is to treat each pixel's
 * distance to the silhouette's own edge as a proxy for how far the surface
 * bulges toward the camera at that point - centre-of-mass pixels (far from
 * any edge) are "thick", edge pixels are "thin". Extruded symmetrically
 * front-to-back, a round object's silhouette produces a rounded volume
 * (roughly an ellipsoid), a mug's outline produces a rounded body, and so on.
 *
 * This is explicitly a 2.5D approximation (see reconstructFromImage.js and
 * the README): it has no notion of concavities, occlusion, or the object's
 * *actual* back surface. It is chosen because it is deterministic, fast, and
 * - per the milestone brief - a reliable, good-looking approximation beats a
 * fragile "more correct" one.
 *
 * Brightness is folded in as a small secondary cue (`offset`): per the
 * brief's requirement that near/far image regions produce some variation in
 * voxel depth beyond a uniform extrusion, brighter areas are nudged slightly
 * toward the viewer and darker areas slightly away, on top of the silhouette
 * bulge. It is intentionally a minor effect - brightness is a weak and noisy
 * depth cue - so it adds texture without overriding the silhouette shape.
 *
 * Pure JavaScript: works on typed arrays, fully unit-testable.
 */

const SQRT2 = Math.SQRT2;

/**
 * Chamfer distance transform: for every pixel, the approximate Euclidean
 * distance (in pixel units) to the nearest 0-valued (background) cell.
 * Background cells get distance 0. Two-pass, deterministic, O(n).
 */
export function distanceTransform(mask, width, height) {
  const INF = width + height + 1;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < dist.length; i++) dist[i] = mask[i] ? INF : 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!mask[idx]) continue;
      let best = dist[idx];
      if (x > 0) best = Math.min(best, dist[idx - 1] + 1);
      if (y > 0) best = Math.min(best, dist[idx - width] + 1);
      if (x > 0 && y > 0) best = Math.min(best, dist[idx - width - 1] + SQRT2);
      if (x < width - 1 && y > 0) best = Math.min(best, dist[idx - width + 1] + SQRT2);
      dist[idx] = best;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const idx = y * width + x;
      if (!mask[idx]) continue;
      let best = dist[idx];
      if (x < width - 1) best = Math.min(best, dist[idx + 1] + 1);
      if (y < height - 1) best = Math.min(best, dist[idx + width] + 1);
      if (x < width - 1 && y < height - 1) best = Math.min(best, dist[idx + width + 1] + SQRT2);
      if (x > 0 && y < height - 1) best = Math.min(best, dist[idx + width - 1] + SQRT2);
      dist[idx] = best;
    }
  }
  return dist;
}

/**
 * Builds the per-pixel depth field used to turn a flat mask into a volume.
 *
 * @param {Uint8Array} mask        1 = foreground, width*height
 * @param {number} width
 * @param {number} height
 * @param {Float32Array} [luminance]  optional, [0,1] per pixel, same size as mask
 * @param {object} [options]
 * @param {number} [options.brightnessInfluence=0.25]  how much luminance can shift the centre (0..1)
 * @returns {{ radius: Float32Array, offset: Float32Array }}
 *   radius: [0,1] per pixel, how far the surface bulges from the mid-plane (0 outside the mask)
 *   offset: [-1,1] per pixel, small brightness-driven shift of the bulge's centre
 */
export function computeDepthField(mask, width, height, luminance, options = {}) {
  const brightnessInfluence = clamp01(options.brightnessInfluence ?? 0.25);
  const dist = distanceTransform(mask, width, height);

  let maxDist = 0;
  for (let i = 0; i < dist.length; i++) if (mask[i] && dist[i] > maxDist) maxDist = dist[i];
  const safeMax = maxDist > 0 ? maxDist : 1;

  const radius = new Float32Array(width * height);
  for (let i = 0; i < radius.length; i++) {
    radius[i] = mask[i] ? dist[i] / safeMax : 0;
  }

  const offset = new Float32Array(width * height);
  if (luminance) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        sum += luminance[i];
        count++;
      }
    }
    const mean = count > 0 ? sum / count : 0.5;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) offset[i] = clamp(luminance[i] - mean, -1, 1) * brightnessInfluence;
    }
  }

  return { radius, offset };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
function clamp01(v) {
  return clamp(v, 0, 1);
}