import { describe, expect, it } from "vitest";
import { validateContent } from "../../src/actions";
import { OWN_MODELS, themeModelKeys } from "../../src/render/interiorProps";
import { STAIRCASE_ITEM } from "../../src/data/quest-table";
import { stairLinks } from "../../src/interiors/stairs";
import { FLOOR_GAP, TOWER_BIG, TOWER_SMALL, inDisk } from "../../src/interiors/tower";
import { analyzeTopology } from "../../src/interiors/topology";
import { CELL } from "../../src/interiors/types";
import { DUNGEON_LAYOUTS, QUESTS } from "../../src/data/quest-table";
import { questInterior } from "../helpers/quests";

const QUESTS_WITH_TOWERS = ["quest_2", "quest_4", "quest_5"] as const;

describe("the tower, layout dungeon_5 (quest document 1.7)", () => {
  it("is a layout of quests 2, 4 and 5 and of no other", () => {
    for (const [id, quest] of Object.entries(QUESTS)) expect(quest.layouts.includes("dungeon_5"), id).toBe(QUESTS_WITH_TOWERS.includes(id as never));
    expect(DUNGEON_LAYOUTS).toContain("dungeon_5");
  });

  it("is small below level 3, big from level 3 and for every tower of quest 2", () => {
    expect(questInterior("quest_5", "dungeon_5", 1, 0).ref.tower!.floors[0]!.size).toBe(TOWER_SMALL);
    expect(questInterior("quest_5", "dungeon_5", 2, 1).ref.tower!.floors[0]!.size).toBe(TOWER_SMALL);
    expect(questInterior("quest_5", "dungeon_5", 3, 2).ref.tower!.floors[0]!.size).toBe(TOWER_BIG);
    expect(questInterior("quest_2", "dungeon_5", 1, 3).ref.tower!.floors[0]!.size).toBe(TOWER_BIG);
  });

  for (const quest of QUESTS_WITH_TOWERS) {
    it(`builds ${quest} towers whose content is valid, with 2 or 3 round floors`, () => {
      for (let variant = 0; variant < 6; variant++) {
        for (const tier of [1, 2, 3, 4, 5]) {
          const { map, content, ref } = questInterior(quest, "dungeon_5", tier, variant);
          const label = `${quest} tier ${tier} variant ${variant}`;
          expect(validateContent(map, content), label).toEqual([]);
          const tower = ref.tower!;
          expect(tower.floors.length, label).toBeGreaterThanOrEqual(2);
          expect(tower.floors.length, label).toBeLessThanOrEqual(3);
          expect(tower.stairs.length, label).toBe(tower.floors.length - 1);
          // the floors are round: no floor cell outside the disk of its floor, but the end room and the treasure chambers, which lie in the rock round it
          const pockets = [ref.endRoom, ...(ref.vaults ?? [])].filter((r): r is NonNullable<typeof r> => !!r);
          const inPocket = (x: number, y: number) => pockets.some((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
          for (const f of tower.floors) {
            for (let y = 0; y < f.size; y++) {
              for (let x = 0; x < f.size; x++) {
                if (inDisk(f.size, x, y) || inPocket(f.x + x, f.y + y)) continue;
                expect(map.cells[(f.y + y) * map.width + f.x + x], `${label}: floor outside the disk at ${f.x + x},${f.y + y}`).not.toBe(CELL.FLOOR);
              }
            }
          }
        }
      }
    });
  }

  it("puts the staircase of a floor and the door on the floor above at the same place, and the floors more than ten cells apart", () => {
    for (let variant = 0; variant < 8; variant++) {
      const { map, ref } = questInterior("quest_5", "dungeon_5", 1 + (variant % 5), variant);
      const tower = ref.tower!;
      tower.stairs.forEach((s, k) => {
        const lo = tower.floors[k]!;
        const hi = tower.floors[k + 1]!;
        // the same cell, relative to the floor, for the staircase and the door, and for the cells in front of them
        expect({ x: s.up.x - lo.x, y: s.up.y - lo.y }).toEqual({ x: s.down.x - hi.x, y: s.down.y - hi.y });
        expect({ x: s.front.x - lo.x, y: s.front.y - lo.y }).toEqual({ x: s.land.x - hi.x, y: s.land.y - hi.y });
        // the stairs stand against the wall and look into the room
        expect(map.cells[s.front.y * map.width + s.front.x]).toBe(CELL.FLOOR);
        expect(map.cells[s.land.y * map.width + s.land.x]).toBe(CELL.FLOOR);
        // no teleport spell hops from one floor to the next: the cells of two floors are at least ten apart (the gap between them is rock)
        expect(hi.x - (lo.x + lo.size)).toBeGreaterThanOrEqual(FLOOR_GAP);
        expect(Math.abs(s.up.x - s.down.x)).toBeGreaterThan(10);
      });
    }
  });

  it("is whole: every floor is reached from the way in over the stairs", () => {
    for (let variant = 0; variant < 8; variant++) {
      const { map, ref } = questInterior("quest_4", "dungeon_5", 1 + (variant % 5), variant);
      const topo = analyzeTopology(map);
      expect(topo.reachableFloor, `variant ${variant}`).toBeGreaterThan(0);
      for (const f of ref.tower!.floors) {
        const reached = [...Array(f.size * f.size).keys()].filter((i) => {
          const x = f.x + (i % f.size);
          const y = f.y + Math.floor(i / f.size);
          return map.cells[y * map.width + x] === CELL.FLOOR && topo.depth[y * map.width + x]! >= 0;
        }).length;
        expect(reached, `variant ${variant}: floor at ${f.x}`).toBeGreaterThan(20);
      }
      // and the stairs are the only way: without their jumps the upper floors would not be reached
      expect(stairLinks(map).size).toBe(ref.tower!.stairs.length * 2);
      // the party arrives in front of the door, which is farther from the way in than the staircase it came by
      for (const s of ref.tower!.stairs) {
        const from = topo.depth[s.up.y * map.width + s.up.x]!;
        const to = topo.depth[s.land.y * map.width + s.land.x]!;
        expect(from).toBeGreaterThanOrEqual(0);
        expect(to).toBe(from + 1);
      }
    }
  });

  it("holds the hall of quest 2 on the top floor, 11 x 7, and makes the way out at the foot of the ground floor", () => {
    for (let variant = 0; variant < 4; variant++) {
      const { map, ref } = questInterior("quest_2", "dungeon_5", 1 + variant, variant);
      const tower = ref.tower!;
      const hall = ref.hall!;
      expect(hall.w).toBe(11);
      expect(hall.h).toBe(7);
      const top = tower.floors[tower.floors.length - 1]!;
      expect(hall.x).toBeGreaterThanOrEqual(top.x);
      expect(hall.x + hall.w).toBeLessThanOrEqual(top.x + top.size);
      const ground = tower.floors[0]!;
      expect(map.exit.x).toBe(ground.x + Math.round((ground.size - 1) / 2));
      expect(map.exit.y).toBeGreaterThan(ground.y + ground.size - 6);
      expect(map.spawn.facing).toBe("N");
    }
  });

  it("lays the stairs as actions that jump to the cell in front of the other end, without a sound", () => {
    const { content, ref } = questInterior("quest_5", "dungeon_5", 3, 1);
    const stairs = content.actions.filter((a) => a.kind === "stairs");
    expect(stairs).toHaveLength(ref.tower!.stairs.length * 2);
    for (const a of stairs) expect(["N", "E", "S", "W"]).toContain(a.params.facing);
    // the view loads the models of the staircase and of the Fort door
    // (the staircase has an item number of its own: 304 to 309 are the wall reliefs of the dungeons)
    expect(OWN_MODELS[STAIRCASE_ITEM]!.model).toBe("obj_wooden_stairs");
    expect(themeModelKeys(content)).toEqual(expect.arrayContaining(["obj_wooden_stairs", "ci_100"]));
    const up = stairs.find((a) => a.params.up === true)!;
    const s = ref.tower!.stairs[0]!;
    expect({ x: up.x, y: up.y }).toEqual(s.up);
    expect({ tx: up.params.tx, ty: up.params.ty }).toEqual({ tx: s.land.x, ty: s.land.y });
  });
});
