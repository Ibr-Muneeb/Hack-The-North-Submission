/**
 * Lightweight, pure-JS validation for LEGO model data (see model.js).
 *
 * This deliberately stays superficial: it checks that a model is well-formed
 * enough to place and render (right shapes, right types, rotation on-grid),
 * not that it describes a physically buildable LEGO structure. Overlap
 * detection, support/stability checks, and a full LEGO constraint solver are
 * explicitly out of scope for this milestone - see later milestones.
 *
 * Nothing here touches Three.js or React; it's plain data in, plain data out,
 * same as model.js itself.
 */

const VALID_TYPES = ["brick", "plate"];

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value) {
  return isFiniteNumber(value) && value > 0;
}

function isMultipleOf90(rotation) {
  return isFiniteNumber(rotation) && rotation % 90 === 0;
}

function isValidPosition(position) {
  if (Array.isArray(position)) {
    return position.length === 3 && position.every(isFiniteNumber);
  }
  return (
    !!position &&
    typeof position === "object" &&
    ["x", "y", "z"].every((axis) => isFiniteNumber(position[axis]))
  );
}

/**
 * Validate a single brick entry against the shape described in model.js.
 * Returns an array of human-readable error strings (empty = valid).
 */
export function validateBrick(brick, index = 0) {
  const where = `bricks[${index}]`;

  if (!brick || typeof brick !== "object") {
    return [`${where}: expected an object, got ${JSON.stringify(brick)}`];
  }

  const errors = [];

  // partId is optional (Brick.jsx falls back to procedural geometry when
  // it's missing), but if present it has to be a usable LDraw lookup key.
  if (brick.partId !== undefined) {
    if (typeof brick.partId !== "string" || brick.partId.trim() === "") {
      errors.push(`${where}.partId: expected a non-empty string, got ${JSON.stringify(brick.partId)}`);
    }
  }

  if (brick.type !== undefined && !VALID_TYPES.includes(brick.type)) {
    errors.push(`${where}.type: expected one of ${VALID_TYPES.join(", ")}, got ${JSON.stringify(brick.type)}`);
  }

  for (const field of ["width", "depth", "height"]) {
    if (!isPositiveNumber(brick[field])) {
      errors.push(`${where}.${field}: expected a positive number, got ${JSON.stringify(brick[field])}`);
    }
  }

  if (!brick.color || typeof brick.color !== "string") {
    errors.push(`${where}.color: expected a non-empty string, got ${JSON.stringify(brick.color)}`);
  }

  if (!isValidPosition(brick.position)) {
    errors.push(`${where}.position: expected {x,y,z} or [x,y,z] of numbers, got ${JSON.stringify(brick.position)}`);
  }

  if (brick.rotation !== undefined && !isMultipleOf90(brick.rotation)) {
    errors.push(`${where}.rotation: must be a multiple of 90, got ${JSON.stringify(brick.rotation)}`);
  }

  return errors;
}

/**
 * Validate a whole model ({ bricks: [...] }).
 * Returns { valid, errors }; `errors` is a flat list of per-brick messages.
 */
export function validateModel(model) {
  if (!model || typeof model !== "object" || !Array.isArray(model.bricks)) {
    return { valid: false, errors: ["model: expected an object with a `bricks` array"] };
  }

  const errors = model.bricks.flatMap((brick, index) => validateBrick(brick, index));
  return { valid: errors.length === 0, errors };
}

/** Throws with a combined message if the model is invalid. Handy in tests/tooling. */
export function assertValidModel(model) {
  const { valid, errors } = validateModel(model);
  if (!valid) {
    throw new Error(`Invalid LEGO model:\n${errors.map((error) => ` - ${error}`).join("\n")}`);
  }
}
