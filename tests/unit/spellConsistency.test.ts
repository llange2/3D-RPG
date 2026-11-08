import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, SPELLS, isUndead } from "../../src/data/tables";
import { TURN_UNDEAD_DAMAGE, areaSpell, createEncounter, createMonster, specialSpell, type Encounter, type GridView } from "../../src/sim/encounter";
import { createDefaultParty, canSail, canSwim } from "../../src/sim/party";
import { walkOnLava } from "../../src/sim/lava";
import { castSpell, isAreaSpell, isAttackSpell, needsTarget } from "../../src/sim/spells";
import type { Party } from "../../src/sim/types";

/** The spell consistency check of 8. 11. 2026: the text of each spell and what it does agree (the user's decisions per spell). */

const rng = (s: string) => new Rng(seedFromString(s));
const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };

function party(): Party {
  const p = createDefaultParty();
  const druid = p.characters[3]!;
  druid.spells = Array.from({ length: 78 }, (_, i) => i + 1);
  druid.mana = druid.sp = 500;
  druid.level = 4;
  return p;
}

function fight(monsters: [number, number, number][]): Encounter {
  const enc = createEncounter();
  monsters.forEach(([id, x, y], i) => enc.monsters.push(createMonster(`m${i}`, id, x, y)));
  return enc;
}

const ids = (pred: (m: (typeof MONSTERS)[number]) => boolean) => Object.values(MONSTERS).filter(pred).map((m) => m.id);

describe("Awaken (1)", () => {
  it("wakes every sleeping hero at once and asks for nobody", () => {
    const p = party();
    expect(needsTarget(1)).toBe(false);
    p.characters[0]!.conditions = ["Sleeping"];
    p.characters[2]!.conditions = ["Sleeping"];
    const sp = p.characters[3]!.sp;
    const result = castSpell(p, 3, 1, rng("a"));
    expect(result).toEqual({ kind: "awaken", awakened: [0, 2] });
    expect(p.characters[0]!.conditions).toEqual(["Healthy"]);
    expect(p.characters[2]!.conditions).toEqual(["Healthy"]);
    expect(p.characters[3]!.sp).toBe(sp - SPELLS[1]!.mana);
  });
});

describe("Dragon Breath (50)", () => {
  it("hits every monster in the action radius with one element, whether it stands on a line or not", () => {
    expect(isAreaSpell(50)).toBe(true);
    expect(isAttackSpell(50)).toBe(false);
    const living = ids((m) => !isUndead(m.id) && m.treasure_level === 1 && m.terrain === "land")[0]!;
    const p = party();
    for (const c of p.characters) c.hp = c.health = 99999;
    const result = castSpell(p, 3, 50, rng("db"));
    expect(result).toMatchObject({ kind: "attack", special: "dragon_breath", penetrate: false });
    if (result.kind !== "attack") return;
    expect(["acid", "ice", "fire", "magic"]).toContain(result.type);
    // 5 damage per caster level (the druid is level 4)
    expect(result.damage).toBe(20);
    const enc = fight([[living, 1, 0], [living, -2, 3], [living, 0, -5]]);
    const events = areaSpell(p, open, enc, 0, 0, rng("db"), "dragon_breath", { damage: result.damage, type: result.type });
    const hit = events.filter((e) => e.type === "party_attack").map((e) => (e as { uid: string }).uid);
    expect(hit.sort()).toEqual(["m0", "m1", "m2"]);
  });
});

