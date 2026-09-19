import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Same idea as the architecture test in src/voxel/voxelize.test.js: the layer
 * boundaries from the milestone brief are checked mechanically, not by hoping
 * nobody adds the wrong import later.
 *
 * src/decomposition may use voxel data and LEGO DATA definitions, and nothing
 * else: no React, no Three.js, no R3F, no LDraw Object3Ds, no UI components.
 */

const dir = fileURLToPath(new URL(".", import.meta.url));
const sources = readdirSync(dir).filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"));

/** LEGO modules that are plain data/logic and therefore safe to import here. */
const ALLOWED_LEGO_MODULES = ["coordinates.js", "model.js", "modelValidation.js"];

const FORBIDDEN = [/\bthree\b/, /\breact\b/, /@react-three/, /LegoPart\.js/, /\.jsx\b/];

describe("src/decomposition: architecture", () => {
  it("finds the source files", () => {
    assert.ok(sources.length >= 6, sources.join());
  });

  it("imports only voxel data, LEGO data definitions and its own siblings", () => {
    for (const file of sources) {
      const text = readFileSync(dir + file, "utf8");
      const specifiers = [...text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?from\s*["']([^"']+)["']/g)]
        .map((m) => m[1]);

      for (const spec of specifiers) {
        const sibling = /^\.\/[\w.-]+\.js$/.test(spec);
        const voxel = /^\.\.\/voxel\/[\w.-]+\.js$/.test(spec);
        const legoData = ALLOWED_LEGO_MODULES.some((m) => spec === `../lego/${m}`);
        assert.ok(sibling || voxel || legoData, `${file} imports "${spec}"`);
      }
    }
  });

  it("mentions no rendering dependency anywhere in the layer", () => {
    for (const file of sources) {
      const text = readFileSync(dir + file, "utf8");
      // Strip block comments: the docs explain what the layer must NOT use.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "");
      for (const pattern of FORBIDDEN) {
        assert.doesNotMatch(code, pattern, `${file} references ${pattern}`);
      }
      assert.doesNotMatch(code, /\bimport\s*\(/, `${file} uses dynamic import`);
      assert.doesNotMatch(code, /\brequire\s*\(/, `${file} uses require`);
    }
  });
});
