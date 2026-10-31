import { describe, expect, it } from "vitest";
import { blocksCell } from "../../src/actions";
import type { LayoutId, QuestId } from "../../src/data/quest-table";
import { QUESTS } from "../../src/data/quest-table";
import { lastCastOf, noteCast, quickCastOf } from "../../src/sim/spells";
import { createDefaultParty } from "../../src/sim/party";
import { questInterior } from "../helpers/quests";

describe("36th playtest, point 4 (again): the party is never set down inside an object", () => {
  it("keeps every landing cell of runes, wrong answers and portals free of blocking objects", () => {
    let landings = 0;
    for (let i = 0; i < 80; i++) {
      const layout = (["dungeon_1", "dungeon_2", "dungeon_3", "dungeon_4"] as const)[i % 4] as LayoutId;
      const quest = (QUESTS.quest_2.layouts.includes(layout) ? "quest_2" : "quest_4") as QuestId;
      const { content, map } = questInterior(quest, layout, 1 + (i % 5), i);
      for (const j of content.actions.filter((a) => (a.kind === "teleporter" || a.kind === "riddle" || a.kind === "qportal") && a.params.tx !== undefined && (a.params.tx !== 0 || a.params.ty !== 0))) {
        landings++;
        const inside = content.actions.filter((o) => o !== j && o.x === j.params.tx && o.y === j.params.ty && blocksCell(o));
        expect(inside.map((o) => o.uid), `${map.key} ${j.uid}`).toEqual([]);
      }
    }
    expect(landings).toBeGreaterThan(0);
  });
});

describe("36th playtest, point 5 (again): the last spell is a hero's own", () => {
  it("remembers a spell for the hero who cast it and for nobody else", () => {
    const party = createDefaultParty();
    expect(lastCastOf(party, 2)).toBeNull();
    noteCast(party, 2, { spellId: 4, target: 1 });
    noteCast(party, 3, { spellId: 5 });
    expect(lastCastOf(party, 2)?.spellId).toBe(4);
    expect(lastCastOf(party, 3)?.spellId).toBe(5);
    expect(lastCastOf(party, 0)).toBeNull();
    // the quick-cast entry follows the hero it is asked for
    expect(quickCastOf(party, 2, true)?.spellId).toBe(4);
    expect(quickCastOf(party, 0, true)).toBeNull();
    // a save from before the per-hero spells has only the party's last, which belongs to its caster
    const old = createDefaultParty();
    old.lastCast = { caster: old.characters[1]!.name, spellId: 6 };
    expect(lastCastOf(old, 1)?.spellId).toBe(6);
    expect(lastCastOf(old, 2)).toBeNull();
  });
});
