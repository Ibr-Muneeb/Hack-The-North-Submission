import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getBrickDefinition } from "./brickCatalog.js";
import { brickCells, markPlaced, neighbourContacts } from "./brickPlacement.js";
import {
  compareCandidates,
  isBetterCandidate,
  MAX_SCORED_CONTACTS,
  scoreCandidate,
  WEIGHTS,
} from "./candidateScoring.js";
import { LegoOccupancy } from "./LegoOccupancy.js";

/** A baseline candidate; each test varies one factor at a time. */
const base = {
  newlyCovered: 4,
  outside: 0,
  fit: 1,
  support: 0.5,
  contacts: 2,
  area: 4,
};

const score = (overrides) => scoreCandidate({ ...base, ...overrides });

describe("scoreCandidate: individual factors", () => {
  it("prefers greater target coverage", () => {
    assert.ok(score({ newlyCovered: 8 }) > score({ newlyCovered: 4 }));
    assert.ok(score({ newlyCovered: 4 }) > score({ newlyCovered: 1 }));
  });

  it("penalises cells occupied outside the target", () => {
    assert.ok(score({ outside: 0 }) > score({ outside: 1 }));
    assert.ok(score({ outside: 1 }) > score({ outside: 4 }));
  });

  it("penalises a stray cell more than it rewards a covered one", () => {
    // Otherwise a brick could pay for one extra covered cell with one stray
    // cell and come out ahead, which is how shapes get blobby.
    assert.ok(WEIGHTS.FALSE_POSITIVE > WEIGHTS.COVERAGE);
    const covered = score({ newlyCovered: 5, outside: 1 });
    const tighter = score({ newlyCovered: 4, outside: 0 });
    assert.ok(tighter > covered);
  });

  it("prefers a tighter fit to the boundary", () => {
    assert.ok(score({ fit: 1 }) > score({ fit: 0.75 }));
    assert.ok(score({ fit: 0.75 }) > score({ fit: 0.5 }));
  });

  it("rewards support underneath", () => {
    assert.ok(score({ support: 1 }) > score({ support: 0.5 }));
    assert.ok(score({ support: 0.5 }) > score({ support: 0 }));
  });

  it("rewards connectivity with already placed bricks", () => {
    assert.ok(score({ contacts: 6 }) > score({ contacts: 2 }));
    assert.ok(score({ contacts: 2 }) > score({ contacts: 0 }));
  });

  it("caps the connectivity reward", () => {
    assert.equal(
      score({ contacts: MAX_SCORED_CONTACTS }),
      score({ contacts: MAX_SCORED_CONTACTS + 50 }),
    );
  });

  it("prefers larger bricks when everything else matches", () => {
    assert.ok(score({ area: 8 }) > score({ area: 4 }));
    assert.ok(score({ area: 2 }) > score({ area: 1 }));
  });

  it("never lets brick size outweigh coverage or stray cells", () => {
    // A big brick that wastes space must lose to a small one that fits.
    const bigLoose = scoreCandidate({ newlyCovered: 6, outside: 2, fit: 6 / 8, support: 1, contacts: 0, area: 8 });
    const smallTight = scoreCandidate({ newlyCovered: 6, outside: 0, fit: 1, support: 1, contacts: 0, area: 2 });
    assert.ok(smallTight > bigLoose);

    // And a larger brick must not win on size alone when it covers less.
    const bigThin = scoreCandidate({ ...base, newlyCovered: 2, area: 8 });
    const smallFull = scoreCandidate({ ...base, newlyCovered: 4, area: 1 });
    assert.ok(smallFull > bigThin);
  });

  it("clamps ratios, so out-of-range input cannot inflate a score", () => {
    assert.equal(score({ fit: 5 }), score({ fit: 1 }));
    assert.equal(score({ support: -3 }), score({ support: 0 }));
  });

  it("is a pure function of its inputs", () => {
    assert.equal(scoreCandidate(base), scoreCandidate({ ...base }));
  });
});

