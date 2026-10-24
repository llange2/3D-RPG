import { describe, expect, it } from "vitest";
import { MONSTER_IDS, MONSTERS } from "../../src/data/tables";
import { hutsOf } from "../../src/world/huts";
import { isqrt, wrapDist2 } from "../../src/world/islands";
import { chunkSpawns, type OverworldSpawn } from "../../src/world/spawns";
import { CHUNK_SIZE, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const SIZES: WorldSize[] = ["small", "default", "large", "huge"];

/** Every wild group of the world once. */
function groupsOf(world: World): OverworldSpawn[] {
  const all: OverworldSpawn[] = [];
  for (let cy = 0; cy < world.height / CHUNK_SIZE; cy++) for (let cx = 0; cx < world.width / CHUNK_SIZE; cx++) all.push(...chunkSpawns(world, cx, cy));
  return all;
}

const strongest = (g: OverworldSpawn): number => Math.max(...g.monsterIds.map((m) => MONSTERS[m]!.xp));

describe("the wild groups of the 26th playtest (onyx-peak-786, small)", () => {
  it("has a group on every island, whatever its size (no island without a single wild monster)", () => {
    for (const [seed, size] of [["onyx-peak-786", "small"], ["kelp-peak-430", "small"], ["p26-a", "default"]] as const) {
      const world = new World(seed, size);
      const perIsland = new Map<number, number>();
      for (const g of groupsOf(world)) {
        const isl = world.islandAt(g.x, g.y);
        if (isl) perIsland.set(isl.index, (perIsland.get(isl.index) ?? 0) + 1);
      }
      for (const isl of world.islands) expect(perIsland.get(isl.index) ?? 0, `${seed} ${size} island ${isl.index} (${isl.area} tiles)`).toBeGreaterThan(0);
    }
  });

  it("holds as many groups as the land of an island asks for: no cluster on one island and nothing on the next", () => {
    for (const size of SIZES) {
      const world = new World("p26-even", size);
      const perIsland = new Map<number, number>();
      for (const g of groupsOf(world)) {
        const isl = world.islandAt(g.x, g.y);
        if (isl) perIsland.set(isl.index, (perIsland.get(isl.index) ?? 0) + 1);
      }
      for (const isl of world.islands) {
        const n = perIsland.get(isl.index) ?? 0;
        // one group to 90 tiles of land, at least one; a few may find no place
        expect(n, `${size} island ${isl.index} (${isl.area} tiles)`).toBeLessThanOrEqual(Math.max(1, Math.round(isl.area / 90)));
        // (a speck of rock and trees of a few dozen tiles may have no ground to stand on at all)
        if (isl.area >= 90) expect(n, `${size} island ${isl.index} (${isl.area} tiles)`).toBeGreaterThanOrEqual(Math.max(1, Math.round(isl.area / 90) - 3));
      }
    }
  });

  it("keeps the groups of an island apart from each other: the nearest two are not next to each other", () => {
    const world = new World("onyx-peak-786", "small");
    const home = world.anchorOf(0, 0);
    void home;
    const groups = groupsOf(world).filter((g) => world.islandAt(g.x, g.y)?.index === 0);
    for (const g of groups) {
      const nearest = Math.min(...groups.filter((o) => o !== g).map((o) => Math.hypot(o.x - g.x, o.y - g.y)));
      expect(nearest, g.uid).toBeGreaterThanOrEqual(3);
    }
  });

  it("puts the island of level 5 farther from the start island than the island of level 4, on every size", () => {
    for (const size of SIZES) {
      for (const seed of ["onyx-peak-786", "onyx-peak-873", "p26-a", "p26-b", "p26-c", "p26-d"]) {
        const world = new World(seed, size);
        const home = world.islands[0]!;
        const dist = (i: number) => wrapDist2(world.islands[i]!.x, world.islands[i]!.y, home.x, home.y, world.width, world.height);
        expect(dist(3), `${seed} ${size}`).toBeGreaterThanOrEqual(dist(2));
        expect(world.islands[2]!.tiers).toEqual([4]);
        expect(world.islands[3]!.tiers).toEqual([5]);
      }
    }
  });

  for (const size of SIZES) {
    it(`makes a monster the stronger the farther it stands from Starthaven (level by level, huts and wild groups, ${size} world)`, () => {
      for (const seed of size === "huge" || size === "large" ? ["onyx-peak-786", "p26-a"] : ["onyx-peak-786", "p26-a", "p26-b"]) {
        const world = new World(seed, size);
        const home = world.anchorOf(0, 0);
        const far = (x: number, y: number) => isqrt(wrapDist2(x, y, home.x, home.y, world.width, world.height));
        // the huts: strictly, level by level, in the order of the monsters' XP
        for (let level = 1; level <= 5; level++) {
          const huts = hutsOf(world)
            .filter((h) => MONSTERS[h.monster]!.treasure_level === level)
            .sort((a, b) => MONSTERS[a.monster]!.xp - MONSTERS[b.monster]!.xp || a.monster - b.monster);
          const dist = huts.map((h) => wrapDist2(h.x, h.y, home.x, home.y, world.width, world.height));
          expect(dist, `${seed} ${size} level ${level}`).toEqual([...dist].sort((a, b) => a - b));
        }
        // the wild groups: of each level the farther half holds the stronger monsters
        const byLevel = new Map<number, OverworldSpawn[]>();
        for (const g of groupsOf(world)) {
          if (MONSTERS[g.monsterIds[0]!]!.terrain === "water") continue;
          const level = world.tierAt(g.x, g.y);
          byLevel.set(level, [...(byLevel.get(level) ?? []), g]);
        }
        for (const [level, list] of byLevel) {
          if (list.length < 6) continue;
          const sorted = [...list].sort((a, b) => far(a.x, a.y) - far(b.x, b.y));
          const half = Math.floor(sorted.length / 2);
          const mean = (part: OverworldSpawn[]) => part.reduce((n, g) => n + strongest(g), 0) / part.length;
          expect(mean(sorted.slice(half)), `${seed} ${size} level ${level}`).toBeGreaterThanOrEqual(mean(sorted.slice(0, half)));
        }
      }
    });
  }

  it("keeps the strong monsters of the strongest levels away from the first town (onyx-peak-786: nothing of level 5 within 30 tiles)", () => {
    const world = new World("onyx-peak-786", "small");
    const home = world.anchorOf(0, 0);
    for (const g of groupsOf(world)) {
      const d = Math.hypot(g.x - home.x, g.y - home.y);
      if (d < 30) {
        for (const m of g.monsterIds) expect(MONSTERS[m]!.treasure_level, `${g.uid} ${MONSTERS[m]!.name} at ${Math.round(d)} tiles`).toBeLessThan(5);
      }
    }
  });

  it("puts the sea monsters by the distance from Starthaven: the strongest only far out", () => {
    for (const size of SIZES) {
      const world = new World("p26-sea", size);
      const home = world.anchorOf(0, 0);
      const farthest = isqrt((world.width >> 1) ** 2 + (world.height >> 1) ** 2);
      const octobeast = MONSTER_IDS.find((m) => MONSTERS[m]!.name === "Octobeast")!;
      for (const g of groupsOf(world)) {
        if (!g.monsterIds.includes(octobeast)) continue;
        expect(isqrt(wrapDist2(g.x, g.y, home.x, home.y, world.width, world.height)), `${size} ${g.uid}`).toBeGreaterThanOrEqual(Math.floor(farthest * 0.65));
      }
    }
  });
});
