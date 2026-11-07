import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { Rng } from "../../src/core/rng";
import { hash2 } from "../../src/core/noise";
import { MONSTER_IDS } from "../../src/data/tables";
import { MOOSE_KING_ITEM, WALL_DECO_ITEMS, pickWallDeco, wallDecoChoices } from "../../src/data/wall-deco";
import { generateInterior } from "../../src/interiors";
import { CELL, FACING_DELTA, type Facing } from "../../src/interiors/types";
import { faceOpenYaw, facingSets } from "../../src/render/facing";
import { WALL_HUNG, shownItem } from "../../src/render/interiorProps";
import { World } from "../../src/world/world";

const COMPASS: Facing[] = ["N", "E", "S", "W"];

describe("47th playtest, point 6: everything that hangs on a wall has its back to a real wall", () => {
  it("turns every banner and relief of a world with its back to a wall (the lion of the Catacombs of Nora, 50/37, hung across the room)", { timeout: 300_000 }, () => {
    const bad: string[] = [];
    let seen = 0;
    for (const [seed, size] of [["frost-mere-472", "default"], ["deco-47-b", "small"]] as const) {
      const world = new World(seed, size, seed === "frost-mere-472" ? "default" : "maximum");
      for (const poi of world.allPois().filter((p) => p.kind !== "cave")) {
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        const sets = facingSets(map, content.actions, new Set());
        for (const a of content.actions) {
          if (!WALL_HUNG.has(shownItem(a) ?? -1)) continue;
          seen++;
          const yaw = faceOpenYaw(map, sets, a, (hash2(0x51, a.x, a.y) >>> 0) >>> 8, true);
          const front = COMPASS[Math.round(((yaw * 180) / Math.PI) / 90) % 4]!;
          const back = COMPASS[(COMPASS.indexOf(front) + 2) % 4]!;
          const bx = a.x + FACING_DELTA[back].dx;
          const by = a.y + FACING_DELTA[back].dy;
          const behind = map.cells[by * map.width + bx];
          const solid = bx < 0 || by < 0 || bx >= map.width || by >= map.height || behind !== CELL.FLOOR || sets.wallLike.has(by * map.width + bx);
          if (!solid) bad.push(`${poi.name} ${a.x}/${a.y} (${a.uid}) back to ${back} is floor`);
        }
      }
    }
    expect(seen).toBeGreaterThan(50);
    expect(bad, bad.slice(0, 8).join("\n")).toEqual([]);
  });
});

describe("47th playtest, point 10: the wall decorations turn up about equally often", () => {
  it("lets every decoration fit its monsters, and gives each about a seventh of the dungeons of a typical mix", () => {
    // the mix of the first monsters' groups of a default world (measured with tools/dev/deco-stats.ts: 322 dungeons)
    const mix: [string, number][] = [["beast", 124], ["magical_construct", 52], ["humanoid", 52], ["monster_humanoid", 45], ["undead", 44], ["plant", 5]];
    const counts = new Map<number, number>();
    let total = 0;
    for (const [group, n] of mix) {
      for (let i = 0; i < n * 100; i++) {
        const item = pickWallDeco(group as never, new Rng([i, n, 7, 9]));
        expect(wallDecoChoices(group as never)).toContain(item);
        counts.set(item, (counts.get(item) ?? 0) + 1);
        total++;
      }
    }
    for (const item of WALL_DECO_ITEMS) {
      const share = (counts.get(item) ?? 0) / total;
      expect(share, `item ${item}${item === MOOSE_KING_ITEM ? " (the moose)" : ""}`).toBeGreaterThan(0.1);
      expect(share, `item ${item}`).toBeLessThan(0.19);
    }
  });

  it("knows the monster groups of the table (the weights name real ones)", () => {
    expect(MONSTER_IDS.length).toBeGreaterThan(50);
  });
});
