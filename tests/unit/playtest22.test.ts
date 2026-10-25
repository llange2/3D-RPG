import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { spacedAlongWalls } from "../../src/actions/rules";
import type { Anchor } from "../../src/actions/types";
import { knownContent } from "../../src/game/minimap";
import { generateInterior } from "../../src/interiors";
import { BANNER } from "../../src/data/castles";
import { BIOME, GROUND, WORLD_SIZES, isTileWalkable, poiEntrances, wrapDelta, type WorldSize } from "../../src/world/types";
import { fieldAt, type Island } from "../../src/world/islands";
import { World } from "../../src/world/world";

const SEEDS = ["alpha", "beta", "gamma", "delta", "zeta", "seed-3", "seed-7", "dune-keep-451"];
const SIZES: WorldSize[] = ["small", "default", "large", "huge"];
/** The share of the world that is land, in percent (the user's wish, 22nd playtest, follow-up). */
const LAND_SHARE: Record<WorldSize, number> = { small: 50, default: 46, large: 43, huge: 40 };

/** Every tile of the land of an island, as world coordinates. */
function landOf(world: World, isl: Island): { x: number; y: number; dx: number; dy: number }[] {
  const out: { x: number; y: number; dx: number; dy: number }[] = [];
  for (let dy = -isl.reach; dy <= isl.reach; dy++) {
    for (let dx = -isl.reach; dx <= isl.reach; dx++) if (fieldAt(isl, dx, dy) > 0) out.push({ x: world.wrapX(isl.x + dx), y: world.wrapY(isl.y + dy), dx, dy });
  }
  return out;
}

describe("22nd playtest, point 3: the world is wider than it is high", () => {
  it("is wider than high in every size, a multiple of ten each way", () => {
    for (const size of SIZES) {
      const { width, height } = WORLD_SIZES[size];
      expect(width, size).toBeGreaterThan(height);
      expect(width % 10, size).toBe(0);
      expect(height % 10, size).toBe(0);
    }
  });
});

describe("22nd playtest, point 1: no island is a circle", () => {
  it("shapes the big islands unevenly: a circle fills most of the circle round it, these fill well under three quarters of it", () => {
    for (const seed of SEEDS) {
      const world = new World(seed, "default");
      for (const isl of world.islands.filter((i) => i.big)) {
        expect(isl.area / (Math.PI * isl.reach * isl.reach), `${seed} island ${isl.index} (${isl.kind})`).toBeLessThan(0.75);
      }
    }
  });

  it("makes islands of every look the user described: continents, ovals, triangles, strips, bays", () => {
    const kinds = new Set<string>();
    for (const seed of SEEDS) for (const isl of new World(seed, "large").islands) kinds.add(isl.kind);
    for (const kind of ["continent", "blob", "oval", "triangle", "bay", "long"]) expect(kinds.has(kind), kind).toBe(true);
  });

  it("starts on a continent with an uneven coast, and its level-1 and level-2 towns both keep their half", () => {
    for (const seed of SEEDS) {
      const world = new World(seed, "default");
      const start = world.islands[0]!;
      expect(start.kind).toBe("continent");
      expect(start.biome).toBe(BIOME.MEADOW);
      const towns = world.region(0, 0).pois.filter((p) => p.kind === "town");
      expect(towns.filter((p) => p.tier === 1)).toHaveLength(WORLD_SIZES.default.towns);
      expect(towns.filter((p) => p.tier === 2)).toHaveLength(WORLD_SIZES.default.towns);
    }
  });

  it("puts a small island in a bay now and then, as the old outside map has one between its left islands", () => {
    let bays = 0;
    let islets = 0;
    for (const seed of SEEDS) {
      const world = new World(seed, "default");
      for (const host of world.islands.filter((i) => i.big && i.bay)) {
        bays++;
        const bay = host.bay!;
        if (world.islands.some((i) => !i.big && Math.max(Math.abs(i.x - (host.x + bay.x)), Math.abs(i.y - (host.y + bay.y))) <= bay.r)) islets++;
      }
    }
    expect(bays).toBeGreaterThan(3);
    expect(islets).toBeGreaterThan(2);
  });
});

