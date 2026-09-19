import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import {
  BRICK_INSET,
  EDGE_RADIUS,
  PLATE_HEIGHT,
  STUD_HEIGHT,
  STUD_PITCH,
  STUD_RADIUS,
} from "./coordinates.js";

/**
 * Geometry for one brick/plate, in world units.
 *
 * Local frame: origin at the centre of the footprint, on the bottom face.
 * The body spans x in [-w/2, w/2], z in [-d/2, d/2], y in [0, h * PLATE_HEIGHT].
 * Studs sit on top. Body and studs are merged into ONE BufferGeometry, so each
 * brick is a single mesh / draw call and the studs are physically part of it.
 *
 * To use LDraw later, return a geometry in this same local frame from
 * `getBrickGeometry` (see README notes) and nothing else has to change.
 */

const STUD_SEGMENTS = 32;
const STUD_EDGE_SEGMENTS = 3;
const STUD_BEVEL = 0.03;
const STUD_EMBED = 0.05; // stud base is sunk into the body so there is no visible seam

/** Stud centres for a width x depth footprint, relative to the footprint centre. */
export function getStudPositions(width, depth) {
  const studs = [];
  for (let ix = 0; ix < width; ix++) {
    for (let iz = 0; iz < depth; iz++) {
      studs.push([
        (ix + 0.5 - width / 2) * STUD_PITCH,
        (iz + 0.5 - depth / 2) * STUD_PITCH,
      ]);
    }
  }
  return studs;
}

// One stud, built once and cloned/translated per stud. A lathe profile gives a
// smooth cylinder with a softly rounded top rim.
let studTemplate = null;
function getStudTemplate() {
  if (studTemplate) return studTemplate;

  const profile = [new THREE.Vector2(0, STUD_HEIGHT)];
  for (let i = 0; i <= STUD_EDGE_SEGMENTS; i++) {
    const a = (i / STUD_EDGE_SEGMENTS) * (Math.PI / 2);
    profile.push(
      new THREE.Vector2(
        STUD_RADIUS - STUD_BEVEL + Math.sin(a) * STUD_BEVEL,
        STUD_HEIGHT - STUD_BEVEL + Math.cos(a) * STUD_BEVEL,
      ),
    );
  }
  profile.push(new THREE.Vector2(STUD_RADIUS, -STUD_EMBED));

  // Lathe faces outward when the profile runs bottom -> top.
  studTemplate = new THREE.LatheGeometry(profile.reverse(), STUD_SEGMENTS);
  return studTemplate;
}

export function buildBrickGeometry(width, depth, height) {
  const bodyHeight = height * PLATE_HEIGHT;

  // RoundedBoxGeometry is non-indexed but LatheGeometry (studs) is indexed, and
  // mergeGeometries needs them to match. Welding the body also shrinks it.
  const body = mergeVertices(
    new RoundedBoxGeometry(
      width * STUD_PITCH - 2 * BRICK_INSET,
      bodyHeight,
      depth * STUD_PITCH - 2 * BRICK_INSET,
      3,
      Math.min(EDGE_RADIUS, bodyHeight / 2),
    ),
  );
  body.translate(0, bodyHeight / 2, 0);

  const parts = [body];
  for (const [sx, sz] of getStudPositions(width, depth)) {
    parts.push(getStudTemplate().clone().translate(sx, bodyHeight, sz));
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g !== studTemplate && g.dispose());
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

// Bricks of the same size share one geometry. With hundreds of bricks in a
// model this avoids rebuilding and re-uploading identical vertex data.
const cache = new Map();

export function getBrickGeometry(width, depth, height) {
  const key = `${width}x${depth}x${height}`;
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = buildBrickGeometry(width, depth, height);
    cache.set(key, geometry);
  }
  return geometry;
}
