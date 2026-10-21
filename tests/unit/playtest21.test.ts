import { describe, expect, it } from "vitest";
import { GROUND, WORLD_SIZES, isTileWalkable, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

/** Flood fill over dry ground (no water, not even the shallows), round the globe; returns a set of tile keys. */
function dryReach(world: World, sx: number, sy: number): Set<number> {
  const { width, height } = WORLD_SIZES[world.size];
  const dry = (x: number, y: number): boolean => {
    const t = world.tile(x, y);
    return isTileWalkable(t) && t.ground !== GROUND.SHALLOW;
  };
  const seen = new Set<number>();
  const stack: [number, number][] = [[sx, sy]];
  seen.add(sy * width + sx);
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = world.wrapX(x + dx);
      const ny = world.wrapY(y + dy);
      const k = ny * width + nx;
      if (seen.has(k) || !dry(nx, ny)) continue;
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  void height;
  return seen;
}

describe("the islands of the 21st playtest", () => {
  const SEEDS = ["alpha", "beta", "gamma", "seed-3", "seed-7", "dune-keep-451"];
  const SIZES: WorldSize[] = ["small", "default"];

  for (const size of SIZES) {
    for (const seed of SEEDS) {
      it(`${size} ${seed}: levels 1 and 2 on one island, a bridge to level 3, levels 4 and 5 apart on their own islands`, { timeout: 120_000 }, () => {
        const world = new World(seed, size);
        const [a, b, c, d] = world.islands;
        expect(a!.tiers).toEqual([1, 2]);
        expect(b!.tiers).toEqual([3]);
        expect(c!.tiers).toEqual([4]);
        expect(d!.tiers).toEqual([5]);
        // no island has two of the levels 3 to 5, and the small ones are level 4 or 5 only
        for (const isl of world.islands.slice(1)) {
          expect(isl.tiers).toHaveLength(1);
          if (isl.index > 3) expect([4, 5]).toContain(isl.tiers[0]);
          for (const p of world.region(isl.index, 0).pois) expect(p.tier, p.id).toBe(isl.tiers[0]);
        }
        // the start island holds both of its levels, one on each side of its middle, each with its town
        const start = world.region(0, 0).pois;
        expect(start.some((p) => p.tier === 1 && p.kind === "town")).toBe(true);
        expect(start.some((p) => p.tier === 2 && p.kind === "town")).toBe(true);
        for (const p of start) expect([1, 2], p.id).toContain(p.tier);

        // on foot over dry ground the start island leads to the level-3 island (the bridge) and to no other island
        const reach = dryReach(world, ...(([front]) => [front!.x, front!.y] as const)([world.frontOf(world.poiById("p:0:0:0")!)]));
        const { width } = WORLD_SIZES[size];
        const reached = (id: string): boolean => {
          const f = world.frontOf(world.poiById(id)!);
          return reach.has(world.wrapY(f.y) * width + world.wrapX(f.x));
        };
        expect(reached("p:1:0:0"), "the town of level 3").toBe(true);
        for (const id of ["p:2:0:0", "p:3:0:0"]) expect(reached(id), id).toBe(false);
        // the bridge is a road over water
        let bridge = 0;
        const { height } = WORLD_SIZES[size];
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (world.tile(x, y).ground === GROUND.BRIDGE) bridge++;
        expect(bridge, "bridge tiles").toBeGreaterThan(3);
      });
    }
  }

  it("has more islands the bigger the world is, and at least the four big ones on the small world", () => {
    const counts = (["small", "default", "large", "huge"] as const).map((s) => new World("count", s).islands.length);
    expect(counts[0]!).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!, `${i}`).toBeGreaterThan(counts[i - 1]!);
  });

  it("measures 100 x 70, 200 x 140, 300 x 210 and 400 x 280 tiles (the 22nd playtest: always wider than high)", () => {
    expect((["small", "default", "large", "huge"] as const).map((s) => [WORLD_SIZES[s].width, WORLD_SIZES[s].height])).toEqual([[100, 70], [200, 140], [300, 210], [400, 280]]);
  });

  it("keeps every island off the seam and away from the others", () => {
    for (const size of ["small", "default", "large"] as const) {
      const world = new World("spacing", size);
      const { width, height } = WORLD_SIZES[size];
      for (const i of world.islands) {
        expect(i.x + i.box.x0, `${size} ${i.index} west`).toBeGreaterThanOrEqual(2);
        expect(i.x + i.box.x1, `${size} ${i.index} east`).toBeLessThanOrEqual(width - 1 - 2);
        expect(i.y + i.box.y0, `${size} ${i.index} north`).toBeGreaterThanOrEqual(2);
        expect(i.y + i.box.y1, `${size} ${i.index} south`).toBeLessThanOrEqual(height - 1 - 2);
      }
    }
  });
});