describe("compareCandidates: deterministic tie-breaking", () => {
  const candidate = (overrides = {}) => {
    const merged = {
      partId: "3003",
      rotation: 0,
      position: { x: 1, y: 0, z: 1 },
      ...base,
      ...overrides,
    };
    return { ...merged, score: merged.score ?? scoreCandidate(merged) };
  };

  it("orders by score first", () => {
    const better = candidate({ newlyCovered: 8 });
    const worse = candidate({ newlyCovered: 2 });
    assert.ok(compareCandidates(better, worse) < 0);
    assert.ok(compareCandidates(worse, better) > 0);
    assert.ok(isBetterCandidate(better, worse));
    assert.ok(!isBetterCandidate(worse, better));
  });

  it("treats a null incumbent as beatable", () => {
    assert.ok(isBetterCandidate(candidate(), null));
  });

  it("breaks an equal score by coverage, then by fewer stray cells", () => {
    const a = candidate({ score: 10, newlyCovered: 6, outside: 2 });
    const b = candidate({ score: 10, newlyCovered: 4, outside: 0 });
    assert.ok(compareCandidates(a, b) < 0, "more coverage wins");

    const c = candidate({ score: 10, newlyCovered: 4, outside: 0 });
    const d = candidate({ score: 10, newlyCovered: 4, outside: 3 });
    assert.ok(compareCandidates(c, d) < 0, "fewer stray cells wins");
  });

  it("then prefers support, connectivity and larger area, in that order", () => {
    const fixed = { score: 10, newlyCovered: 4, outside: 0 };
    assert.ok(compareCandidates(
      candidate({ ...fixed, support: 1 }),
      candidate({ ...fixed, support: 0 }),
    ) < 0);
    assert.ok(compareCandidates(
      candidate({ ...fixed, support: 1, contacts: 5 }),
      candidate({ ...fixed, support: 1, contacts: 1 }),
    ) < 0);
    assert.ok(compareCandidates(
      candidate({ ...fixed, support: 1, contacts: 1, area: 8 }),
      candidate({ ...fixed, support: 1, contacts: 1, area: 2 }),
    ) < 0);
  });

  it("falls back to catalog order, rotation, then grid position", () => {
    const fixed = { score: 10, newlyCovered: 4, outside: 0, support: 1, contacts: 1, area: 4 };
    assert.ok(compareCandidates(
      candidate({ ...fixed, partId: "3001" }),
      candidate({ ...fixed, partId: "3005" }),
    ) < 0, "earlier catalog entry wins");

    assert.ok(compareCandidates(
      candidate({ ...fixed, rotation: 0 }),
      candidate({ ...fixed, rotation: 90 }),
    ) < 0, "lower rotation wins");

    assert.ok(compareCandidates(
      candidate({ ...fixed, position: { x: 0, y: 0, z: 0 } }),
      candidate({ ...fixed, position: { x: 1, y: 0, z: 0 } }),
    ) < 0, "lower x wins");

    assert.ok(compareCandidates(
      candidate({ ...fixed, position: { x: 5, y: 0, z: 0 } }),
      candidate({ ...fixed, position: { x: 0, y: 0, z: 1 } }),
    ) < 0, "z is compared before x");
  });

  it("only reports a tie for genuinely identical candidates", () => {
    const a = candidate();
    const b = candidate();
    assert.equal(compareCandidates(a, b), 0);
    assert.notEqual(compareCandidates(a, candidate({ position: { x: 2, y: 0, z: 1 } })), 0);
  });

  it("sorts a candidate list reproducibly", () => {
    const list = [
      candidate({ partId: "3005", area: 1, newlyCovered: 3 }),
      candidate({ partId: "3001", area: 8, newlyCovered: 8 }),
      candidate({ partId: "3004", area: 2, newlyCovered: 3 }),
    ];
    const once = [...list].sort(compareCandidates).map((c) => c.partId);
    const twice = [...list].reverse().sort(compareCandidates).map((c) => c.partId);
    assert.deepEqual(once, twice);
    assert.equal(once[0], "3001");
  });
});

describe("connectivity measurement", () => {
  it("counts shared faces with already placed bricks", () => {
    const grid = new LegoOccupancy(4, 3, 4);
    const placed = grid.createEmptyLike();
    markPlaced(placed, brickCells(getBrickDefinition("3001"), { x: 0, y: 0, z: 0 }, 0));

    const touching = brickCells(getBrickDefinition("3001"), { x: 2, y: 0, z: 0 }, 0);
    assert.equal(neighbourContacts(placed, touching), 12); // 4 deep x 3 plates

    const isolated = brickCells(getBrickDefinition("3005"), { x: 3, y: 0, z: 3 }, 0);
    assert.equal(neighbourContacts(placed, isolated), 0);
  });

  it("does not count a brick's own cells as contacts", () => {
    const grid = new LegoOccupancy(4, 3, 4);
    const cells = brickCells(getBrickDefinition("3003"), { x: 0, y: 0, z: 0 }, 0);
    assert.equal(neighbourContacts(grid.createEmptyLike(), cells), 0);
  });
});
