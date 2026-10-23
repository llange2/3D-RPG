import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FLAT_TERRAINS, quartersOf, type FlatRegister, type FlatTerrain } from "../../src/data/flatTerrain";
import { FLAT_PRIORITY, FlatTileSet, flatTerrainOf } from "../../src/render/flatGround";
import { BIOME, GROUND } from "../../src/world/types";
import { World } from "../../src/world/world";

const REGISTER = join(import.meta.dirname, "..", "..", "public", "assets", "terrain", "flat", "tiles.json");

describe("flatTerrainOf", () => {
  it("paints water, lava and roads by what they are and the land by its biome", () => {
    expect(flatTerrainOf({ ground: GROUND.WATER, biome: BIOME.OCEAN })).toBe("water");
    expect(flatTerrainOf({ ground: GROUND.SHALLOW, biome: BIOME.DESERT })).toBe("water");
    expect(flatTerrainOf({ ground: GROUND.LAVA_POOL, biome: BIOME.LAVA })).toBe("lava");
    for (const ground of [GROUND.ROAD, GROUND.PASS, GROUND.BRIDGE]) expect(flatTerrainOf({ ground, biome: BIOME.SNOW })).toBe("cobblestone");
    expect(flatTerrainOf({ ground: GROUND.LAND, biome: BIOME.MEADOW })).toBe("grass");
    expect(flatTerrainOf({ ground: GROUND.MOUNTAIN, biome: BIOME.FOREST })).toBe("grass");
    expect(flatTerrainOf({ ground: GROUND.POI_BLOCK, biome: BIOME.SNOW })).toBe("snow");
    expect(flatTerrainOf({ ground: GROUND.LAND, biome: BIOME.LAVA })).toBe("dirt");
  });

  it("ranks every terrain once for the ties", () => {
    expect([...FLAT_PRIORITY].sort()).toEqual([...FLAT_TERRAINS].sort());
  });
});

describe.skipIf(!existsSync(REGISTER))("flat ground tiles", () => {
  const read = (): FlatRegister => JSON.parse(readFileSync(REGISTER, "utf-8")) as FlatRegister;
  const quarters = (set: FlatTileSet, register: FlatRegister, q: [FlatTerrain, FlatTerrain, FlatTerrain, FlatTerrain]) => quartersOf(register.tiles[set.pick(...q)]!);

  it("has a plain tile for every terrain", () => {
    const set = new FlatTileSet(read());
    for (const t of FLAT_TERRAINS) {
      expect(set.has(t), t).toBe(true);
      expect(set.pick(t, t, t, t)).toBe(`${t}_full`);
    }
  });

  it("gives every colouring of four quarters with the two terrains of a pair exactly its tile", () => {
    const register = read();
    const set = new FlatTileSet(register);
    const pairs = new Set<string>();
    for (const t of Object.values(register.tiles)) if (t.other) pairs.add([t.terrain, t.other].sort().join("|"));
    for (const pair of pairs) {
      const [a, b] = pair.split("|") as [FlatTerrain, FlatTerrain];
      for (let mask = 1; mask < 15; mask++) {
        const q = [0, 1, 2, 3].map((i) => (mask & (1 << i) ? b : a)) as [FlatTerrain, FlatTerrain, FlatTerrain, FlatTerrain];
        expect(quarters(set, register, q), `${pair} ${mask}`).toEqual(q);
      }
    }
  });

  it("blends the most common terrain with the most common other one where more than two meet, and lets ties go by priority", () => {
    const register = read();
    const set = new FlatTileSet(register);
    // (cobblestone, water and a land have tiles of their own, `mix_…`; snow beside grass and water has none)
    // grass, grass, water, snow: grass has two quarters, water and snow one each, water wins the tie
    expect(quarters(set, register, ["grass", "grass", "water", "snow"])).toEqual(["grass", "grass", "water", "grass"]);
    // the same corner with the quarters in another order picks the same pair
    expect(quarters(set, register, ["snow", "water", "grass", "grass"])).toEqual(["grass", "water", "grass", "grass"]);
    // three quarters of one terrain stay as they are
    expect(quarters(set, register, ["water", "water", "water", "cobblestone"])).toEqual(["water", "water", "water", "cobblestone"]);
  });

  it("finds a tile for every corner of real worlds and rarely has to simplify one", () => {
    const register = read();
    const set = new FlatTileSet(register);
    let corners = 0;
    let simplified = 0;
    const missingPairs = new Map<string, number>();
    for (const seed of ["alpha", "delta", "kelp-mere-931"]) {
      const world = new World(seed);
      const N = 160;
      const grid: FlatTerrain[] = [];
      for (let y = -N; y < N; y++) for (let x = -N; x < N; x++) grid.push(flatTerrainOf(world.tile(x, y)));
      const at = (x: number, y: number) => grid[y * 2 * N + x]!;
      for (let y = 1; y < 2 * N; y++) {
        for (let x = 1; x < 2 * N; x++) {
          const want: [FlatTerrain, FlatTerrain, FlatTerrain, FlatTerrain] = [at(x - 1, y - 1), at(x, y - 1), at(x - 1, y), at(x, y)];
          const name = set.pick(...want);
          expect(register.tiles[name], name).toBeDefined();
          corners++;
          const got = quartersOf(register.tiles[name]!);
          if (got && got.join() !== want.join()) {
            simplified++;
            const kinds = [...new Set(want)].sort().join("|");
            missingPairs.set(kinds, (missingPairs.get(kinds) ?? 0) + 1);
          }
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`flat ground: ${simplified} of ${corners} corners simplified`, [...missingPairs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 12));
    expect(simplified / corners).toBeLessThan(0.01);
  }, 120_000);
});