describe("Turn Undead (19)", () => {
  const skeleton = 64;
  const bigUndead = ids((m) => isUndead(m.id) && m.health > 600)[0]!;
  const living = ids((m) => !isUndead(m.id) && m.treasure_level === 1 && m.terrain === "land")[0]!;
  const cast = (enc: Encounter, damage: number) => {
    const p = party();
    for (const c of p.characters) c.hp = c.health = 99999;
    return specialSpell(p, open, enc, 0, 0, rng("tu"), "turn_undead", "m0", { damage, type: "fire" });
  };

  it("is one special single-target attack, not a line", () => {
    const result = castSpell(party(), 3, 19, rng("a"));
    expect(result).toMatchObject({ kind: "attack", special: "turn_undead", penetrate: false, type: "fire" });
    expect(isAttackSpell(19)).toBe(true);
  });

  it("takes 100 hit points from one undead monster, whatever it resists, and spares the monsters behind it", () => {
    const enc = fight([[bigUndead, 1, 0], [bigUndead, 2, 0]]);
    // the damage is read from the event: the monsters answer afterwards and a regenerating one may have healed again
    const hits = cast(enc, 100).filter((e) => e.type === "party_attack") as { uid: string; damage: number }[];
    expect(hits).toEqual([expect.objectContaining({ uid: "m0", damage: TURN_UNDEAD_DAMAGE })]);
    // a cast that was cut down (a defensive stance) still deals the 100
    const cut = fight([[bigUndead, 1, 0]]);
    expect((cast(cut, 40).find((e) => e.type === "party_attack") as { damage: number }).damage).toBe(TURN_UNDEAD_DAMAGE);
  });

  it("destroys an undead monster with 100 hit points or fewer, also when the cast was cut down", () => {
    const weak = ids((m) => isUndead(m.id) && m.health <= TURN_UNDEAD_DAMAGE)[0];
    if (weak === undefined) return; // the table has no such undead monster
    const enc = fight([[weak, 1, 0]]);
    cast(enc, 40);
    expect(enc.monsters.find((m) => m.uid === "m0")).toBeUndefined();
  });

  it("does nothing to a living monster", () => {
    const enc = fight([[living, 1, 0]]);
    cast(enc, 100);
    expect(enc.monsters[0]!.hp).toBe(MONSTERS[living]!.health);
    expect(MONSTERS[skeleton]!.id).toBe(skeleton);
  });
});

describe("Resurrect (70) and Raise Dead (65)", () => {
  it("both leave the hero with one hit point", () => {
    const p = party();
    const hero = p.characters[0]!;
    hero.conditions = ["Rotten"];
    expect(castSpell(p, 3, 70, rng("r"), { target: 0 })).toMatchObject({ kind: "revive" });
    expect(hero.hp).toBe(1);
    hero.conditions = ["Dead"];
    expect(castSpell(p, 3, 65, rng("r"), { target: 0 })).toMatchObject({ kind: "revive" });
    expect(hero.hp).toBe(1);
  });
});

describe("Levitate (21)", () => {
  it("only keeps the party out of pits: it crosses no water and no lava", () => {
    const p = createDefaultParty();
    p.effects.push({ kind: "levitate", until: p.minutes + 240 });
    expect(canSwim(p)).toBe(false);
    expect(canSail(p)).toBe(false);
    expect(walkOnLava(p, rng("lava")).hits.length).toBeGreaterThan(0);
    // Walk on Water still does what it says
    const walker = createDefaultParty();
    walker.effects.push({ kind: "walk_on_water", until: walker.minutes + 240 });
    expect(canSwim(walker) && canSail(walker)).toBe(true);
  });
});

describe("the texts of the sheet", () => {
  it("say what the spells do", () => {
    expect(SPELLS[14]!.text).toContain("acid damage");
    expect(SPELLS[19]!.text).toBe("Does 100 damage to one undead monster. Nothing reduces it.");
    expect(SPELLS[38]!.text).toContain("in a line");
    expect(SPELLS[39]!.text).toContain("in a line");
    expect(SPELLS[60]!.text).toContain("in a line");
    expect(SPELLS[45]!.text).toContain("Works only outside");
    expect(SPELLS[62]!.text).toContain("a door or wall");
    expect(SPELLS[70]!.text).toContain("with 1 hit point");
    expect(SPELLS[73]!.text).toContain("90-110");
  });

  it("have no broken characters and no typos that were found", () => {
    for (const s of Object.values(SPELLS)) {
      expect(s.text, `spell ${s.id}`).not.toMatch(/â|€|Paralysed|unabled|\bist\b/);
      expect(s.title, `spell ${s.id}`).not.toMatch(/â|€/);
    }
    expect(SPELLS[24]!.title).toBe("Wizard's Eye");
  });
});
