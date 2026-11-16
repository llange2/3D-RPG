import { describe, expect, it } from "vitest";
import { MONSTER_IDS, MONSTERS } from "../../src/data/tables";
import { spotShares } from "../../src/world/difficulty";
import { isqrt, wrapDist2 } from "../../src/world/islands";
import { chunkSpawns } from "../../src/world/spawns";
import { World } from "../../src/world/world";

/**
 * The wild monsters of every level share it evenly (16. 11. 2026): the Vulture Roc took 69 % of level 5 in pearl-shore-794, the Dino Beetle 70 % of level 2
 * (the file keeps its first name, level 5, for the git history).
 */
describe("the wild monsters of a level", () => {
  const seeds = ["pearl-shore-794", "birch-reach-493", "amber-gate-204", "onyx-peak-873", "kelp-peak-430", "p25-a", "p25-b", "ember-wood-189"];

  it("ranks the groups of a level by their distance from Starthaven, from 0 to 1000 in equal steps", () => {
    const world = new World("pearl-shore-794", "default", "default");
    const home = world.anchorOf(0, 0);
    const spots: { x: number; y: number; tier: number }[] = [];
    for (let cy = 0; cy < world.chunksDown; cy++) {
      for (let cx = 0; cx < world.chunksAcross; cx++) {
        for (const g of chunkSpawns(world, cx, cy)) if (MONSTERS[g.monsterIds[0]!]!.terrain !== "water") spots.push({ x: g.x, y: g.y, tier: world.tierAt(g.x, g.y) });
      }
    }
    const shares = spotShares(world, spots);
    expect(shares).toHaveLength(spots.length);
    for (let tier = 1; tier <= 5; tier++) {
      const mine = spots.map((s, i) => ({ ...s, share: shares[i]!, d: wrapDist2(s.x, s.y, home.x, home.y, world.width, world.height) })).filter((s) => s.tier === tier);
      expect(mine.length, `level ${tier}`).toBeGreaterThan(3);
      const sorted = [...mine.map((s) => s.share)].sort((a, b) => a - b);
      // equal steps: the first in the middle of the first part, the last in the middle of the last
      expect(sorted[0]).toBe(Math.floor(500 / mine.length));
      expect(sorted[sorted.length - 1]).toBe(Math.floor((1000 * (2 * mine.length - 1)) / (2 * mine.length)));
      // nearer to Starthaven (in whole tiles, as the ranking counts), lower share
      for (const a of mine) for (const b of mine) if (isqrt(a.d) < isqrt(b.d)) expect(a.share, `level ${tier}`).toBeLessThan(b.share);
    }
  });

  it("gives each of the n wild monsters of every level about 1/n of the groups over several worlds (none under 0.6/n or over 1.4/n)", () => {
    const counts = new Map<number, Map<string, number>>();
    for (const seed of seeds) {
      const world = new World(seed, "default", "default");
      for (let cy = 0; cy < world.chunksDown; cy++) {
        for (let cx = 0; cx < world.chunksAcross; cx++) {
          for (const g of chunkSpawns(world, cx, cy)) {
            const tier = world.tierAt(g.x, g.y);
            for (const id of g.monsterIds) {
              const m = MONSTERS[id]!;
              if (m.terrain === "water") continue;
              const byName = counts.get(tier) ?? new Map<string, number>();
              byName.set(m.name, (byName.get(m.name) ?? 0) + 1);
              counts.set(tier, byName);
            }
          }
        }
      }
    }
    for (let tier = 1; tier <= 5; tier++) {
      const wild = MONSTER_IDS.filter((x) => MONSTERS[x]!.outside === "wild" && MONSTERS[x]!.treasure_level === tier && MONSTERS[x]!.terrain !== "water");
      const byName = counts.get(tier)!;
      const total = [...byName.values()].reduce((a, b) => a + b, 0);
      expect(total, `level ${tier}`).toBeGreaterThan(150);
      expect(byName.size, `level ${tier}`).toBe(wild.length);
      for (const [name, n] of byName) {
        expect(n / total, `${name} on level ${tier}`).toBeGreaterThan(0.6 / wild.length);
        expect(n / total, `${name} on level ${tier}`).toBeLessThan(1.4 / wild.length);
      }
    }
  });
});