describe("22nd playtest, point 2: never more small islands than big ones", () => {
  for (const size of SIZES) {
    it(`${size}: has at least four big islands, at most as many small ones, and the land share the user asked for`, { timeout: 120_000 }, () => {
      const { width, height } = WORLD_SIZES[size];
      for (const seed of SEEDS) {
        const world = new World(seed, size);
        const big = world.islands.filter((i) => i.big).length;
        const small = world.islands.length - big;
        expect(big, `${seed} big`).toBeGreaterThanOrEqual(4);
        expect(small, `${seed} small`).toBeLessThanOrEqual(big);
        // as many as there is room for: the rule asks for the same number, a crowded small world may fit fewer
        expect(small, `${seed} small`).toBeGreaterThanOrEqual(size === "small" ? 1 : big - 2);
        // the big ones are the ones with a big radius, the small ones are small (the coasts grow, the radius is the one they were placed with)
        const smallest = Math.min(...world.islands.filter((i) => i.big).map((i) => i.r));
        for (const isl of world.islands.filter((i) => !i.big)) expect(isl.r, `${seed} island ${isl.index}`).toBeLessThan(smallest);
        // levels: the start island has 1 and 2, then one island each of 3, 4, 5; every further island is level 4 or 5
        expect(world.islands.slice(0, 4).map((i) => [...i.tiers])).toEqual([[1, 2], [3], [4], [5]]);
        for (const isl of world.islands.slice(4)) expect([4, 5]).toContain(isl.tiers[0]);
        // the land: half of a small world, two fifths of a huge one
        const share = (world.islands.reduce((a, i) => a + i.area, 0) * 100) / (width * height);
        expect(share, `${seed} land share`).toBeGreaterThanOrEqual(LAND_SHARE[size] - 1);
        expect(share, `${seed} land share`).toBeLessThanOrEqual(LAND_SHARE[size] + 2.5);
      }
    });
  }

  it("keeps three tiles of sea at least between any two islands, the middle one deep", { timeout: 120_000 }, () => {
    for (const seed of SEEDS) {
      const world = new World(seed, "default");
      for (const a of world.islands) {
        for (const b of world.islands) {
          if (b.index <= a.index) continue;
          // only islands that come near each other can break the rule
          if (Math.abs(wrapDelta(a.x, b.x, world.width)) > a.reach + b.reach + 8 || Math.abs(wrapDelta(a.y, b.y, world.height)) > a.reach + b.reach + 8) continue;
          let violations = 0;
          for (const t of landOf(world, a)) {
            // only the coast of the island can come near another one
            if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([ax, ay]) => fieldAt(a, t.dx + ax!, t.dy + ay!) > 0)) continue;
            for (let oy = -3; oy <= 3; oy++) {
              for (let ox = -3; ox <= 3; ox++) {
                if (fieldAt(b, wrapDelta(b.x, world.wrapX(t.x + ox), world.width), wrapDelta(b.y, world.wrapY(t.y + oy), world.height)) > 0) violations++;
              }
            }
          }
          expect(violations, `${seed}: islands ${a.index} and ${b.index}`).toBe(0);
        }
      }
    }
  });
});

describe("22nd playtest, point 1e: rivers (the lava rings of point 1d went in the 28th playtest, see playtest28.test.ts)", () => {
  it("has no river on a lava or desert island, rivers on the meadow and the swamp, and more of them in the swamp", () => {
    const share: Record<number, { area: number; water: number }> = {};
    for (const seed of SEEDS) {
      for (const size of ["default", "large"] as const) {
        const world = new World(seed, size);
        for (const isl of world.islands) {
          const e = (share[isl.biome] ??= { area: 0, water: 0 });
          for (const t of landOf(world, isl)) {
            e.area++;
            const g = world.baseTile(t.x, t.y).ground;
            if (g === GROUND.WATER || g === GROUND.SHALLOW) e.water++;
          }
        }
      }
    }
    const of = (b: number): number => (share[b]!.water * 100) / share[b]!.area;
    expect(share[BIOME.LAVA]!.water).toBe(0);
    expect(share[BIOME.DESERT]!.water).toBe(0);
    expect(of(BIOME.MEADOW), "meadow").toBeGreaterThan(1.5);
    expect(of(BIOME.SWAMP), "swamp").toBeGreaterThan(5);
    expect(of(BIOME.SWAMP)).toBeGreaterThan(of(BIOME.MEADOW) * 1.3);
  });
});

