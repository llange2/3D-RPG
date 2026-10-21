import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { BASE_CLASS, CONSTANTS } from "../../src/data/tables";
import { createDefaultParty, normalizeParty } from "../../src/sim/party";
import { makeItem } from "../../src/sim/items";
import {
  AVATAR_COUNT, CLASSES, MAX_RESERVE, addRecruit, avatarKey, classRequirement, dismissMember, eligibleClasses, isEligible, randomName, raceOfAvatar, rollAttributes, startingSpells, swapMember,
} from "../../src/sim/roster";
import { ATTRIBUTES, type Attribute } from "../../src/sim/types";

const rng = (s: string) => new Rng(seedFromString(s));
const attrs = (v: Partial<Record<Attribute, number>> = {}): Record<Attribute, number> => ({ str: 5, int: 5, per: 5, end: 5, spd: 5, acc: 5, lck: 5, ...v });

describe("character generation", () => {
  it("rolls seven attributes from 5 to 20, the same for the same seed", () => {
    const a = rollAttributes(rng("roll"));
    expect(Object.keys(a).sort()).toEqual([...ATTRIBUTES].sort());
    for (const v of Object.values(a)) {
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(20);
    }
    expect(rollAttributes(rng("roll"))).toEqual(a);
    expect(rollAttributes(rng("other"))).not.toEqual(a);
  });

  it("lists all ten classes, every one with a requirement", () => {
    expect([...CLASSES].sort()).toEqual(Object.keys(BASE_CLASS).sort());
    expect(classRequirement("Paladin")).toEqual({ attributes: ["str", "per", "end"], minimum: 13 });
    expect(classRequirement("Knight")).toEqual({ attributes: ["str"], minimum: 15 });
  });

  it("accepts a class only when every required attribute reaches the minimum", () => {
    expect(isEligible("Knight", attrs({ str: 15 }))).toBe(true);
    expect(isEligible("Knight", attrs({ str: 14 }))).toBe(false);
    // three attributes at 13: one short is not enough
    expect(isEligible("Paladin", attrs({ str: 13, per: 13, end: 13 }))).toBe(true);
    expect(isEligible("Paladin", attrs({ str: 20, per: 20, end: 12 }))).toBe(false);
    expect(eligibleClasses(attrs())).toEqual([]);
    expect(eligibleClasses(attrs({ str: 20, int: 20, per: 20, end: 20, spd: 20, acc: 20, lck: 20 }))).toEqual([...CLASSES]);
  });

  it("every roll over the best attributes still leaves some class open for most rolls", () => {
    // the old game let you roll until a class fits; a roll with nothing open must be rare
    let none = 0;
    for (let i = 0; i < 300; i++) if (eligibleClasses(rollAttributes(rng(`many:${i}`))).length === 0) none++;
    expect(none).toBeLessThan(30);
  });

  it("derives the race from the portrait like the old game", () => {
    expect(AVATAR_COUNT).toBe(22);
    expect(AVATAR_COUNT).toBe(CONSTANTS.MAX_AVATARS);
    const races = Array.from({ length: AVATAR_COUNT }, (_, i) => raceOfAvatar(i + 1));
    expect(races.filter((r) => r === "Human")).toHaveLength(6);
    for (const r of ["Elf", "Gnome", "Dwarf", "Orc"]) expect(races.filter((x) => x === r)).toHaveLength(4);
    expect(avatarKey(4)).toBe("character04");
    expect(avatarKey(17)).toBe("character17");
  });

  it("gives the starting spells of the class's school, like the heroes of the default party", () => {
    const party = createDefaultParty();
    expect(startingSpells("Archer")).toEqual(party.characters[2]!.spells);
    expect(startingSpells("Druid")).toEqual(party.characters[3]!.spells);
    expect(startingSpells("Knight")).toEqual([]);
    expect(startingSpells("Ninja")).toEqual([]);
  });

  it("makes names of at most 16 characters", () => {
    for (let i = 0; i < 100; i++) {
      const n = randomName(rng(`name:${i}`));
      expect(n.length).toBeGreaterThan(2);
      expect(n.length).toBeLessThanOrEqual(16);
    }
  });
});

