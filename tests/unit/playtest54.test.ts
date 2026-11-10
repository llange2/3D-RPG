/** The 54th playtest (10. 11. 2026): range targets, the solution in Identify, the loading steps, spell costs, bank interest. */
import { describe, expect, it } from "vitest";
import { createEncounter, createMonster, weakestInCone, nearestInCone, type GridView } from "../../src/sim/encounter";
import { bankInterest, advanceTime, createDefaultParty, MINUTES_PER_WEEK } from "../../src/sim/party";
import { defaultSettings, parseSettings } from "../../src/game/settings";
import { solutionLines } from "../../src/game/identify";
import { questInterior } from "../helpers/quests";
import { SPELLS } from "../../src/data/tables";
import { spellCost } from "../../src/sim/spells";
import type { ActionInstance } from "../../src/actions/types";

const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };

describe("range attack targets (point 2)", () => {
  it("is closest unless the settings say weakest, and keeps older stored settings working", () => {
    expect(defaultSettings().rangeTarget).toBe("closest");
    expect(parseSettings(JSON.stringify({ music: false })).rangeTarget).toBe("closest");
    expect(parseSettings(JSON.stringify({ rangeTarget: "weakest" })).rangeTarget).toBe("weakest");
    expect(parseSettings(JSON.stringify({ rangeTarget: "strongest" })).rangeTarget).toBe("closest");
  });

  it("picks the monster with the fewest hit points among those in sight, the nearer one on a tie", () => {
    const enc = createEncounter();
    // a party at 5/4 looking north (the facing step is 0/-1)
    const near = createMonster("near", 1, 5, 2);
    const behind = createMonster("behind", 1, 5, 0); // on the line, but hidden by `near`: monsters block each other's view
    const side = createMonster("side", 1, 7, 2); // on the diagonal, in the 45 degree cone and in the clear
    const alsoSide = createMonster("alsoSide", 1, 3, 2); // as weak as `side` and as near: the first in the list order near to far wins
    enc.monsters.push(near, behind, side, alsoSide);
    near.hp = 20;
    behind.hp = 1;
    side.hp = 5;
    alsoSide.hp = 5;
    expect(nearestInCone(open, enc, 5, 4, 0, -1)?.uid).toBe("near");
    const weakest = weakestInCone(open, enc, 5, 4, 0, -1);
    expect(weakest?.hp).toBe(5);
    expect(["side", "alsoSide"]).toContain(weakest?.uid);
  });

  it("never chooses a monster behind a wall", () => {
    const enc = createEncounter();
    const hidden = createMonster("hidden", 1, 5, 0);
    hidden.hp = 1;
    const shown = createMonster("shown", 1, 5, 2);
    shown.hp = 50;
    enc.monsters.push(hidden, shown);
    const walled: GridView = { ...open, opaque: (x, y) => x === 5 && y === 1 };
    expect(weakestInCone(walled, enc, 5, 4, 0, -1)?.uid).toBe("shown");
  });
});

