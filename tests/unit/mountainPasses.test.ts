import { describe, expect, it } from "vitest";
import { GROUND } from "../../src/world/types";
import { World } from "../../src/world/world";

/** Longest straight line of tiles in a row or column that satisfy `test`, and where it ends. */
function longestRun(world: World, x0: number, y0: number, size: number, test: (ground: number) => boolean): { length: number; at: string } {
  const grid = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) grid[y * size + x] = test(world.tile(x0 + x, y0 + y).ground) ? 1 : 0;
  let best = { length: 0, at: "" };
  for (let a = 0; a < size; a++) {
    let row = 0;
    let col = 0;
    for (let b = 0; b < size; b++) {
      row = grid[a * size + b] ? row + 1 : 0;
      col = grid[b * size + a] ? col + 1 : 0;
      if (row > best.length) best = { length: row, at: `row ${y0 + a}, x ${x0 + b}` };
      if (col > best.length) best = { length: col, at: `column ${x0 + a}, y ${y0 + b}` };
    }
  }
  return best;
}

describe("mountain passes", () => {
  // The ranges of an island are broken into lumps with open highland between, so no road runs through them for long.
  for (const [seed, size] of [
    ["iron-vale-164", "large"],
    ["alpha", "large"],
    ["delta", "large"],
    ["dune-keep-451", "huge"],
  ] as const) {
    it(`${seed} (${size}): no road runs more than five tiles in a row through mountains`, { timeout: 60_000 }, () => {
      const world = new World(seed, size);
      const run = longestRun(world, 0, 0, world.width, (g) => g === GROUND.PASS);
      expect(run.length, `pass of ${run.length} tiles at ${run.at}`).toBeLessThanOrEqual(5);
    });
  }

  it("still has mountains: about a twelfth of the land, in most worlds", { timeout: 60_000 }, () => {
    let sum = 0;
    const seeds = ["iron-vale-164", "alpha", "beta", "gamma", "delta", "ember"];
    for (const seed of seeds) {
      const world = new World(seed, "large");
      let mountains = 0;
      let land = 0;
      for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
          const g = world.tile(x, y).ground;
          if (g === GROUND.WATER || g === GROUND.SHALLOW) continue;
          land++;
          if (g === GROUND.MOUNTAIN) mountains++;
        }
      }
      expect(mountains / land, seed).toBeGreaterThan(0.02);
      expect(mountains / land, seed).toBeLessThan(0.3);
      sum += mountains / land;
    }
    expect(sum / seeds.length).toBeGreaterThan(0.04);
    // (the lava islands are rock all over; the places of them clear only a ring of one tile)
    expect(sum / seeds.length).toBeLessThan(0.18);
  });
});
