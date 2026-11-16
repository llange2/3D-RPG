import { describe, expect, it } from "vitest";
import { MONSTERS } from "../../src/data/tables";
import { shareAt } from "../../src/world/difficulty";
import { chunkSpawns } from "../../src/world/spawns";
import { World } from "../../src/world/world";

/** The wild monsters of level 5 share the land evenly (16. 11. 2026): the Vulture Roc took 69 % of them in pearl-shore-794. */
describe("wild monsters of level 5", () => {
  const seeds = ["pearl-shore-794", "birch-reach-493", "amber-gate-204", "onyx-peak-873"];

  it("keeps the share of the land between 0 and 1000 and rises with the distance from Starthaven", () => {
    const world = new World("pearl-shore-794", "default", "default");
    const home = world.anchorOf(0, 0);
    const tiles: { d: number; share: number }[] = [];
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        if (!world.islandAt(x, y) || world.tierAt(x, y) !== 5) continue;
        tiles.push({ d: Math.hypot(x - home.x, y - home.y), share: shareAt(world, x, y, 5) });
      }
    }
    expect(tiles.length).toBeGreaterThan(1000);
    for (const t of tiles) {
      expect(t.share).toBeGreaterThanOrEqual(0);
      expect(t.share).toBeLessThanOrEqual(1000);
    }
    // the farthest tenth of the tiles has the highest shares (the wrap of the globe bends the distance, so only the ends are compared)
    tiles.sort((a, b) => a.d - b.d);
    const tenth = Math.floor(tiles.length / 10);
    const mean = (list: { share: number }[]) => list.reduce((s, t) => s + t.share, 0) / list.length;
    expect(mean(tiles.slice(-tenth))).toBeGreaterThan(mean(tiles.slice(0, tenth)) + 500);
  });

  it("gives every one of the five wild monsters a share of 10 to 30 % over several worlds, none more than a third", () => {
    const counts = new Map<string, number>();
    for (const seed of seeds) {
      const world = new World(seed, "default", "default");
      for (let cy = 0; cy < world.chunksDown; cy++) {
        for (let cx = 0; cx < world.chunksAcross; cx++) {
          for (const g of chunkSpawns(world, cx, cy)) {
            if (world.tierAt(g.x, g.y) !== 5) continue;
            for (const id of g.monsterIds) {
              const m = MONSTERS[id]!;
              if (m.terrain === "water") continue;
              counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
            }
          }
        }
      }
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(200);
    expect(counts.size).toBe(5);
    for (const [name, n] of counts) {
      expect(n / total, name).toBeGreaterThan(0.1);
      expect(n / total, name).toBeLessThan(0.3);
    }
  });
});
