import * as THREE from "three";
import { LDrawLoader } from "three/addons/loaders/LDrawLoader.js";
import { LDrawConditionalLineMaterial } from "three/addons/materials/LDrawConditionalLineMaterial.js";

/**
 * LegoPart: LDrawLoader -> Three.js Object3D
 * ===========================================
 *
 * Thin abstraction between the official LDraw parts library and Brickify's
 * LEGO-grid coordinate system (see coordinates.js). This is the ONLY file
 * that needs to know anything about LDraw's file layout or axis conventions.
 * Everything above it (Brick.jsx, and eventually a brick-selection algorithm)
 * only ever deals with: partId, color, position, rotation.
 *
 * LDraw assets are served from /public/ldraw (see that folder's layout),
 * which only contains the handful of files part 3001 actually depends on,
 * not the full official library.
 *
 * ---- Coordinate conversion (see coordinates.js for Brickify's convention) ----
 * LDraw space:      X = horizontal, Y = DOWN,      Z = horizontal. 1 stud = 20 LDU.
 * Brickify space:   X = width,      Y = UP,        Z = depth.      1 stud = 1 unit.
 *
 * Converting a loaded part is a fixed, one-time correction:
 *   1. rotate 180 deg about X   -> flips Y (down -> up) and Z, giving a Y-up frame
 *   2. rotate 90 deg about Y    -> aligns LDraw's local axes with Brickify's
 *                                   width (X) / depth (Z) axes for this part
 *   3. scale by 1/20            -> LDraw units -> studs
 *   4. shift up so the lowest point sits at y=0 -> matches Brickify's convention
 *      that a brick's `position` is the MIN CORNER of the cells it occupies
 *
 * That transform is baked directly into the geometry (once, per part) rather
 * than left on the returned Object3D's .position/.rotation/.scale, so the
 * object behaves exactly like the procedural <mesh> in Brick.jsx: callers are
 * free to set position/rotation-y on it for grid placement without fighting
 * this fixed axis correction.
 */

const LDRAW_BASE = "/ldraw/"; // served from public/ldraw, see that folder
const STUD_PER_LDU = 1 / 20; // 1 stud = 20 LDraw units

const loader = new LDrawLoader();
loader.setPartsLibraryPath(LDRAW_BASE);
loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
loader.smoothNormals = true;

// LDConfig.ldr (LDraw's official color table) only needs to load once, no
// matter how many parts/bricks request geometry concurrently.
let materialsReady = null;
function ensureMaterialsLoaded() {
  if (!materialsReady) {
    materialsReady = loader.preloadMaterials(LDRAW_BASE + "LDConfig.ldr");
  }
  return materialsReady;
}

/** Bakes the LDraw -> Brickify conversion into `group`'s geometry in place. */
function convertToBrickifySpace(group) {
  // Orient + rescale LDraw's (X, Y-down, Z) space into Brickify's grid space.
  group.rotation.x = Math.PI;
  group.rotation.y = Math.PI / 2;
  group.scale.setScalar(STUD_PER_LDU);
  group.updateMatrixWorld(true);

  // Rest the part on the grid floor (position = min corner convention).
  const bounds = new THREE.Box3().setFromObject(group);
  group.position.y -= bounds.min.y;
  group.updateMatrixWorld(true);

  // Bake every child's world transform into its own geometry, then reset all
  // transforms to identity so the group is a plain, placement-ready object.
  group.traverse((child) => {
    if (child.geometry) {
      child.geometry = child.geometry.clone();
      child.geometry.applyMatrix4(child.matrixWorld);
      child.position.set(0, 0, 0);
      child.rotation.set(0, 0, 0);
      child.scale.set(1, 1, 1);
      child.updateMatrix();
    }
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  group.position.set(0, 0, 0);
  group.rotation.set(0, 0, 0);
  group.scale.set(1, 1, 1);
  group.updateMatrix();
}

// One shared, normalized "template" Object3D per part id. Geometry is loaded
// and converted once; individual bricks clone() it (cheap: geometry stays
// shared, only the small node/material wrappers are duplicated).
const templateCache = new Map();

function loadPartTemplate(partId) {
  let template = templateCache.get(partId);
  if (!template) {
    template = ensureMaterialsLoaded()
      .then(() => loader.loadAsync(`${LDRAW_BASE}parts/${partId}.dat`))
      .then((group) => {
        convertToBrickifySpace(group);
        return group;
      })
      .catch((error) => {
        // Don't cache a broken promise forever as "loading": let the next
        // request retry, but do let *this* request's caller see the failure.
        templateCache.delete(partId);
        throw error;
      });
    templateCache.set(partId, template);
  }
  return template;
}

/**
 * Load (or reuse) the LDraw geometry for `partId` and return a fresh,
 * independently colorable Object3D instance, already in Brickify's grid
 * space (see module docs above). Rejects if the part or its dependencies
 * can't be loaded, e.g. LDrawLoader/network failure.
 */
export async function instantiateLegoPart(partId, colorHex) {
  const template = await loadPartTemplate(partId);
  const instance = template.clone(true);
  instance.traverse((child) => {
    if (child.isMesh) {
      // Clone the material too: color is per-instance, geometry is shared.
      child.material = child.material.clone();
      child.material.color.set(colorHex);
    }
  });
  return instance;
}
