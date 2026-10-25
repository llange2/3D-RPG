import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, type MonsterDef } from "../../src/data/tables";
import { setBalanceMode } from "../../src/sim/balance";
import { createCharacter } from "../../src/sim/character";
import { applyHit, elementalDamage, meleeDamage, monsterDamage, rangedDamage, specialCondition } from "../../src/sim/combat";
import { makeItem } from "../../src/sim/items";
import { createDefaultParty } from "../../src/sim/party";
import type { Character } from "../../src/sim/types";

const rng = (s: string) => new Rng(seedFromString(s));
const monsters = Object.values(MONSTERS);

/** A weak caster: Strength 7 and a negative class value make the bare blow negative from about level 3. */
function wizard(level: number): Character {
  return createCharacter({ name: "W", classType: "Wizard", raceType: "Human", avatar: "character05", level, attrs: { str: 7, int: 20, per: 12, end: 10, spd: 12, acc: 8, lck: 12 } });
}

describe("fixes of docs/KAMPF_BALANCE.md section 3.5", () => {
  it("1. a blow never turns negative, so it cannot heal a monster (with or without armor)", () => {
    const noArmor = monsters.find((m) => m.armor === 0)!;
    const armored = monsters.find((m) => m.armor > 0)!;
    const c = wizard(30);
    c.inventory.ranged_weapon = makeItem({ name: "Bow", type: "short bow", bonus: { ranged_dam_min: 1, ranged_dam_max: 1 } });
    for (const level of [3, 10, 30]) {
      c.level = level;
      for (const m of [noArmor, armored, null]) {
        expect(meleeDamage(c, m, rng(`m${level}`))).toBeGreaterThanOrEqual(0);
        for (let i = 0; i < 50; i++) expect(rangedDamage(c, m, 1, rng(`r${level}${i}`))).toBeGreaterThanOrEqual(0);
      }
    }
    // Strength 7 and class -2 give -1.3 per level: the old code returned -25 here
    c.level = 20;
    expect(meleeDamage(c, noArmor, rng("w"))).toBe(0);
  });

  it("2. a missed shot of a monster does no damage, physical ones included", () => {
    const party = createDefaultParty();
    const hero = createCharacter({ name: "T", classType: "Knight", raceType: "Human", avatar: "character05", attrs: { str: 10, int: 10, per: 10, end: 10, spd: 20, acc: 10, lck: 10 } });
    hero.inventory.body_armor = makeItem({ name: "Mail", type: "chain_mail", bonus: { arm: 10 } });
    const shooter: MonsterDef = { ...monsters.find((m) => m.attack_type === "Physical")!, speed: 5, damage_min: 40, damage_max: 40 };
    const results = new Set<number>();
    for (let i = 0; i < 400; i++) results.add(monsterDamage(party, shooter, hero, true, 6, rng(`s${i}`)));
    // a hit costs armor 10 and half of it (5): 25; a miss nothing (the old code let 40 through)
    expect([...results].sort((a, b) => a - b)).toEqual([0, 25]);
  });

  it("3. equipment counts in the fight: Strength, Accuracy, Luck and the resistances", () => {
    const m = monsters.find((x) => x.armor === 0)!;
    const base = wizard(10);
    base.str = 20;
    const strong = wizard(10);
    strong.str = 20;
    strong.inventory.left_ring = makeItem({ name: "Ring", type: "ring", bonus: { str: 20 } });
    // +20 Strength = +2 per level (BALANCE v4: a third of it, 2 × 10 / 3 = 6.7 rounds to 6 or 7 depending on where the sum falls)
    const gain = meleeDamage(strong, m, rng("a")) - meleeDamage(base, m, rng("a"));
    expect(gain).toBeGreaterThanOrEqual(6);
    expect(gain).toBeLessThanOrEqual(7);
    setBalanceMode("legacy");
    try {
      expect(meleeDamage(strong, m, rng("a")) - meleeDamage(base, m, rng("a"))).toBe(20);
    } finally {
      setBalanceMode("v4");
    }

    const party = createDefaultParty();
    const target = party.characters[0]!;
    const before = elementalDamage(party, target, "fire", 100);
    target.inventory.left_ring = makeItem({ name: "Ring", type: "ring", bonus: { res_fire: 10 } });
    expect(elementalDamage(party, target, "fire", 100)).toBe(before - 10);

    // an accuracy ring raises the chance to hit
    const archer = wizard(5);
    archer.inventory.ranged_weapon = makeItem({ name: "Bow", type: "short bow", bonus: { ranged_dam_min: 5, ranged_dam_max: 5 } });
    const fast = monsters.find((x) => x.speed >= 30)!;
    const hits = (c: Character) => {
      let n = 0;
      for (let i = 0; i < 2000; i++) if (rangedDamage(c, fast, 3, rng(`h${i}`)) > 0) n++;
      return n;
    };
    const withoutRing = hits(archer);
    archer.inventory.left_ring = makeItem({ name: "Ring", type: "ring", bonus: { acc: 30 } });
    expect(hits(archer)).toBeGreaterThan(withoutRing);
  });

  it("3. rings with damage add to the shot as well, not only to the blow", () => {
    const m = monsters.find((x) => x.armor === 0)!;
    const c = wizard(5);
    c.acc = 100;
    c.inventory.ranged_weapon = makeItem({ name: "Bow", type: "short bow", bonus: { ranged_dam_min: 5, ranged_dam_max: 5 } });
    const bare = rangedDamage(c, m, 0, rng("d"));
    c.inventory.left_ring = makeItem({ name: "Ring", type: "ring", bonus: { dam_min: 4, dam_max: 4 } });
    expect(rangedDamage(c, m, 0, rng("d"))).toBe(bare + 4);
  });

  it("4. Dead and Eradication are half as likely as the other special attacks", () => {
    const dead = monsters.find((x) => specialCondition(x) === "Dead")!;
    const poison = monsters.find((x) => specialCondition(x) === "Poisoned")!;
    const rate = (m: MonsterDef): number => {
      const party = createDefaultParty();
      const c = party.characters[0]!;
      c.lck = 20;
      c.inventory.left_ring = null;
      const r = rng(`sp-${m.name}`);
      let n = 0;
      const trials = 6000;
      for (let i = 0; i < trials; i++) {
        c.hp = c.health;
        c.conditions = ["Healthy"];
        if (applyHit(party, 0, 1, m, r).conditions.length > 0) n++;
      }
      return n / trials;
    };
    // luck 20: 10 / (400 * 0.05) = 50 %, half of it for Dead (25 %)
    expect(rate(poison)).toBeGreaterThan(0.45);
    expect(rate(poison)).toBeLessThan(0.55);
    expect(rate(dead)).toBeGreaterThan(0.2);
    expect(rate(dead)).toBeLessThan(0.3);
  });
});
