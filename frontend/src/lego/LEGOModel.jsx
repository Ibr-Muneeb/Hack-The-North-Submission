import Brick from "./Brick.jsx";
import { validateModel } from "./modelValidation.js";

/** model data -> one <Brick> per entry. It decides nothing about placement. */
export default function LEGOModel({ model }) {
  // Dev-only sanity check (see modelValidation.js). Intentionally a warning,
  // not a throw: same philosophy as useLDrawPart.js - a malformed brick
  // shouldn't take down the whole viewer, just get flagged.
  if (import.meta.env.DEV) {
    const { valid, errors } = validateModel(model);
    if (!valid) {
      console.warn(`[Brickify] Invalid LEGO model data:\n${errors.map((error) => ` - ${error}`).join("\n")}`);
    }
  }

  return (
    <>
      {model.bricks.map((brick, index) => (
        <Brick key={index} {...brick} />
      ))}
    </>
  );
}
