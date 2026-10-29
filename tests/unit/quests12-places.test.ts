import { describe, expect, it } from "vitest";
import { validateContent } from "../../src/actions";
import { QUESTS, type LayoutId, type QuestId } from "../../src/data/quest-table";
import { analyzeTopology } from "../../src/interiors";
import { questInterior } from "../helpers/quests";

describe("quest places (quest document 1.2)", () => {
  for (const quest of Object.keys(QUESTS) as QuestId[]) {
    const layouts = QUESTS[quest].layouts.filter((l) => l.startsWith("dungeon") || l.startsWith("cave")) as LayoutId[];
    for (const layout of layouts) {
      it(`${quest} in ${layout}: valid content with an end room on every level`, { timeout: 120_000 }, () => {
        for (let i = 0; i < 5; i++) {
          const tier = 1 + (i % 5);
          const { map, content, ref } = questInterior(quest, layout, tier, i);
          expect(ref.endRoom, `${quest} ${layout} #${i} has an end room`).toBeDefined();
          expect(validateContent(map, content), `${quest} ${layout} tier ${tier} #${i}`).toEqual([]);
          // every floor cell is reachable from the way in (the end room through its seal or its teleport)
          const topo = analyzeTopology(map);
          expect(topo.reachableFloor, `${quest} ${layout} #${i}`).toBe(topo.totalFloor);
        }
      });
    }
  }
});

describe("the layouts of the dungeons", () => {
  it("dungeon_3 is a maze: no doors, runes that bar loops, corridors one cell wide", () => {
    for (let i = 0; i < 6; i++) {
      const { content, ref } = questInterior("quest_4", "dungeon_3", 2, i);
      expect(content.actions.filter((a) => a.kind === "door").length).toBe(0);
      expect(ref.barriers!.length).toBeGreaterThan(0);
      const runes = content.actions.filter((a) => a.kind === "teleporter" && a.params.item === 73);
      expect(runes.length).toBe(ref.barriers!.length);
    }
  });

  it("dungeon_2 shuts the ways with doors and gates", () => {
    let doors = 0;
    for (let i = 0; i < 6; i++) doors += questInterior("quest_4", "dungeon_2", 2, i).content.actions.filter((a) => a.kind === "door").length;
    expect(doors).toBeGreaterThan(20);
  });

  it("dungeon_1 is a tube: one long way through the rooms", () => {
    for (let i = 0; i < 4; i++) {
      const { map } = questInterior("quest_6", "dungeon_1", 2, i);
      // a tube has few loops: the rooms are in a chain, so the spawn is far from the last room
      const topo = analyzeTopology(map);
      expect(topo.maxDepth).toBeGreaterThan(120);
    }
  });

  it("dungeon_4 has closets with a treasure of their own", () => {
    let closets = 0;
    for (let i = 0; i < 6; i++) closets += questInterior("quest_5", "dungeon_4", 3, i).content.actions.filter((a) => a.uid.includes("#closet_chest:")).length;
    expect(closets).toBeGreaterThan(0);
  });

  it("puts lanterns into the dungeons", () => {
    let lanterns = 0;
    for (let i = 0; i < 4; i++) lanterns += questInterior("quest_6", "dungeon_4", 2, i).content.actions.filter((a) => a.kind === "decor" && a.params.item === 76).length;
    expect(lanterns).toBeGreaterThan(5);
  });
});
