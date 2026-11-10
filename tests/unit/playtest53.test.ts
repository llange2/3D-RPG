/** The 53rd playtest (bug_fix_50, 10. 11. 2026): spells, targets, costs, texts and the numbers of one monster. */
import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, SPELLS } from "../../src/data/tables";
import { addCondition } from "../../src/sim/character";
import { castSpell, spellCost, validTarget } from "../../src/sim/spells";
import { createDefaultParty } from "../../src/sim/party";

const SCALING = [8, 10, 17, 20, 25, 28, 37, 39, 44, 50, 63];

describe("spell costs grow with the level of the caster (point 16)", () => {
  it("flags exactly the spells of column H", () => {
    const flagged = Object.values(SPELLS).filter((s) => s.scales_with_level).map((s) => s.id);
    expect(flagged.sort((a, b) => a - b)).toEqual(SCALING);
  });

  it("multiplies the cost by the level for those and for no other", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    c.level = 7;
    expect(spellCost(SPELLS[8]!, c)).toBe(SPELLS[8]!.mana * 7);
    expect(spellCost(SPELLS[4]!, c)).toBe(SPELLS[4]!.mana);
    expect(spellCost(SPELLS[30]!, c)).toBe(SPELLS[30]!.mana);
  });

  it("pays what the window shows, and refuses a caster who cannot afford it", () => {
    const party = createDefaultParty();
    const i = party.characters.findIndex((c) => c.classType === "Cleric" || c.classType === "Druid" || c.classType === "Wizard");
    const c = party.characters[i]!;
    c.level = 5;
    c.spells.push(28); // Power Cure, 5 mana per caster level
    c.sp = 24;
    const rng = new Rng(seedFromString("cost"));
    expect(castSpell(party, i, 28, rng, { target: 0 })).toEqual({ kind: "fizzle", reason: "mana" });
    expect(c.sp).toBe(24);
    c.sp = 40;
    expect(castSpell(party, i, 28, rng, { target: 0 }).kind).toBe("heal");
    expect(c.sp).toBe(40 - SPELLS[28]!.mana * 5);
  });

  it("says so in the text", () => {
    expect(SPELLS[44]!.text).toContain("per caster level");
    expect(SPELLS[4]!.text).not.toContain("per caster level");
  });
});

describe("no spell on the dead or the rotten except the ones that raise them (point 22)", () => {
  it("knows who can be picked", () => {
    const party = createDefaultParty();
    const live = party.characters[0]!;
    const dead = party.characters[1]!;
    const rotten = party.characters[2]!;
    addCondition(dead, "Dead", party.minutes);
    addCondition(rotten, "Dead", party.minutes);
    addCondition(rotten, "Rotten", party.minutes);
    for (const id of [4, 7, 35, 11, 20, 46, 56]) {
      expect(validTarget(id, live)).toBe(true);
      expect(validTarget(id, dead)).toBe(false);
      expect(validTarget(id, rotten)).toBe(false);
    }
    expect(validTarget(65, dead)).toBe(true);
    expect(validTarget(65, live)).toBe(false);
    expect(validTarget(65, rotten)).toBe(false);
    expect(validTarget(70, rotten)).toBe(true);
    expect(validTarget(70, dead)).toBe(false);
  });

  it("refuses a heal on the dead without taking spell points", () => {
    const party = createDefaultParty();
    const i = party.characters.findIndex((c) => c.classType === "Cleric");
    const healer = party.characters[i >= 0 ? i : 3]!;
    healer.spells.push(4);
    healer.sp = 20;
    const dead = party.characters[0] === healer ? party.characters[1]! : party.characters[0]!;
    addCondition(dead, "Dead", party.minutes);
    const at = party.characters.indexOf(dead);
    const hpBefore = dead.hp;
    const rng = new Rng(seedFromString("dead"));
    expect(castSpell(party, party.characters.indexOf(healer), 4, rng, { target: at })).toEqual({ kind: "fizzle", reason: "no_effect" });
    expect(healer.sp).toBe(20);
    expect(dead.hp).toBe(hpBefore);
  });
});

describe("texts and numbers of the sheets (points 2 and 3)", () => {
  it("calls the damage of Energy Blast, Star Burst and Implosion magical", () => {
    for (const id of [8, 76, 77]) {
      expect(SPELLS[id]!.text).toContain("magical damage");
      expect(SPELLS[id]!.text.toLowerCase()).not.toContain("energy damage");
      expect(SPELLS[id]!.dam_type).toEqual(["magic"]);
    }
  });

  it("gives the Terminator 80 % physical resistance, the value of docs/RPG_0.1.xlsx", () => {
    const terminator = Object.values(MONSTERS).find((m) => m.name === "Terminator");
    expect(terminator).toBeDefined();
    expect(terminator!.res_physical).toBe(0.8);
  });
});
