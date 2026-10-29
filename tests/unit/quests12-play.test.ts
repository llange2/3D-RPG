import { describe, expect, it } from "vitest";
import { resolveAction, type ActionContext, type ActionOutcome } from "../../src/actions/handlers";
import { endFlag, headFacing, moanSolved, ringBlocked, rotationSolved } from "../../src/actions/quests";
import type { ActionInstance, MapContent } from "../../src/actions/types";
import { World } from "../../src/world/world";
import { createDefaultParty } from "../../src/sim/party";
import { questInterior } from "../helpers/quests";

const rootSeed = new World("quests-play").rootSeed;

/** A party at a place, playing its actions the way the game does: the state a lever or head leaves goes into `opened`, a confirm is answered "yes". */
function play(content: MapContent) {
  const party = createDefaultParty();
  const opened = new Set<string>();
  const use = (a: ActionInstance, answer?: string | null, hero?: number | null): ActionOutcome => {
    const ctx: ActionContext = { party, rootSeed, content, opened, answer, hero, monsterThemes: { beast: 1 }, tier: 2 };
    let out = resolveAction(a, ctx);
    if (out.effects.some((e) => e.type === "pick")) out = resolveAction(a, { ...ctx, hero: hero ?? 0 });
    if (out.effects.some((e) => e.type === "confirm") && answer === undefined) out = resolveAction(a, { ...ctx, answer: "yes" });
    if (out.consumed) opened.add(a.uid);
    for (const k of out.state?.remove ?? []) opened.delete(k);
    for (const k of out.state?.add ?? []) opened.add(k);
    return out;
  };
  return { party, opened, use };
}

const of = (content: MapContent, kind: string) => content.actions.filter((a) => a.kind === kind);
const opensEnd = (out: ActionOutcome) => out.effects.some((e) => e.type === "endroom");

describe("quest 1: the moaning statues", () => {
  it("is solved by setting the right levers, and only then does the middle open the end room", () => {
    const { content } = questInterior("quest_1", "dungeon_4", 2, 3);
    const { opened, use } = play(content);
    const field = of(content, "head").filter((a) => a.params.mode === "moan");
    const middle = of(content, "rune")[0]!;
    expect(moanSolved(content, opened)).toBe(false);
    expect(opensEnd(use(middle))).toBe(false);
    // a player who has found out which lever belongs to which statue pulls those that are wrong
    for (const h of field) {
      const lever = of(content, "lever").find((l) => l.uid === h.params.lever)!;
      if (Number(h.params.start) !== Number(h.params.want)) use(lever);
    }
    expect(moanSolved(content, opened)).toBe(true);
    expect(opensEnd(use(middle))).toBe(true);
    // the statues that stand block their cell, the others do not
    const blocked = new Set(ringBlocked(content, 96, opened));
    for (const h of field) expect(blocked.has(h.y * 96 + h.x), h.uid).toBe(Number(h.params.want) === 1);
  });
});

describe("quest 2: the faces", () => {
  it("is solved by turning the heads the way the chalices say, and the last turn opens the end room", () => {
    const { content } = questInterior("quest_2", "dungeon_4", 3, 1);
    const { party, opened, use } = play(content);
    const heads = of(content, "head").filter((a) => a.params.mode === "rotate").sort((a, b) => Number(a.params.order) - Number(b.params.order));
    const chalices = of(content, "chalice").filter((c) => c.params.bonus === undefined);
    expect(heads.length).toBe(5);
    // a chalice asks who drinks, makes the hero ill and tells number and direction
    const drink = use(chalices[0]!, undefined, 1);
    expect(drink.consumed).toBe(true);
    expect(drink.effects.find((e) => e.type === "text")).toMatchObject({ text: expect.stringMatching(/You hear \d-[NESW] in your mind/) });
    expect(party.characters[1]!.conditions.some((c) => ["Petrified", "Dead", "Paralyzed", "Rotten", "Poisoned", "Diseased", "Crazy", "Cursed"].includes(c))).toBe(true);
    // the heads: turn clockwise to the wanted direction
    let ended = false;
    for (const h of heads) {
      let guard = 0;
      while (headFacing(h, opened) !== Number(h.params.want) && guard++ < 4) {
        const out = use(h);
        if (opensEnd(out)) ended = true;
      }
    }
    expect(rotationSolved(content, opened)).toBe(true);
    expect(ended).toBe(true);
  });
});

describe("quest 3: the gongs", () => {
  it("calls monsters with every gong and shows the runes that lead to the end room after the last one", () => {
    const { content } = questInterior("quest_3", "cave_2", 2, 2);
    const { use } = play(content);
    const gongs = of(content, "gong");
    const rune = of(content, "rune")[0]!;
    expect([4, 5]).toContain(gongs.length);
    expect(opensEnd(use(rune))).toBe(false);
    gongs.forEach((g, i) => {
      const out = use(g);
      expect(out.consumed).toBe(true);
      expect(out.effects.some((e) => e.type === "ambush")).toBe(true);
      if (i < gongs.length - 1) expect(opensEnd(use(rune))).toBe(false);
    });
    expect(opensEnd(use(rune))).toBe(true);
  });
});

