import { describe, expect, it } from "vitest";
import { generateContent } from "../../src/actions";
import { WALL_HUNG_ITEMS } from "../../src/actions/rules";
import { heapGone, TREASURE_HEAP } from "../../src/actions/registry";
import type { ActionInstance, MapContent } from "../../src/actions/types";
import { QUESTS, type LayoutId, type QuestId } from "../../src/data/quest-table";
import { RULE_SETS } from "../../src/data/rules";
import { generateInterior } from "../../src/interiors";
import { MAX_STRAIGHT } from "../../src/interiors/dungeon";
import { longestCorridor } from "../../src/interiors/topology";
import { CRYSTAL_LAMPS, crystalLamps } from "../../src/render/lamps";
import { cellCenterX, cellCenterZ } from "../../src/render/interiorMesher";
import { themedProp, WALL_HUNG } from "../../src/render/interiorProps";
import { World } from "../../src/world/world";
import { questInterior } from "../helpers/quests";

/** 30th playtest: the corridors, the carving of the moose, the crystals' light, the heaps of treasure. */
describe("30th playtest", () => {
  it("no dungeon has a straight corridor of more than eight cells, whatever the layout", { timeout: 120_000 }, () => {
    const layouts: LayoutId[] = ["dungeon_1", "dungeon_2", "dungeon_3", "dungeon_4"];
    for (const layout of layouts) {
      for (const quest of Object.keys(QUESTS) as QuestId[]) {
        if (!QUESTS[quest].layouts.includes(layout)) continue;
        for (let variant = 0; variant < 4; variant++) {
          const { map } = questInterior(quest, layout, 1 + (variant % 5), variant);
          expect(longestCorridor(map), `${quest} ${layout} #${variant}`).toBeLessThanOrEqual(MAX_STRAIGHT);
        }
      }
    }
  });

  it("keeps a classic dungeon whole when it bends a corridor: every floor cell is reached from the entrance", () => {
    for (let variant = 0; variant < 6; variant++) {
      const { map } = questInterior("quest_5", "dungeon_4", 3, variant);
      const w = map.width;
      const seen = new Uint8Array(map.cells.length);
      const queue = [map.spawn.y * w + map.spawn.x];
      seen[queue[0]!] = 1;
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head]!;
        for (const j of [i + 1, i - 1, i + w, i - w]) {
          if (j < 0 || j >= map.cells.length || seen[j] || map.cells[j] !== map.cells[map.spawn.y * w + map.spawn.x]) continue;
          seen[j] = 1;
          queue.push(j);
        }
      }
      // the end room may be a pocket in the rock that only a teleport reaches (`isolated`); everything else is one piece
      const end = map.dungeon?.endRoom;
      let unreached = 0;
      for (let i = 0; i < map.cells.length; i++) {
        if (map.cells[i] !== map.cells[map.spawn.y * w + map.spawn.x] || seen[i]) continue;
        const [x, y] = [i % w, Math.floor(i / w)];
        if (end && x >= end.x && y >= end.y && x < end.x + end.w && y < end.y + end.h) continue;
        unreached++;
      }
      expect(unreached, `#${variant}`).toBe(0);
    }
  });

  it("builds the Catacombs of Varvaa of seed jade-hold-129 without a tube", { timeout: 120_000 }, () => {
    const world = new World("jade-hold-129", "default");
    const place = world.allPois().find((p) => p.name === "Catacombs of Varvaa")!;
    expect(longestCorridor(generateInterior(world, place, 0))).toBeLessThanOrEqual(MAX_STRAIGHT);
  });

  it("hangs the carving of the moose king on the wall like the banners, and leaves the cell before it free", () => {
    expect([...WALL_HUNG].sort()).toEqual([...WALL_HUNG_ITEMS].sort());
    expect(WALL_HUNG.has(125)).toBe(true);
    // not turned by the half circle of the standing glTF objects: its plaque lies a cell's wall distance behind the origin
    const moose = themedProp({ uid: "u#1", kind: "decor", x: 0, y: 0, params: { item: 125 } }, 0, 0, 90, {});
    expect(moose!.rotY).toBeCloseTo((90 * Math.PI) / 180, 6);
  });

  it("makes the heap of treasure disappear once it is emptied, and nothing else", () => {
    const heap = { uid: "m#chest:0", kind: "treasure", x: 1, y: 1, params: { chest: TREASURE_HEAP, gold: 0, items: 0 } } as ActionInstance;
    const chest = { ...heap, uid: "m#chest:1", params: { chest: 1 } } as ActionInstance;
    const barrel = { ...heap, uid: "m#chest:2", params: { chest: 5 } } as ActionInstance;
    const none = new Set<string>();
    const all = new Set([heap.uid, chest.uid, barrel.uid]);
    expect(heapGone(heap, none)).toBe(false);
    expect(heapGone(heap, all)).toBe(true);
    // also a heap that held nothing ("The chest is empty."): opening it is using it up
    expect(heapGone(chest, all)).toBe(false);
    expect(heapGone(barrel, all)).toBe(false);
  });

  it("lights every crystal of a place in its own colour, and nothing else", { timeout: 120_000 }, () => {
    const world = new World("jade-hold-129", "default");
    const place = world.allPois().find((p) => p.name === "Catacombs of Varvaa")!;
    const map = generateInterior(world, place, 0);
    const content = generateContent(map, RULE_SETS[map.kind], { rootSeed: world.rootSeed });
    // a crystal of a riddle, a shrine or the decoration: each one lights its own cell
    const crystals = content.actions.filter((a) => (a.params.item === 117 || a.params.item === 67 || a.params.chest === 117) && a.kind !== "trap");
    const lamps = crystalLamps(content);
    for (const a of crystals) expect(lamps.some((l) => l.x === cellCenterX(a.x) && l.z === cellCenterZ(a.y)), a.uid).toBe(true);
    expect(lamps.length).toBeGreaterThanOrEqual(crystals.length);
    for (const l of lamps) {
      expect(l.color).toEqual(CRYSTAL_LAMPS[117]!.color);
      // 1 to 2 cells around (a cell is 3 units), and strong
      expect(l.range).toBeGreaterThanOrEqual(6);
      expect(l.range).toBeLessThanOrEqual(9);
      expect(l.intensity).toBeGreaterThan(2);
    }
    // an action that shows no crystal gives no light
    const bare: MapContent = { mapKey: "m", tier: 1, spawns: [], actions: [{ uid: "m#d:0", kind: "decor", x: 1, y: 1, params: { item: 70 } }] };
    expect(crystalLamps(bare)).toEqual([]);
  });
});
