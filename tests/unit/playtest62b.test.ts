import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { MONSTERS } from "../../src/data/tables";
import { generateInterior } from "../../src/interiors";
import { planDungeon } from "../../src/interiors/dungeonPlan";
import { GROUND, isTower, poiBounds } from "../../src/world/types";
import { World } from "../../src/world/world";

/**
 * The 62nd playtest, points 5 and 6 (places per level): the pyramids stand on islands of level 5, the islands of levels 1 to 4 hold more caves and dungeons (tight places with walls of mountains
 * between close neighbours), and the guard of the deepest room is never above its place's level.
 */
const SEEDS = ["pearl-wood-803", "amber-gate-204", "frost-gate-324", "birch-reach-493", "ember-wood-189"];
const places = (world: World) => world.allPois().filter((p) => p.kind === "dungeon" || p.kind === "cave");

describe("62nd playtest, point 5: the pyramids stand on islands of level 5", () => {
  it("has all five pyramids on level 5 in small and default worlds (and so labels them level 5 on the map)", () => {
    for (const size of ["small", "default"] as const) {
      for (const seed of SEEDS) {
        const world = new World(seed, size, "default");
        const pyramids = world.allPois().filter((p) => p.kind === "dungeon" && p.size === 3);
        expect(pyramids.length, `${seed} ${size}`).toBe(5);
        for (const p of pyramids) expect(p.tier, `${seed} ${size} ${p.id}`).toBe(5);
      }
    }
  });

  it("spreads them over the islands of level 5: none holds a third while another has a place to spare", () => {
    for (const seed of SEEDS) {
      const world = new World(seed, "small");
      const level5 = places(world).filter((p) => p.tier === 5);
      const islands = new Set(level5.map((p) => p.region.rx));
      const per = new Map<number, number>();
      for (const p of level5.filter((q) => q.size === 3)) per.set(p.region.rx, (per.get(p.region.rx) ?? 0) + 1);
      expect(Math.max(...per.values()), seed).toBeLessThanOrEqual(Math.ceil(5 / islands.size));
    }
  });

  it("lays the orbs in at least four dungeons (the pyramids took most of level 5, so some lie on level 4), none holding more than seven", () => {
    for (const seed of SEEDS) {
      for (const density of ["default", "maximum"] as const) {
        const world = new World(seed, "small", density);
        const orbs = places(world).filter((p) => p.size !== 3).map((p) => planDungeon(world, p)?.orbs ?? 0);
        expect(orbs.filter((n) => n > 0).length, `${seed} ${density}`).toBeGreaterThanOrEqual(4);
        expect(Math.max(...orbs), `${seed} ${density}`).toBeLessThanOrEqual(7);
      }
    }
  });
});

describe("62nd playtest, point 5: tight places", () => {
  it("has them on the islands of levels 1 to 4 only, never as a castle, a pyramid or a tower, and keeps the distances", () => {
    let tight = 0;
    for (const seed of SEEDS) {
      const world = new World(seed, "small");
      const all = world.allPois();
      for (const p of all.filter((q) => q.tight)) {
        tight++;
        expect(p.tier, `${seed} ${p.id}`).toBeLessThan(5);
        expect(p.kind === "dungeon" || p.kind === "cave", `${seed} ${p.id}`).toBe(true);
        expect(p.size, `${seed} ${p.id}`).toBe(1);
        expect(isTower(p), `${seed} ${p.id}`).toBe(false);
        for (const q of all.filter((o) => o !== p)) {
          const d = Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
          expect(d, `${seed} ${p.id} to ${q.id}`).toBeGreaterThanOrEqual(q.kind === "town" || q.kind === "castle" || q.size >= 2 ? 6 : 4);
        }
      }
    }
    expect(tight).toBeGreaterThan(20);
  });

  it("makes the levels 1 to 4 hold about as many places as level 5 (the sum over five small worlds: none under three fifths of it)", () => {
    const sum: Record<number, number> = {};
    for (const seed of SEEDS) for (const p of places(new World(seed, "small", "default"))) sum[p.tier] = (sum[p.tier] ?? 0) + 1;
    for (const level of [1, 2, 3, 4]) expect(sum[level]!, `level ${level}: ${JSON.stringify(sum)}`).toBeGreaterThanOrEqual(0.6 * sum[5]!);
  });

  it("closes a tight place that has a close neighbour with a wall of mountains on the three sides away from its door", () => {
    let walled = 0;
    for (const seed of SEEDS) {
      const world = new World(seed, "small");
      const all = world.allPois();
      for (const p of all.filter((q) => q.tight && all.some((o) => o !== q && Math.max(Math.abs(o.x - q.x), Math.abs(o.y - q.y)) < 6))) {
        const b = poiBounds(p);
        const door = { N: { dx: 0, dy: -1 }, E: { dx: 1, dy: 0 }, S: { dx: 0, dy: 1 }, W: { dx: -1, dy: 0 } }[p.side];
        // the tile two steps behind the footprint, opposite to the door: a wall (unless a road or a place there)
        const back = { x: p.x - door.dx * 2, y: p.y - door.dy * 2 };
        const g = world.tile(back.x, back.y).ground;
        if (g === GROUND.MOUNTAIN) walled++;
        // the door side stays open: the tile in front of the door is walkable
        expect(world.tile(b.x0 + (door.dx > 0 ? 1 : door.dx < 0 ? -1 : 0), b.y0 + (door.dy > 0 ? 1 : door.dy < 0 ? -1 : 0)).ground, `${seed} ${p.id} door`).not.toBe(GROUND.MOUNTAIN);
      }
    }
    expect(walled).toBeGreaterThan(3);
  });
});

describe("62nd playtest, point 6: the guard of the deepest room", () => {
  it("is never above the level of its place (only the end boss of a quest may be one level above)", () => {
    let guards = 0;
    for (const seed of ["pearl-wood-803", "amber-gate-204"]) {
      const world = new World(seed, "small", "default");
      for (const poi of places(world).filter((p) => planDungeon(world, p)?.klass !== "C")) {
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        for (const s of content.spawns.filter((q) => q.uid.includes("#boss_guard"))) {
          guards++;
          for (const id of s.monsterIds) expect(MONSTERS[id]!.treasure_level, `${seed} ${poi.name} (level ${poi.tier}): ${MONSTERS[id]!.name}`).toBeLessThanOrEqual(poi.tier);
        }
      }
    }
    expect(guards).toBeGreaterThan(5);
  });
});
