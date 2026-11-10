/** The 53rd playtest (bug_fix_50, 10. 11. 2026): spells, targets, costs, texts and the numbers of one monster. */
import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, SPELLS } from "../../src/data/tables";
import { addCondition, gainAttribute, recalcValues } from "../../src/sim/character";
import { castSpell, spellCost, validTarget } from "../../src/sim/spells";
import { carriedItems, createDefaultParty, normalizeParty } from "../../src/sim/party";
import { buyBackItem, sellItem, sellPrice } from "../../src/sim/economy";
import { averageDamageLines, averageHit, meleeDamage, rangedDamage } from "../../src/sim/combat";
import { makeItem } from "../../src/sim/items";
import { EQUIPMENT_SLOTS } from "../../src/sim/types";

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

describe("health follows the attributes a hero gains (point 27)", () => {
  it("gives a Wizard of level 10 the health of Endurance 25", () => {
    const party = createDefaultParty();
    const wizard = party.characters[0]!;
    wizard.classType = "Wizard";
    wizard.level = 10;
    wizard.end = 15;
    recalcValues(wizard, party.talents, true, party.mascot);
    const before = wizard.health;
    gainAttribute(wizard, "end", 10, party.talents, party.mascot);
    // END / 2 per level: five more points of health on each of the ten levels
    expect(wizard.health).toBe(before + 50);
    expect(wizard.hp).toBe(wizard.health);
  });

  it("repairs a save in which the attribute was raised but the health was not", () => {
    const party = createDefaultParty();
    const wizard = party.characters[0]!;
    wizard.classType = "Wizard";
    wizard.level = 10;
    wizard.end = 15;
    recalcValues(wizard, party.talents, true, party.mascot);
    const old = wizard.health;
    wizard.end = 25; // what the chalice did before the fix
    normalizeParty(party);
    expect(wizard.health).toBe(old + 50);
    expect(wizard.hp).toBe(old + 50);
    const again = wizard.health;
    normalizeParty(party);
    expect(wizard.health).toBe(again); // a second run changes nothing
  });
});

describe("the smith lets the party buy back what it sold (point 7)", () => {
  it("returns the item for the gold the smith paid, and refuses without gold or room", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    const item = makeItem({ name: "Old Sword", type: "sword", value: 400, bonus: { dam_min: 2, dam_max: 5 } });
    c.inventory.slot1 = item;
    const gold = party.gold;
    const price = sellPrice(item, party);
    expect(sellItem(party, 0, "slot1")).toBe(true);
    expect(c.inventory.slot1).toBeNull();
    expect(party.gold).toBe(gold + price);
    party.gold = price - 1;
    expect(buyBackItem(party, { item, price })).toEqual({ ok: false, reason: "gold" });
    party.gold = gold + price;
    expect(buyBackItem(party, { item, price })).toEqual({ ok: true });
    expect(party.gold).toBe(gold); // exactly what the sale brought is paid again
    expect(carriedItems(party).some((i) => i.name === "Old Sword")).toBe(true);
  });
});

describe("average damage per hit in the item tooltips (point 18)", () => {
  const hero = () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    c.level = 6;
    for (const slot of EQUIPMENT_SLOTS) c.inventory[slot] = null; // the starter kit would add its own damage
    c.inventory.right_hand = makeItem({ name: "Sword", type: "sword", bonus: { dam_min: 4, dam_max: 8 } });
    return c;
  };

  it("equals the mean of many blows", () => {
    const c = hero();
    const rng = new Rng(seedFromString("average"));
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) sum += meleeDamage(c, null, rng);
    expect(averageHit(c, "melee", 4, 8)).toBeCloseTo(sum / n, 0);
  });

  it("equals the mean of many shots", () => {
    const c = hero();
    c.inventory.ranged_weapon = makeItem({ name: "Bow", type: "bow", bonus: { ranged_dam_min: 3, ranged_dam_max: 9 } });
    const rng = new Rng(seedFromString("average-ranged"));
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) sum += rangedDamage(c, null, 3, rng);
    expect(averageHit(c, "ranged", 3, 9)).toBeCloseTo(sum / n, 0);
  });

  it("writes the line for a weapon and a damage ring, from the hero's values, and for nothing else", () => {
    const c = hero();
    const spear = makeItem({ name: "Spear", type: "spear", bonus: { dam_min: 10, dam_max: 14 } });
    const lines = averageDamageLines(c, spear, c.inventory.right_hand ?? null, false);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.label).toBe("Average damage per hit");
    // the weapon replaces the sword: its 12 on average plus the level term of the hero
    expect(lines[0]!.value).toBeCloseTo(averageHit(c, "melee", 10, 14), 1);
    expect(averageDamageLines(c, c.inventory.right_hand!, null, true)[0]!.value).toBeCloseTo(averageHit(c, "melee", 4, 8), 1);
    const ring = makeItem({ name: "Ring", type: "ring", bonus: { dam_min: 2, dam_max: 4 } });
    expect(averageDamageLines(c, ring, null, false)[0]!.value).toBeCloseTo(averageHit(c, "melee", 6, 12), 1);
    const helmet = makeItem({ name: "Helmet", type: "helmet", bonus: { arm: 3 } });
    expect(averageDamageLines(c, helmet, null, false)).toEqual([]);
  });

  it("shows a ring for blows and for shots when the hero has a bow", () => {
    const c = hero();
    c.inventory.ranged_weapon = makeItem({ name: "Bow", type: "bow", bonus: { ranged_dam_min: 3, ranged_dam_max: 9 } });
    const ring = makeItem({ name: "Ring", type: "ring", bonus: { dam_min: 2, dam_max: 4 } });
    const lines = averageDamageLines(c, ring, null, false);
    expect(lines.map((l) => l.label)).toEqual(["Average damage per hit (melee)", "Average damage per hit (ranged)"]);
    expect(lines[1]!.value).toBeCloseTo(averageHit(c, "ranged", 5, 13), 1);
  });
});
