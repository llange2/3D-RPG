/**
 * The ground round a place on a lava island is a ring of lava one tile wide (it was two tiles of plain ground); outside it comes rock or the stream of a way.
 */
import { describe, expect, it } from "vitest";
import { BIOME, GROUND, poiBounds } from "../../src/world/types";
import { World } from "../../src/world/world";

const SEEDS = ["alpha", "beta", "gamma", "birch-hold-759"];

describe("lava ring round the places of a lava island", () => {
  it("is one tile of lava, and no plain ground lies two tiles out", () => {
    let rings = 0;
    for (const seed of SEEDS) {
      for (const size of ["default", "large"] as const) {
        const world = new World(seed, size);
        for (const isl of world.islands.filter((i) => i.biome === BIOME.LAVA)) {
          for (const p of world.region(isl.index, 0).pois) {
            const b = poiBounds(p);
            for (let y = b.y0 - 2; y <= b.y1 + 2; y++) {
              for (let x = b.x0 - 2; x <= b.x1 + 2; x++) {
                const inside = x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
                if (inside) continue;
                const ring = x >= b.x0 - 1 && x <= b.x1 + 1 && y >= b.y0 - 1 && y <= b.y1 + 1;
                const g = world.tile(x, y).ground;
                // (lava beside the sea is made land, `rawTile`: a stream that meets the sea lies bare, and so does the shore of a place at the coast)
                const shore = [-2, -1, 0, 1, 2].some((ay) => [-2, -1, 0, 1, 2].some((ax) => {
                  const n = world.tile(x + ax, y + ay).ground;
                  return n === GROUND.WATER || n === GROUND.SHALLOW;
                }));
                if (ring) {
                  expect(g === GROUND.LAVA_POOL || shore, `${seed} ${size} ${p.name}: ring at ${x},${y} is ground ${g}`).toBe(true);
                  if (g === GROUND.LAVA_POOL) rings++;
                } else {
                  expect(g === GROUND.MOUNTAIN || g === GROUND.LAVA_POOL || shore, `${seed} ${size} ${p.name}: ${x},${y} is ground ${g}`).toBe(true);
                }
              }
            }
          }
        }
      }
    }
    expect(rings).toBeGreaterThan(0);
  });
});
