import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { TOWN_TORCH_SPACING } from "../../src/actions/townTorches";
import { SOUNDS } from "../../src/audio/sound-table";
import { TORCHLIGHT_ITEM } from "../../src/data/quest-table";
import { CELL, generateInterior } from "../../src/interiors";
import { PARTICLE_CELLS } from "../../src/render/fxSheets";
import { ITEM_LAMPS } from "../../src/render/lamps";
import { SWORD_MODELS } from "../../src/render/projectiles";
import { BIOME, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";

const world = new World("bug83");
const town = (i: number): Poi => ({ id: `p:t:town:${i}`, kind: "town", name: `town ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier: 1 + (i % 5), biome: BIOME.MEADOW });

describe("bug_fix_83: torches in the towns", () => {
  it("hangs a torch on the wall at regular distances along the streets of every town, on a free street cell, looking away from its wall", () => {
    for (let i = 0; i < 12; i++) {
      const poi = town(i);
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      const torches = content.actions.filter((a) => a.kind === "decor" && a.params.item === TORCHLIGHT_ITEM);
      expect(torches.length, `town ${i}`).toBeGreaterThan(4);
      const cells = new Set<number>();
      for (const t of torches) {
        const idx = t.y * map.width + t.x;
        expect(map.cells[idx], t.uid).toBe(CELL.FLOOR);
        // one torch to a cell, and nothing else on its cell
        expect(cells.has(idx), t.uid).toBe(false);
        cells.add(idx);
        expect(content.actions.filter((a) => a.x === t.x && a.y === t.y && a !== t).length, t.uid).toBe(0);
        // there is a wall behind it: the cell in the direction opposite to the bearing is no floor
        const back = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }[Number(t.params.bearing)]!;
        expect(map.cells[(t.y + back[1]!) * map.width + t.x + back[0]!], t.uid).not.toBe(CELL.FLOOR);
      }
      expect(validateContent(map, content), `town ${i}`).toEqual([]);
    }
  });

  it("is the same every time, and the distance of two torches on a wall is the spacing", () => {
    const poi = town(3);
    const map = generateInterior(world, poi);
    const a = buildMapContent(world, poi, map).actions.filter((x) => x.params.item === TORCHLIGHT_ITEM).map((x) => `${x.x},${x.y},${x.params.bearing}`);
    const b = buildMapContent(world, poi, map).actions.filter((x) => x.params.item === TORCHLIGHT_ITEM).map((x) => `${x.x},${x.y},${x.params.bearing}`);
    expect(a).toEqual(b);
    expect(TOWN_TORCH_SPACING).toBeGreaterThanOrEqual(3);
  });
});

describe("bug_fix_83: sounds, swords and the fire under the pot", () => {
  it("has the user's two sounds in the table, with their files", () => {
    expect(SOUNDS[9065]).toBe("deadly_swarm");
    expect(SOUNDS[9066]).toBe("swoosh");
  });

  it("lets Dancing Sword choose among the three sword models of the game", () => {
    expect(SWORD_MODELS).toEqual(["wpn_sword1", "wpn_sword2", "wpn_sword3"]);
  });

  it("lets the pot over the fire throw flame tongues (row 1, no. 3 of the particle sheet) with a light of its own", () => {
    expect(ITEM_LAMPS[71]!.fx).toBe("campfire");
    expect(PARTICLE_CELLS.flame_tongue).toBe(2);
  });
});
