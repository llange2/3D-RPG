import { describe, expect, it } from "vitest";
import { createCharacter } from "../../src/sim/character";
import { verdictFor } from "../../src/sim/compare";
import { ARMS_MASTER, makeItem } from "../../src/sim/items";
import { createDefaultParty } from "../../src/sim/party";
import { startingSpells } from "../../src/sim/roster";
import { isStartingSpell, spellsOfTier } from "../../src/data/spell-loot";
import type { Character } from "../../src/sim/types";

/** bug_fix_71: the comparison arrows of the smithy (point 2) and Pandora's box as a starting spell (point 1). */
const knight = (): Character => createCharacter({ name: "K", classType: "Knight", raceType: "Human", avatar: "character04", attrs: { str: 17, int: 8, per: 12, end: 18, spd: 15, acc: 18, lck: 14 } });
const wizard = (): Character => createCharacter({ name: "W", classType: "Wizard", raceType: "Human", avatar: "character05", attrs: { str: 8, int: 20, per: 12, end: 12, spd: 12, acc: 12, lck: 12 } });
const bare = (c: Character): Character => {
  for (const key of Object.keys(c.inventory)) c.inventory[key] = null;
  return c;
};

describe("bug_fix_71, point 2: the portraits of the smithy", () => {
  it("shows a green arrow for a piece that beats the worn one, a red one for a worse piece, and an empty slot is always better", () => {
    const c = bare(knight());
    const mail = makeItem({ name: "Chain mail", type: "chain_mail", bonus: { arm: 6 } });
    expect(verdictFor(c, mail, [ARMS_MASTER])).toBe("better");
    c.inventory.body_armor = makeItem({ name: "Plate", type: "plate_armor", bonus: { arm: 9 } });
    expect(verdictFor(c, mail, [ARMS_MASTER])).toBe("worse");
    expect(verdictFor(c, makeItem({ name: "Same", type: "chain_mail", bonus: { arm: 9 } }), [ARMS_MASTER])).toBe("same");
  });

  it("marks nothing when some values rise and others fall, and greys the portrait of a hero whose class cannot wear it", () => {
    const c = bare(knight());
    c.inventory.body_armor = makeItem({ name: "Plate", type: "plate_armor", bonus: { arm: 9, end: 3 } });
    // more armor, less endurance: mixed
    expect(verdictFor(c, makeItem({ name: "Mail", type: "chain_mail", bonus: { arm: 12 } }), [ARMS_MASTER])).toBe("mixed");
    // a wizard cannot wear chain mail
    expect(verdictFor(bare(wizard()), makeItem({ name: "Mail", type: "chain_mail", bonus: { arm: 12 } }), [ARMS_MASTER])).toBe("cannot");
  });

  it("compares a ring with the off-hand ring while Ctrl is held", () => {
    const c = bare(knight());
    c.inventory.left_ring = makeItem({ name: "Weak", type: "ring", bonus: { str: 1 } });
    c.inventory.right_ring = makeItem({ name: "Strong", type: "ring", bonus: { str: 9 } });
    const ring = makeItem({ name: "Middle", type: "ring", bonus: { str: 5 } });
    const main = verdictFor(c, ring, [ARMS_MASTER], false);
    const off = verdictFor(c, ring, [ARMS_MASTER], true);
    expect(new Set([main, off])).toEqual(new Set(["better", "worse"]));
  });

  it("judges a weapon by the damage the hero really hits for", () => {
    const c = bare(knight());
    c.inventory.left_hand = makeItem({ name: "Sword", type: "long sword", bonus: { dam_min: 5, dam_max: 10 } });
    // lower minimum, higher maximum, higher average: better
    expect(verdictFor(c, makeItem({ name: "Axe", type: "battle axe", bonus: { dam_min: 2, dam_max: 20 } }), [ARMS_MASTER])).toBe("better");
  });
});

describe("bug_fix_71, point 1: Pandora's box", () => {
  it("is a starting spell of the Arcane and Nature classes in the default party, too, and no scroll of it exists", () => {
    for (const c of createDefaultParty().characters) {
      expect(c.spells.includes(2), c.name).toBe(startingSpells(c.classType).includes(2));
    }
    expect(isStartingSpell(2)).toBe(true);
    expect(spellsOfTier(1)).not.toContain(2);
  });
});
