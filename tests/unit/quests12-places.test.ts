import { describe, expect, it } from "vitest";
import { validateContent } from "../../src/actions";
import { QUESTS, type LayoutId, type QuestId } from "../../src/data/quest-table";
import { questInterior } from "../helpers/quests";

describe("quest places (quest document 1.2)", () => {
  for (const quest of Object.keys(QUESTS) as QuestId[]) {
    const layouts = QUESTS[quest].layouts.filter((l) => l.startsWith("dungeon") || l.startsWith("cave")) as LayoutId[];
    it(`${quest}: valid content with an end room in every layout and level`, { timeout: 120_000 }, () => {
      for (let i = 0; i < 10; i++) {
        const layout = layouts[i % layouts.length]!;
        const tier = 1 + (i % 5);
        const { map, content, ref } = questInterior(quest, layout, tier, i);
        expect(ref.endRoom, `${quest} ${layout} #${i} has an end room`).toBeDefined();
        expect(validateContent(map, content), `${quest} ${layout} tier ${tier} #${i}`).toEqual([]);
      }
    });
  }
});
