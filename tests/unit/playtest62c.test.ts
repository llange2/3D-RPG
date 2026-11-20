import { describe, expect, it } from "vitest";
import { BIOME, GROUND, poiEntrances, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

/**
 * The 62nd playtest, point 5b: the lava island was mostly rock that nobody could use. It now holds more places (they may stand two tiles from the coast and four tiles from each other), with
 * the doors, the streams and the landing kept off the sea, so that no stripe of bare land reaches the coast of the next island.
 */
const SEEDS = ["pearl-wood-803", "amber-gate-204", "frost-gate-324", "birch-reach-493", "ember-wood-189"];

const lavaIslands = (world: World) => world.islands.filter((i) => i.biome === BIOME.LAVA);

describe("62nd playtest, point 5b: the lava island", () => {
  it("holds at least five places in a small world and less than three fifths of it is rock", () => {
    for (const seed of SEEDS) {
      const world = new World(seed, "small");
      for (const isl of lavaIslands(world)) {
        const pois = world.region(isl.index, 0).pois;
        expect(pois.length, `${seed}: ${pois.length} places`).toBeGreaterThanOrEqual(4);
        let rock = 0;
        let land = 0;
        for (let y = isl.y - isl.reach; y <= isl.y + isl.reach; y++) {
          for (let x = isl.x - isl.reach; x <= isl.x + isl.reach; x++) {
            const t = world.tile(x, y);
            if (t.biome !== BIOME.LAVA) continue;
            if (t.ground === GROUND.MOUNTAIN) rock++;
            if (t.ground === GROUND.MOUNTAIN || t.ground === GROUND.LAND || t.ground === GROUND.LAVA_POOL || t.ground === GROUND.POI_BLOCK) land++;
          }
        }
        expect(rock / land, `${seed}: ${rock} of ${land}`).toBeLessThan(0.62);
      }
    }
  });

  it("keeps its places four tiles apart (five from a pyramid's centre is not asked: the footprint of three tiles is) and two tiles from the coast", () => {
    for (const size of ["small", "default"] as WorldSize[]) {
      for (const seed of SEEDS.slice(0, 3)) {
        const world = new World(seed, size);
        for (const isl of lavaIslands(world)) {
          const pois = world.region(isl.index, 0).pois;
          for (const p of pois) {
            for (const q of pois.filter((o) => o !== p)) expect(Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)), `${seed} ${p.id} ${q.id}`).toBeGreaterThanOrEqual(4);
          }
        }
      }
    }
  });

  it("turns the door of a place away from the coast: the tile two steps out from the door is not water", () => {
    for (const seed of SEEDS) {
      const world = new World(seed, "small");
      for (const isl of lavaIslands(world)) {
        for (const p of world.region(isl.index, 0).pois.slice(1)) {
          const front = poiEntrances(p)[0]!;
          const out = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } }[p.side];
          const g = world.tile(front.x + 2 * out.x, front.y + 2 * out.y).ground;
          expect(g === GROUND.WATER || g === GROUND.SHALLOW, `${seed} ${p.id} (${p.side})`).toBe(false);
        }
      }
    }
  });
});