describe("the solution in Identify (point 4)", () => {
  const action = (kind: string, x: number, y: number, params: ActionInstance["params"], uid = `${kind}${x}${y}`): ActionInstance => ({ uid, kind, x, y, params }) as ActionInstance;

  it("names the statues, levers, heads, gongs and answers of every quest", () => {
    const heads = [action("head", 3, 3, { mode: "moan", start: 0, want: 1, lever: "l1" }, "h1"), action("head", 4, 3, { mode: "moan", start: 1, want: 1, lever: "l2" }, "h2")];
    const levers = [action("lever", 9, 9, { target: "h1" }, "l1"), action("lever", 8, 9, { target: "h2" }, "l2")];
    const one = solutionLines("quest_1", [...heads, ...levers, action("rune", 4, 4, { need: "moan" })]).join("\n");
    expect(one).toContain("must stand: 3/3, 4/3");
    expect(one).toContain("levers at 9/9"); // only the statue that starts wrong needs its lever
    expect(one).not.toContain("8/9");
    const two = solutionLines("quest_2", [action("head", 2, 2, { mode: "rotate", order: 2, want: 1 }), action("head", 1, 2, { mode: "rotate", order: 1, want: 3 })]).join("\n");
    expect(two).toContain("no. 1 at 1/2 west; no. 2 at 2/2 east");
    expect(solutionLines("quest_3", [action("gong", 1, 1, {}), action("gong", 5, 5, {})]).join("\n")).toContain("all 2 gongs (1/1, 5/5)");
    const riddle = action("riddle", 7, 7, { answer: "42", opens: "end" });
    expect(solutionLines("quest_4", [riddle, action("lore", 2, 2, { fallen: 40 }), action("lore", 3, 2, { fallen: 2 })]).join("\n")).toContain('answer "42" to the statue at 7/7');
    expect(solutionLines("quest_5", [])).toEqual(["Solution: defeat the end boss"]);
    expect(solutionLines("quest_6", [action("riddle", 7, 7, { answer: "gold", aliases: "golden,coin", opens: "end" })]).join("\n")).toContain("also accepted: golden, coin");
    // a castle's riddle opens the castle; a place without any puzzle says nothing
    expect(solutionLines(undefined, [action("riddle", 1, 1, { answer: "mist", opens: "castle" })]).join("\n")).toContain('answer "mist"');
    expect(solutionLines("quest_6", [])).toEqual([]);
  });

  it("agrees with the real content of generated places", () => {
    const { content } = questInterior("quest_6", "dungeon_1", 2);
    const riddle = content.actions.find((a) => a.kind === "riddle" && a.params.opens === "end");
    expect(riddle).toBeDefined();
    expect(solutionLines("quest_6", content.actions).join("\n")).toContain(String(riddle!.params.answer));
    const gongs = questInterior("quest_3", "dungeon_4", 2).content.actions;
    expect(solutionLines("quest_3", gongs).length).toBe(1);
    const moan = questInterior("quest_1", "dungeon_2", 2).content.actions;
    expect(solutionLines("quest_1", moan).length).toBe(2);
  });
});

describe("spell costs at half the rate (point 6)", () => {
  it("halves the cost per caster level and rounds up, and leaves the other spells alone", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    for (const level of [1, 2, 7, 20]) {
      c.level = level;
      for (const spell of Object.values(SPELLS)) {
        const expected = spell.scales_with_level ? Math.max(1, Math.ceil((spell.mana * level) / 2)) : spell.mana;
        expect(spellCost(spell, c)).toBe(expected);
      }
    }
  });

  it("says the halved rate in the text", () => {
    for (const spell of Object.values(SPELLS)) {
      if (spell.scales_with_level) expect(spell.text).toMatch(/Costs [0-9.]+ mana per caster level \(rounded up\)\./);
      else expect(spell.text).not.toContain("per caster level");
    }
  });
});

describe("bank interest (point 7)", () => {
  it("pays 0.5 percent per week, compounding and rounded down", () => {
    expect(bankInterest(1000, 1)).toBe(5);
    expect(bankInterest(1000, 2)).toBe(10); // 1005 earns 5.025 -> 5
    expect(bankInterest(1_000_000, 1)).toBe(5000);
    expect(bankInterest(100, 1)).toBe(0); // 0.5 rounds down
    expect(bankInterest(0, 10)).toBe(0);
    expect(bankInterest(1000, 0)).toBe(0);
  });

  it("is paid when the week turns, in whatever steps the clock runs", () => {
    const party = createDefaultParty();
    party.bankGold = 10_000;
    party.minutes = MINUTES_PER_WEEK - 5;
    expect(advanceTime(party, 4).interest).toBe(0);
    expect(party.bankGold).toBe(10_000);
    const passed = advanceTime(party, 2);
    expect(passed.interest).toBe(50);
    expect(party.bankGold).toBe(10_050);
    // two weeks at once are two payments
    const before = party.bankGold;
    advanceTime(party, 2 * MINUTES_PER_WEEK);
    expect(party.bankGold).toBe(before + bankInterest(before, 2));
    // gold in the hands earns nothing
    party.gold = 1000;
    advanceTime(party, MINUTES_PER_WEEK);
    expect(party.gold).toBe(1000);
  });
});
