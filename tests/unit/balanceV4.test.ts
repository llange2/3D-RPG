/**
 * BALANCE v4 (25.10.2026): pins every rule that docs/BALANCE_V4_UMSETZUNG.md lists, in the new mode and (where it is cheap) in the
 * legacy mode, which is the rollback. `tools/balance/verify.ts` compares the same functions with the balance tool on random heroes.
 */
import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, type MonsterDef } from "../../src/data/tables";
import { BALANCE, RULES, setBalanceMode, xpStepV4, type BalanceMode } from "../../src/sim/balance";
import { createCharacter, getBaseValue, xpToNextLevel } from "../../src/sim/character";
import { elementalDamage, meleeDamage, rangedDamage } from "../../src/sim/combat";
import { trainingCost } from "../../src/sim/economy";
import { WOLF_EXECUTE_BELOW } from "../../src/sim/encounter";
import { makeItem } from "../../src/sim/items";
import { createDefaultParty, setMascot } from "../../src/sim/party";
import { castSpell } from "../../src/sim/spells";
import type { Character } from "../../src/sim/types";

const rng = (s: string) => new Rng(seedFromString(s));

/** Runs `fn` in a mode and puts v4 back, whatever happens. */
function inMode<T>(mode: BalanceMode, fn: () => T): T {
  setBalanceMode(mode);
  try {
    return fn();
  } finally {
    setBalanceMode("v4");
  }
}

function knight(level: number, str = 30): Character {
  return createCharacter({ name: "K", classType: "Knight", raceType: "Human", avatar: "character04", level, attrs: { str, int: 8, per: 12, end: 18, spd: 15, acc: 18, lck: 14 } });
}

/** A monster that does not get in the way: no armor, no resistance. */
const plain = (over: Partial<MonsterDef> = {}): MonsterDef => ({ ...Object.values(MONSTERS).find((m) => m.armor === 0)!, armor: 0, res_physical: 0, ...over });

describe("BALANCE v4: the switch", () => {
  it("is v4 by default and the legacy mode is one assignment away", () => {
    expect(BALANCE.mode).toBe("v4");
    expect(inMode("legacy", () => BALANCE.mode)).toBe("legacy");
    expect(BALANCE.mode).toBe("v4");
  });
});

describe("BALANCE v4: health", () => {
  it("adds 10 to (END / 2 + class + race) × level", () => {
    const heroes = createDefaultParty().characters;
    expect(heroes.map((c) => c.health)).toEqual([26, 20, 18, 18]);
    expect(inMode("legacy", () => createDefaultParty().characters.map((c) => c.health))).toEqual([16, 10, 8, 8]);
  });
});

describe("BALANCE v4: melee", () => {
  // Strength 30 and the Knight's class value give this much per level; no weapon counts as 1
  const perLevel = 30 / 10 + getBaseValue("Human", "Knight", "base_melee");

  it("is weapon + (STR × 0.1 + class) / 3 × level, rounded up", () => {
    const c = knight(35);
    const v4 = Math.ceil(1 + (perLevel * 35) / 3);
    expect(meleeDamage(c, null, rng("a"))).toBe(v4);
    expect(v4).toBeLessThan(Math.ceil(perLevel * 35 + 1) / 2); // about a third of the old blow
    expect(meleeDamage(knight(1), null, rng("a"))).toBe(Math.ceil(1 + perLevel / 3));
    expect(inMode("legacy", () => meleeDamage(c, null, rng("a")))).toBe(Math.ceil(perLevel * 35 + 1));
  });

  it("takes the armor off first and then the monster's physical resistance", () => {
    const c = knight(35);
    const before = Math.ceil(1 + (perLevel * 35) / 3); // before armor
    expect(meleeDamage(c, plain({ armor: 20 }), rng("a"))).toBe(before - 20);
    expect(meleeDamage(c, plain({ armor: 20, res_physical: 0.5 }), rng("a"))).toBe(Math.trunc((before - 20) * 0.5));
    expect(meleeDamage(c, plain({ res_physical: 1 }), rng("a"))).toBe(0); // the Terminator: immune to blows
    expect(meleeDamage(c, plain({ armor: 500 }), rng("a"))).toBe(0); // never negative
  });

  it("ignores the resistance in the legacy mode", () => {
    const c = knight(35);
    expect(inMode("legacy", () => meleeDamage(c, plain({ res_physical: 1 }), rng("a")))).toBe(Math.ceil(perLevel * 35 + 1));
  });
});