describe("quest 4: calculations", () => {
  it("asks for the sum of the plaques and opens the end room for it", () => {
    const { content } = questInterior("quest_4", "dungeon_2", 3, 4);
    const { use } = play(content);
    const sum = of(content, "lore").reduce((s, a) => s + Number(a.params.fallen ?? 0), 0);
    const last = of(content, "riddle")[0]!;
    expect(use(last).effects[0]).toMatchObject({ type: "ask" });
    expect(opensEnd(use(last, String(sum + 1)))).toBe(false);
    expect(opensEnd(use(last, String(sum)))).toBe(true);
  });
});

describe("quest 6: the riddle word", () => {
  it("is spelled by the hints and opens the end room for the word, its alias or a slip of the finger", () => {
    const { content } = questInterior("quest_6", "dungeon_3", 2, 5);
    const { use } = play(content);
    const word = of(content, "lore")
      .filter((a) => typeof a.params.letter === "string")
      .sort((a, b) => Number(a.params.order) - Number(b.params.order))
      .map((a) => String(a.params.letter))
      .join("")
      .toLowerCase();
    const last = of(content, "riddle")[0]!;
    expect(word).toBe(last.params.answer);
    expect(opensEnd(use(last, "nothing"))).toBe(false);
    expect(opensEnd(use(last, `The ${word.toUpperCase()}`))).toBe(true);
  });
});

describe("the end room", () => {
  it("holds the keys, key cards and orbs the plan puts there, in chests that show the quest item", () => {
    const { content, ref } = questInterior("quest_5", "dungeon_4", 5, 6, { gives: ["quest_key_blue", "quest_green_keycard"], orbs: 7 });
    const { party, use } = play(content);
    const end = ref.endRoom!;
    const inEnd = (a: ActionInstance) => a.x >= end.x && a.y >= end.y && a.x < end.x + end.w && a.y < end.y + end.h;
    const chests = of(content, "treasure").filter(inEnd);
    const quest = chests.filter((c) => typeof c.params.quest === "string");
    expect(quest.map((c) => c.params.quest).sort()).toEqual(["quest_green_keycard", "quest_key_blue", "quest_orb"]);
    expect(quest.find((c) => c.params.quest === "quest_orb")!.params.count).toBe(7);
    expect(chests.length).toBeGreaterThanOrEqual(quest.length + 2);
    // take them: the party carries 7 orbs afterwards
    for (const c of quest) expect(use(c).consumed).toBe(true);
    const carried = party.characters.flatMap((c) => Object.values(c.inventory)).filter((i) => i && i.type === "quest_orb");
    expect(carried.length).toBe(7);
    expect(endFlag("x")).toBe("x@end");
  });

  it("pays the rewards of its level: gold, attribute points, treasure, spells and levels", () => {
    const seen = new Set<string>();
    for (let variant = 0; variant < 60 && seen.size < 4; variant++) {
      const tier = 1 + (variant % 4);
      const { content, ref } = questInterior("quest_5", "dungeon_4", tier, variant);
      const { party, use } = play(content);
      const end = ref.endRoom!;
      const inEnd = (a: ActionInstance) => a.x >= end.x && a.y >= end.y && a.x < end.x + end.w && a.y < end.y + end.h;
      for (const c of of(content, "treasure").filter(inEnd)) {
        const gold = party.gold;
        const out = use(c);
        expect(out.consumed).toBe(true);
        if (party.gold > gold) seen.add("gold");
        if (out.effects.some((e) => e.type === "item")) seen.add("items");
      }
      // a level or points of an attribute lie in a chalice: the party chooses who drinks, and only that hero gets the bonus
      for (const c of of(content, "chalice").filter(inEnd)) {
        expect(c.params.item).toBe(86);
        const before = party.characters.map((h) => ({ level: h.level, sum: h.str + h.int + h.per + h.end + h.spd + h.acc + h.lck }));
        const out = use(c, undefined, 2);
        expect(out.consumed).toBe(true);
        party.characters.forEach((h, i) => {
          const changed = h.level > before[i]!.level || h.str + h.int + h.per + h.end + h.spd + h.acc + h.lck > before[i]!.sum;
          expect(changed, `hero ${i} after ${String(c.params.bonus)}`).toBe(i === 2);
        });
        seen.add(c.params.bonus === "level" ? "levels" : "attributes");
      }
    }
    expect([...seen].sort()).toEqual(["attributes", "gold", "items", "levels"]);
  });
});