describe("22nd playtest, point 5: swimming", () => {
  it("makes the deep water of a small inland water (three tiles wide or less, land at both ends) shallow, and leaves wider lakes and the sea deep", () => {
    let narrow = 0;
    let lakes = 0;
    for (const seed of SEEDS) {
      const world = new World(seed, "default");
      const wet = (x: number, y: number): boolean => {
        const g = world.tile(x, y).ground;
        return g === GROUND.WATER || g === GROUND.SHALLOW;
      };
      for (const isl of world.islands) {
        for (const t of landOf(world, isl)) {
          const here = world.tile(t.x, t.y).ground;
          if (here !== GROUND.WATER && here !== GROUND.SHALLOW) continue;
          for (const [ax, ay] of [[1, 0], [0, 1]] as const) {
            let run = 1;
            let closed = true;
            for (const sign of [1, -1]) {
              let k = 1;
              while (k <= 3 && wet(t.x + sign * ax * k, t.y + sign * ay * k)) k++;
              if (k > 3) closed = false;
              run += k - 1;
            }
            if (closed && run <= 3) {
              narrow++;
              expect(here, `${seed} ${t.x},${t.y}: water ${run} wide`).toBe(GROUND.SHALLOW);
            }
          }
          if (here === GROUND.WATER) lakes++;
        }
      }
    }
    expect(narrow).toBeGreaterThan(100);
    // wider water stays deep somewhere: a pond of the swamp or the meadow
    expect(lakes).toBeGreaterThan(0);
  });

  it("keeps the sea between islands deep: no run of shallow tiles joins two islands", () => {
    // from the shore of the level-4 island by shallow water, never reaching the start island
    for (const seed of SEEDS) {
      const world = new World(seed, "default");
      const { width } = WORLD_SIZES.default;
      const isl = world.islands[2]!;
      const first = landOf(world, isl)[0]!;
      const seen = new Set<number>([first.y * width + first.x]);
      const stack: [number, number][] = [[first.x, first.y]];
      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = world.wrapX(x + dx);
          const ny = world.wrapY(y + dy);
          const key = ny * width + nx;
          if (seen.has(key) || !isTileWalkable(world.tile(nx, ny))) continue;
          seen.add(key);
          stack.push([nx, ny]);
        }
      }
      for (const other of world.islands) {
        if (other.index === isl.index) continue;
        const touched = landOf(world, other).some((t) => seen.has(t.y * width + t.x));
        expect(touched, `${seed}: wading from island 2 reaches island ${other.index}`).toBe(false);
      }
    }
  });
});

describe("22nd playtest, point 4: banners in the castles", () => {
  it("hangs banners along a straight wall at an even distance, centred, and none on a wall shorter than three", () => {
    const anchor = (x: number, y: number): Anchor => ({ x, y, depth: 0, roomId: 0 });
    // a hall with its north wall along y = 1 (floor from x = 1 to 9) and a short wall of two cells at the south
    const floor = (x: number, y: number): boolean => y >= 2 && y <= 6 && x >= 1 && x <= 9;
    const north = Array.from({ length: 9 }, (_, i) => anchor(1 + i, 2));
    const chosen = spacedAlongWalls(north, floor, 3);
    expect(chosen.map((a) => a.x)).toEqual([2, 5, 8]);
    const short = [anchor(4, 6), anchor(5, 6)];
    expect(spacedAlongWalls(short, floor, 3)).toEqual([]);
    // a stretch of 8: one banner every third cell, from the first one
    expect(spacedAlongWalls(north.slice(0, 8), floor, 3).map((a) => a.x)).toEqual([1, 4, 7]);
  });

  it("gives a castle many banners, each one of its kind, spaced along its walls", { timeout: 120_000 }, () => {
    const world = new World("banners-22", "huge");
    let castles = 0;
    let total = 0;
    for (const poi of world.allPois().filter((p) => p.kind === "castle").slice(0, 40)) {
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      const banners = content.actions.filter((a) => a.kind === "decor" && Object.values(BANNER).includes(Number(a.params.item)));
      castles++;
      total += banners.length;
      expect(banners.length, poi.id).toBeGreaterThanOrEqual(3);
      for (const b of banners) expect(b.params.item, `${poi.id} ${map.castle!.alignment}`).toBe(BANNER[map.castle!.alignment]);
    }
    expect(castles).toBeGreaterThan(10);
    // the old castles have a few dozen; a handful is what the first version had (two to four)
    expect(total / castles).toBeGreaterThan(8);
  });
});

describe("22nd playtest, point 6: a hidden object counts as used once it has been visited", () => {
  it("shows a fountain on the map once its `@visited` mark is in `opened`, whether or not it healed anyone", () => {
    const fountain = { uid: "m#fountain:0", kind: "fountain", x: 3, y: 3, params: {} };
    const chest = { uid: "m#chest:0", kind: "treasure", x: 4, y: 3, params: { chest: 4 } };
    const content = { mapKey: "m", tier: 1, actions: [fountain, chest], spawns: [] } as unknown as Parameters<typeof knownContent>[0];
    const uids = (opened: string[]): string[] => knownContent(content, new Set(opened), false).actions.map((a) => a.uid);
    expect(uids([])).not.toContain("m#fountain:0");
    expect(uids(["m#fountain:0@visited"])).toContain("m#fountain:0");
  });
});
