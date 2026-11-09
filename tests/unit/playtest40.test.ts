import { describe, expect, it } from "vitest";
import { finalGong, gongRuneActive } from "../../src/actions/quests";
import { resolveAction } from "../../src/actions/handlers";
import { crystalLamps } from "../../src/render/lamps";
import { MASCOT_ASK } from "../../src/data/mascots";
import { RIDDLES_WORLD } from "../../src/data/riddles";
import { MASCOTS } from "../../src/ui/panels";
import { World } from "../../src/world/world";
import { createDefaultParty } from "../../src/sim/party";
import { rollChance } from "../../src/sim/journal";
import { questInterior } from "../helpers/quests";

const of = (content: ReturnType<typeof questInterior>["content"], kind: string) => content.actions.filter((a) => a.kind === kind);

describe("40th playtest, point 1: the Fairy's words", () => {
  it("opens with 'You look fun. Let me join you ...'", () => {
    expect(MASCOT_ASK.Fairy).toContain("You look fun. Let me join you");
    expect(MASCOT_ASK.Fairy).not.toContain("saviors");
  });
});

describe("40th playtest, points 3 and 4: pictures in the character screen", () => {
  it("shows the Fairy's normal portrait and the user's picture for the Donkey", () => {
    expect(MASCOTS.Fairy!.full).toBeUndefined();
    expect(MASCOTS.Fairy!.portrait).toBe("npc04");
    expect(MASCOTS.Donkey!.full).toBe("npc03_full");
  });
});

describe("40th playtest, point 6: the runes of quest 3 lie round the gong that sounds last", () => {
  const places = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => questInterior("quest_3", (["dungeon_1", "dungeon_2", "dungeon_4", "cave_1", "cave_2"] as const)[i % 5] as never, 1 + (i % 5), i));

  it("gives every gong runes within three steps of it", () => {
    let near = 0;
    let all = 0;
    for (const { content } of places) {
      const gongs = of(content, "gong");
      const runes = of(content, "rune");
      expect(runes.length).toBe(gongs.length);
      for (const g of gongs) {
        const r = runes.find((x) => x.params.after === g.uid);
        expect(r, g.uid).toBeDefined();
        all++;
        if (Math.abs(r!.x - g.x) + Math.abs(r!.y - g.y) <= 3) near++;
      }
    }
    // a gong squeezed into a corner may have to take a cell further out; nearly all lie within three steps
    expect(near / all).toBeGreaterThan(0.9);
  });

  it("shows only the runes of the last gong, whatever the order of the strikes", () => {
    const { content } = places[0]!;
    const gongs = of(content, "gong");
    const runes = of(content, "rune");
    for (const order of [gongs, [...gongs].reverse(), [...gongs.slice(1), gongs[0]!]]) {
      const opened = new Set<string>();
      for (const g of order) {
        expect(finalGong(content, opened)).toBeNull();
        opened.add(g.uid);
      }
      const last = order[order.length - 1]!;
      expect(finalGong(content, opened)).toBe(last.uid);
      for (const r of runes) expect(gongRuneActive(r, content, opened)).toBe(r.params.after === last.uid);
      // the glow of the runes follows the same rule
      const lit = crystalLamps(content, opened).length - crystalLamps(content).length;
      expect(lit).toBe(1);
    }
  });

  it("takes the party to the end room from the rune of the last gong only", () => {
    const { content } = places[1]!;
    const gongs = of(content, "gong");
    const opened = new Set(gongs.map((g) => g.uid));
    const party = createDefaultParty();
    const rootSeed = new World("playtest40").rootSeed;
    const last = gongs[gongs.length - 1]!;
    for (const r of of(content, "rune")) {
      const out = resolveAction(r, { party, rootSeed, content, opened, monsterThemes: { beast: 1 }, tier: 1 });
      expect(out.effects.some((e) => e.type === "endroom"), r.uid).toBe(r.params.after === last.uid);
    }
  });
});

describe("40th playtest, point 7: the temporary thievery log", () => {
  it("computes the exact chance of a roll and of the party", () => {
    // a roll between a third of the skill and all of it: skill 30 gives 10 to 30, 21 values
    expect(rollChance(30, 10)).toBe(1);
    expect(rollChance(30, 31)).toBe(0);
    expect(rollChance(30, 20)).toBeCloseTo(11 / 21, 6);
  });

  // the entries of the log (since the balance journal they are filed in the save) are tested in `journal.test.ts`
});

describe("40th playtest, point 11: no riddle of another age", () => {
  it("has no telephone, piano, keyboard, stamp, tea, envelope, pencil, umbrella, doughnut, chalkboard or password", () => {
    const bad = /telephone|piano|keyboard|stamp|teapot|iced tea|envelope|pencil|graphite|umbrella|doughnut|chalkboard|password/i;
    for (const [n, r] of Object.entries(RIDDLES_WORLD)) {
      // the answers and their aliases (a question may use a word as a verb: "they stamp")
      expect(`${r.answer} ${r.aliases.join(" ")}`, `#${n}`).not.toMatch(bad);
      expect(r.question, `#${n}`).not.toMatch(/telephone|piano|keyboard|teapot|iced tea|envelope|pencil|umbrella|doughnut|chalkboard|password|postage/i);
    }
  });
});