describe("BALANCE v4: bow", () => {
  const archer = (level: number): Character => {
    const c = createCharacter({ name: "A", classType: "Archer", raceType: "Human", avatar: "character05", level, attrs: { str: 15, int: 20, per: 11, end: 14, spd: 13, acc: 30, lck: 12 } });
    c.inventory.ranged_weapon = makeItem({ name: "Bow", type: "short bow", bonus: { ranged_dam_min: 10, ranged_dam_max: 10 } });
    return c;
  };

  it("hits half as often as before: ACC / (speed × distance) without the factor 0.5", () => {
    const fast = plain({ speed: 40 });
    const count = (c: Character): number => {
      let n = 0;
      for (let i = 0; i < 3000; i++) if (rangedDamage(c, fast, 3, rng(`h${i}`)) > 0) n++;
      return n;
    };
    const v4 = count(archer(10)); // 30 / (40 × 3) = 25 %
    const old = inMode("legacy", () => count(archer(10))); // 50 %
    expect(v4 / 3000).toBeGreaterThan(0.2);
    expect(v4 / 3000).toBeLessThan(0.3);
    expect(old / 3000).toBeGreaterThan(0.45);
    expect(old / 3000).toBeLessThan(0.55);
  });

  it("counts 0.8 of the class value, and half of the monster's armor", () => {
    const c = archer(10);
    const m = plain({ speed: 0, armor: 10 }); // speed 0: always hits
    const cls = getBaseValue("Human", "Archer", "base_ranged");
    expect(rangedDamage(c, plain({ speed: 0 }), 1, rng("c"))).toBe(Math.ceil((30 / 10 + cls * 0.8) * 10 + 10));
    expect(rangedDamage(c, m, 1, rng("c"))).toBe(rangedDamage(c, plain({ speed: 0 }), 1, rng("c")) - 5);
    expect(inMode("legacy", () => rangedDamage(c, plain({ speed: 0 }), 1, rng("c")))).toBe(Math.ceil((30 / 10 + cls) * 10 + 10));
  });
});

describe("BALANCE v4: mascots", () => {
  it("Wolf: kills below 10 percent of the health", () => {
    expect(WOLF_EXECUTE_BELOW).toBe(0.1);
    expect(RULES.v4.wolfBelow).toBe(0.1);
    expect(RULES.legacy.wolfBelow).toBe(0.9);
  });

  it("Fairy: takes 30 off an elemental hit (20 in the legacy mode)", () => {
    const party = createDefaultParty();
    const target = party.characters[0]!;
    setMascot(party, "Crow");
    const plainHit = elementalDamage(party, target, "magic", 100);
    setMascot(party, "Fairy");
    expect(plainHit - elementalDamage(party, target, "magic", 100)).toBe(30);
    expect(inMode("legacy", () => plainHit - elementalDamage(party, target, "magic", 100))).toBe(20);
  });

  it("Orb: attack spells do 20 percent more damage, and no extra spell points", () => {
    const damageWith = (mascot: string): number => {
      const party = createDefaultParty();
      setMascot(party, mascot);
      const caster = party.characters[3]!;
      caster.spells = [3];
      caster.sp = 999;
      const r = castSpell(party, 3, 3, rng("orb"));
      if (r.kind !== "attack") throw new Error(`spell 3 did not attack: ${JSON.stringify(r)}`);
      return r.damage;
    };
    const base = damageWith("Crow");
    expect(base).toBeGreaterThan(0);
    expect(damageWith("Orb")).toBe(Math.trunc(base * 1.2));
    // legacy: no damage bonus (the mana bonus is pinned in playtest13.test.ts)
    expect(inMode("legacy", () => damageWith("Orb"))).toBe(base);
    const orbParty = createDefaultParty();
    const before = orbParty.characters.map((c) => c.mana);
    setMascot(orbParty, "Orb");
    expect(orbParty.characters.map((c) => c.mana)).toEqual(before);
  });
});

describe("BALANCE v4: levels and training", () => {
  it("the old table up to level 10, then 1'024'000 × 1.08^(level − 10) a level, rounded per level", () => {
    const k = knight(1); // class base 1500
    expect(xpToNextLevel(k, 1)).toBe(1_500);
    expect(xpToNextLevel(k, 2)).toBe(1_500 + 3_000);
    let sum = 0;
    for (let l = 1; l <= 30; l++) {
      sum += xpStepV4(1500, l);
      expect(xpToNextLevel(k, l), `level ${l}`).toBe(sum);
    }
    // up to level 10 exactly the old doubling (the class with base 2000 reaches 1'024'000 at level 10)
    expect(xpStepV4(1500, 10)).toBe(1500 * 2 ** 9);
    expect(xpStepV4(2000, 10)).toBe(1_024_000);
    // from level 11 on: 8 % more than the step before it, the same for every class
    expect(xpStepV4(1500, 11)).toBe(Math.round(1_024_000 * 1.08));
    expect(xpStepV4(2000, 11)).toBe(xpStepV4(1000, 11));
    expect(xpStepV4(1500, 12)).toBe(Math.round(1_024_000 * 1.08 ** 2));
    expect(xpStepV4(1500, 60)).toBe(Math.round(1_024_000 * 1.08 ** 50));
    for (let l = 12; l <= 80; l++) expect(xpStepV4(1500, l) / xpStepV4(1500, l - 1)).toBeCloseTo(1.08, 3);
    // the cumulative XP of the old table up to level 10 is unchanged
    expect(xpToNextLevel(k, 10)).toBe(1500 * (2 ** 10 - 1));
    // the XP already earned is taken off
    k.xp = 1_200;
    expect(xpToNextLevel(k, 1)).toBe(300);
    expect(inMode("legacy", () => xpToNextLevel(knight(1), 1))).toBe(1500);
  });

  it("training costs 10 × level² per hero (250 × level in the legacy mode)", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    c.level = 7;
    expect(trainingCost(c, party)).toBe(490);
    c.level = 40;
    expect(trainingCost(c, party)).toBe(16_000);
    expect(inMode("legacy", () => trainingCost(c, party))).toBe(10_000);
  });
});
