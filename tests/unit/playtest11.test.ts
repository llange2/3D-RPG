import { describe, expect, it } from "vitest";
import { guildScrolls, buyScroll, sellScroll, spellPrice } from "../../src/sim/economy";
import { SPELLS } from "../../src/data/tables";
import { textureBoost } from "../../src/render/props";
import { deathNote } from "../../src/ui/conditionInfo";
import { equipSlots, createCharacter } from "../../src/sim/character";
import { makeItem } from "../../src/sim/items";
import { addCondition } from "../../src/sim/conditions";
import { createDefaultParty, rest } from "../../src/sim/party";
import { BAG_SLOTS } from "../../src/sim/types";

/**
 * Eleventh playtest, rebuilt: the first version of this file was overwritten by mistake while the twelfth playtest was made
 * (there is no version control to get it back), so these tests cover the same features again from the handover notes.
 */
describe("the guild sells scrolls of all three schools (eleventh playtest, point 6)", () => {
  it("lists the scrolls of a school in the band of the guild's level, cheapest spell first", () => {
    for (const school of ["Arcane", "Clerical", "Nature"] as const) {
      const list = guildScrolls(1, school);
      expect(list.length, school).toBeGreaterThan(0);
      for (const s of list) expect(s.type).toContain(school);
      for (let i = 1; i < list.length; i++) expect(list[i]!.level).toBeGreaterThanOrEqual(list[i - 1]!.level);
    }
    // a higher guild offers spells of a higher level than the lowest one
    const top = (level: number) => Math.max(...guildScrolls(level, "Arcane").map((s) => s.level));
    expect(top(5)).toBeGreaterThan(top(1));
  });

  it("puts a bought scroll into the buyer's backpack, takes the price, and pays half the value back for a sold one", () => {
    const party = createDefaultParty();
    const spell = guildScrolls(1, "Arcane")[0]!;
    const gold = party.gold;
    const price = spellPrice(spell, party);
    const r = buyScroll(party, 2, spell.id);
    expect(r.ok).toBe(true);
    expect(party.gold).toBe(gold - price);
    const slot = BAG_SLOTS.find((s) => party.characters[2]!.inventory[s]?.type === "spell")!;
    expect(party.characters[2]!.inventory[slot]!.spellId).toBe(spell.id);
    expect(sellScroll(party, 2, slot)).toBe(true);
    expect(party.characters[2]!.inventory[slot]).toBeNull();
    expect(party.gold).toBeGreaterThan(gold - price);
    expect(party.gold).toBeLessThan(gold);
    // too poor
    party.gold = 0;
    expect(buyScroll(party, 0, spell.id)).toMatchObject({ ok: false, reason: "gold" });
    expect(SPELLS[spell.id]).toBeTruthy();
  });
});

describe("a two-handed weapon pushes the shield into the backpack (eleventh playtest, point 7)", () => {
  const hero = () => createCharacter({ name: "A", classType: "Knight", raceType: "Human", avatar: "character01", attrs: { str: 12, int: 12, per: 12, end: 12, spd: 12, acc: 12, lck: 12 } });

  it("moves the shield out of the way, and refuses when the backpack has no room for it", () => {
    const c = hero();
    for (const s of BAG_SLOTS) c.inventory[s] = null;
    c.inventory.right_hand = makeItem({ name: "shield", type: "shield" });
    c.inventory.left_hand = makeItem({ name: "sword", type: "long sword" });
    c.inventory.slot1 = makeItem({ name: "axe", type: "great axe" });
    expect(equipSlots(c.inventory, "slot1", "left_hand")).toBe("ok");
    expect(c.inventory.left_hand!.type).toBe("great axe");
    expect(c.inventory.right_hand).toBeNull();
    expect(BAG_SLOTS.some((s) => c.inventory[s]?.type === "shield")).toBe(true);

    // full backpack, sword and shield worn: the axe needs one place more than it frees
    const d = hero();
    for (const s of BAG_SLOTS) d.inventory[s] = makeItem({ name: "junk", type: "ring" });
    d.inventory.right_hand = makeItem({ name: "shield", type: "shield" });
    d.inventory.left_hand = makeItem({ name: "sword", type: "long sword" });
    d.inventory.slot1 = makeItem({ name: "axe", type: "great axe" });
    expect(equipSlots(d.inventory, "slot1", "left_hand")).toBe("bag_full");
    expect(d.inventory.left_hand!.type).toBe("long sword");
  });
});

describe("how the light falls on models (eleventh playtest, point 2)", () => {
  it("brightens a dark texture towards the old game's daylight and leaves effects and bright ones alone", () => {
    expect(textureBoost("ci_91", { mean: 0.26 })).toBeGreaterThan(1.5);
    expect(textureBoost("ci_91", { mean: 0.6 })).toBe(1);
    expect(textureBoost("ci_91", { mean: 0.01 })).toBeLessThanOrEqual(4);
    expect(textureBoost("proj_fire", { mean: 0.1 })).toBe(1.2);
    expect(textureBoost("ci_91")).toBe(1.2);
  });
});

describe("conditions run on timers (eleventh playtest, point 9)", () => {
  it("names the time left to live in hours, and a night's rest does not sober anybody up", () => {
    expect(deathNote(30)).toBe("Dies in <1 hour");
    expect(deathNote(60 * 8 + 5)).toBe("Dies in >8 hours");
    const party = createDefaultParty();
    addCondition(party.characters[0]!, "Drunk", party.minutes);
    addCondition(party.characters[1]!, "Sleeping", party.minutes);
    expect(rest(party, 2).ok).toBe(true);
    expect(party.characters[0]!.conditions).toContain("Drunk");
    expect(party.characters[1]!.conditions).not.toContain("Sleeping");
  });
});