describe("the inn's reserve", () => {
  it("starts with the two heroes of the old game", () => {
    const p = createDefaultParty();
    expect(p.reserve.map((c) => c.name)).toEqual(["Crack Hack", "Morris"]);
    for (const c of p.reserve) expect(c.inventory.left_hand, `${c.name} weapon`).not.toBeNull();
    expect(p.achievements).toEqual([]);
  });

  it("adds a new hero with the starter kit, the race of the portrait and level 1", () => {
    const p = createDefaultParty();
    const r = addRecruit(p, { name: "  Tharion ", classType: "Wizard", avatar: 9, attrs: attrs({ int: 18 }) });
    expect(r).toEqual({ ok: true });
    const c = p.reserve[p.reserve.length - 1]!;
    expect(c.name).toBe("Tharion");
    expect(c.raceType).toBe("Elf");
    expect(c.avatar).toBe("character09");
    expect(c.level).toBe(1);
    expect(c.spells).toEqual(startingSpells("Wizard"));
    expect(c.mana).toBeGreaterThan(0);
    expect(c.hp).toBe(c.health);
    expect(c.inventory.left_hand).not.toBeNull();
    expect(c.inventory.body_armor).not.toBeNull();
  });

  it("refuses a class that the attributes do not allow, an empty name and a full inn", () => {
    const p = createDefaultParty();
    expect(addRecruit(p, { name: "Weak", classType: "Knight", avatar: 1, attrs: attrs() })).toEqual({ ok: false, reason: "not_eligible" });
    expect(addRecruit(p, { name: "   ", classType: "Knight", avatar: 1, attrs: attrs({ str: 18 }) })).toEqual({ ok: false, reason: "no_name" });
    while (p.reserve.length < MAX_RESERVE) expect(addRecruit(p, { name: `H${p.reserve.length}`, classType: "Knight", avatar: 1, attrs: attrs({ str: 18 }) }).ok).toBe(true);
    expect(addRecruit(p, { name: "One more", classType: "Knight", avatar: 1, attrs: attrs({ str: 18 }) })).toEqual({ ok: false, reason: "reserve_full" });
  });

  it("swaps a member with the next hero and cycles through the reserve", () => {
    const p = createDefaultParty();
    const first = p.characters[0]!.name;
    expect(swapMember(p, 0, "next")).toEqual({ ok: true });
    expect(p.characters[0]!.name).toBe("Crack Hack");
    expect(p.reserve.map((c) => c.name)).toEqual(["Morris", first]);
    expect(swapMember(p, 0, "next").ok).toBe(true);
    expect(p.characters[0]!.name).toBe("Morris");
    expect(swapMember(p, 0, "next").ok).toBe(true);
    expect(p.characters[0]!.name).toBe(first);
    // and back again
    expect(swapMember(p, 0, "previous").ok).toBe(true);
    expect(p.characters[0]!.name).toBe("Morris");
    expect(p.characters).toHaveLength(4);
    expect(new Set(p.characters.concat(p.reserve).map((c) => c.name)).size).toBe(6);
  });

  it("dismisses a member for good; the first hero of the reserve takes the seat", () => {
    const p = createDefaultParty();
    const gone = p.characters[3]!.name;
    expect(dismissMember(p, 3)).toEqual({ ok: true });
    expect(p.characters[3]!.name).toBe("Crack Hack");
    expect(p.reserve.map((c) => c.name)).toEqual(["Morris"]);
    expect([...p.characters, ...p.reserve].some((c) => c.name === gone)).toBe(false);
  });

  it("does nothing without a reserve", () => {
    const p = createDefaultParty();
    p.reserve = [];
    const before = p.characters.map((c) => c.name);
    expect(swapMember(p, 0, "next")).toEqual({ ok: false, reason: "no_reserve" });
    expect(dismissMember(p, 0)).toEqual({ ok: false, reason: "no_reserve" });
    expect(swapMember(p, 9, "next")).toEqual({ ok: false, reason: "bad_slot" });
    expect(p.characters.map((c) => c.name)).toEqual(before);
  });

  it("keeps a hero who carries a quest item in the party", () => {
    const p = createDefaultParty();
    p.characters[1]!.inventory.slot1 = makeItem({ name: "Pearl of Youth", type: "quest", quest: true });
    expect(swapMember(p, 1, "next")).toEqual({ ok: false, reason: "quest_items" });
    expect(dismissMember(p, 1)).toEqual({ ok: false, reason: "quest_items" });
    expect(p.characters[1]!.name).toBe("Elrin");
    expect(p.reserve).toHaveLength(2);
  });

  it("ends the blessing of a member who leaves", () => {
    const p = createDefaultParty();
    p.characters[2]!.conditions = ["Blessed"];
    p.effects.push({ kind: "blessed", until: p.minutes + 60, character: 2 });
    expect(swapMember(p, 2, "next").ok).toBe(true);
    expect(p.effects.filter((e) => e.kind === "blessed")).toEqual([]);
    expect(p.reserve[p.reserve.length - 1]!.conditions).not.toContain("Blessed");
  });

  it("adds the missing lists to a party from an older save", () => {
    const old = createDefaultParty() as unknown as Record<string, unknown>;
    delete old.achievements;
    delete old.reserve;
    const fixed = normalizeParty(old as never);
    expect(fixed.achievements).toEqual([]);
    expect(fixed.reserve).toEqual([]);
  });
});
