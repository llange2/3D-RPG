import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, SPELLS, isUndead, monsterGroup } from "../../src/data/tables";
import { ageOf, armor, attr, canAct, createCharacter, fightSpeed, recalcValues } from "../../src/sim/character";
import { applyHit, meleeDamage } from "../../src/sim/combat";
import {
  cancelRifts, createEncounter, createMonster, immobilize, makeClumsy, monsterTurn, partyAttack, phaseMonsters, pullMonsters, specialSpell, type Encounter, type GridView,
} from "../../src/sim/encounter";
import { canCombine, combine, combineGroups, duplicate, transformRing } from "../../src/sim/itemSpells";
import { generateItem, makeItem, ringLevel } from "../../src/sim/items";
import { MINUTES_PER_DAY, advanceTime, createDefaultParty, hasEffect, surroundings } from "../../src/sim/party";
import { DRAGON_LORD, SPELL_GRID, SPELL_SCHOOL, castSpell, isSpellImplemented, pandoraOutcome } from "../../src/sim/spells";
import { MINUTES_PER_YEAR } from "../../src/sim/character";
import type { Party } from "../../src/sim/types";
import { safeCells } from "../../src/game/spellSites";

const rng = (s: string) => new Rng(seedFromString(s));
const HOUR = 60;

/** The default party; the Druid (index 3) knows every spell and has plenty of spell points. */
function party(): Party {
  const p = createDefaultParty();
  const druid = p.characters[3]!;
  druid.spells = Array.from({ length: 78 }, (_, i) => i + 1);
  druid.mana = druid.sp = 500;
  druid.level = 4;
  return p;
}

/** Open ground all round, no walls. */
const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };

function fight(px: number, py: number, monsters: [number, number, number][]): Encounter {
  const enc = createEncounter();
  monsters.forEach(([id, x, y], i) => enc.monsters.push(createMonster(`m${i}`, id, x, y)));
  return enc;
}

const ids = (pred: (m: (typeof MONSTERS)[number]) => boolean) => Object.values(MONSTERS).filter(pred).map((m) => m.id);

describe("the spell sheet", () => {
  it("gives all 78 spells their name and description, and the new ones their own", () => {
    for (let id = 1; id <= 78; id++) {
      expect(SPELLS[id]!.title.length, `spell ${id}`).toBeGreaterThan(1);
      expect(SPELLS[id]!.text.length, `spell ${id}`).toBeGreaterThan(5);
    }
    expect(SPELLS[2]!.title).toBe("Pandora's box");
    expect(SPELLS[20]!.title).toBe("Stone Skin");
    expect(SPELLS[24]!.title).toBe("Wizard Eye");
  });

  it("implements every spell", () => {
    for (let id = 1; id <= 78; id++) expect(isSpellImplemented(id), `spell ${id}`).toBe(true);
  });

  it("fits the spell window: no school has more spells than the grid has plates", () => {
    const count: Record<string, number> = {};
    for (const s of Object.values(SPELLS)) for (const t of s.type) count[t] = (count[t] ?? 0) + 1;
    const most = Math.max(...Object.values(count));
    expect(most).toBe(36);
    expect(SPELL_GRID.columns * SPELL_GRID.rows).toBeGreaterThanOrEqual(most);
  });

  it("holds the pictures of the spells in one sheet", () => {
    const dir = join(import.meta.dirname, "..", "..", "public", "assets", "ui");
    expect(existsSync(join(dir, "spells.webp"))).toBe(true);
    const sheet = JSON.parse(readFileSync(join(dir, "spells.json"), "utf-8")) as { cellOf: Record<string, number>; cells: number; columns: number; cell: { w: number; h: number } };
    expect(Object.keys(sheet.cellOf)).toHaveLength(78);
    expect(Math.max(...Object.values(sheet.cellOf))).toBeLessThan(sheet.cells);
    // identical pictures (a placeholder) share a cell, so there are never more cells than spells
    expect(sheet.cells).toBeLessThanOrEqual(78);
  });
});

describe("undead", () => {
  it("is the group of the monster sheet, Phantom included", () => {
    expect(ids((m) => isUndead(m.id)).map((id) => MONSTERS[id]!.name).sort()).toEqual(["Ghost", "Lich", "Mummy", "Mummy King", "Phantom", "Reaper", "Skeleton", "Vampire", "Vampire King", "Zombie"]);
    expect(monsterGroup(DRAGON_LORD)).not.toBe("undead");
    expect(MONSTERS[DRAGON_LORD]!.name).toBe("Dragon Lord");
  });
});

describe("age", () => {
  it("is 18 at the start, grows a year every 144000 minutes and carries what magic added", () => {
    const p = party();
    const c = p.characters[0]!;
    expect(ageOf(c, p.minutes).total).toBe(18);
    expect(ageOf(c, p.minutes + MINUTES_PER_YEAR).total).toBe(19);
    c.magicAge = 5;
    expect(ageOf(c, p.minutes)).toEqual({ natural: 18, magic: 5, total: 23 });
  });
});

describe("reviving", () => {
  it("Raise Dead brings back the dead with one hit point and costs nothing else", () => {
    const p = party();
    const dead = p.characters[0]!;
    dead.conditions = ["Dead"];
    dead.hp = -5;
    const end = dead.end;
    expect(castSpell(p, 3, 65, rng("a"), { target: 0 })).toMatchObject({ kind: "revive", target: 0 });
    expect(dead.conditions).toEqual(["Healthy"]);
    expect(dead.hp).toBe(1);
    expect(dead.end).toBe(end);
    // somebody who is alive is not paid for
    const sp = p.characters[3]!.sp;
    expect(castSpell(p, 3, 65, rng("a"), { target: 1 })).toMatchObject({ kind: "fizzle", reason: "no_effect" });
    expect(p.characters[3]!.sp).toBe(sp);
  });

  it("Resurrect brings back the rotten at full health for a point of Endurance, and ages the caster", () => {
    const p = party();
    const rotten = p.characters[0]!;
    rotten.conditions = ["Rotten"];
    rotten.hp = 0;
    const end = rotten.end;
    expect(castSpell(p, 3, 70, rng("a"), { target: 0 })).toMatchObject({ kind: "revive", endurance: true });
    expect(rotten.end).toBe(end - 1);
    expect(rotten.conditions).toEqual(["Healthy"]);
    expect(rotten.hp).toBe(rotten.health);
    expect(p.characters[3]!.magicAge).toBe(5);
  });

  it("nobody with no Endurance left comes back", () => {
    const p = party();
    const hero = p.characters[0]!;
    hero.conditions = ["Dead"];
    hero.end = 0;
    const sp = p.characters[3]!.sp;
    expect(castSpell(p, 3, 65, rng("a"), { target: 0 })).toMatchObject({ kind: "fizzle", reason: "cannot_revive" });
    expect(castSpell(p, 3, 70, rng("a"), { target: 0 })).toMatchObject({ kind: "fizzle", reason: "cannot_revive" });
    expect(p.characters[3]!.sp).toBe(sp);
    expect(hero.conditions).toEqual(["Dead"]);
  });

  it("Divine Intervention cures everybody but the rotten, raises the dead, heals fully and ages the caster", () => {
    const p = party();
    p.characters[0]!.conditions = ["Dead"];
    p.characters[0]!.hp = -3;
    p.characters[1]!.conditions = ["Poisoned", "Cursed"];
    p.characters[1]!.hp = 2;
    p.characters[2]!.conditions = ["Rotten"];
    const result = castSpell(p, 3, 78, rng("a"));
    expect(result).toMatchObject({ kind: "intervention", revived: [0] });
    expect(p.characters[0]!.hp).toBe(p.characters[0]!.health);
    expect(p.characters[1]!.conditions).toEqual(["Healthy"]);
    expect(p.characters[1]!.hp).toBe(p.characters[1]!.health);
    expect(p.characters[2]!.conditions).toEqual(["Rotten"]);
    expect(p.characters[3]!.magicAge).toBe(5);
  });
});

describe("Half For Me, Emergency rations, Communion", () => {
  it("Half For Me takes half of what it heals from the caster, who keeps one hit point", () => {
    const p = party();
    const caster = p.characters[3]!;
    const target = p.characters[0]!;
    target.hp = target.health - 30;
    caster.hp = 11;
    expect(castSpell(p, 3, 56, rng("a"), { target: 0 })).toMatchObject({ kind: "heal", amount: 20, paid: 10 });
    expect(caster.hp).toBe(1);
    expect(target.hp).toBe(target.health - 10);
    // nothing left to give
    expect(castSpell(p, 3, 56, rng("a"), { target: 0 })).toMatchObject({ kind: "fizzle", reason: "no_hp" });
    // not on oneself, and not on somebody who is whole
    expect(castSpell(p, 3, 56, rng("a"), { target: 3 })).toMatchObject({ kind: "fizzle", reason: "needs_target" });
    caster.hp = caster.health;
    target.hp = target.health;
    expect(castSpell(p, 3, 56, rng("a"), { target: 0 })).toMatchObject({ kind: "fizzle", reason: "no_effect" });
  });

  it("Emergency rations makes one ration, never more", () => {
    const p = party();
    p.food = 0;
    expect(castSpell(p, 3, 57, rng("a"))).toEqual({ kind: "food" });
    expect(p.food).toBe(1);
    const sp = p.characters[3]!.sp;
    expect(castSpell(p, 3, 57, rng("a"))).toMatchObject({ kind: "fizzle", reason: "no_effect" });
    expect(p.characters[3]!.sp).toBe(sp);
  });

  it("Communion lifts a curse about half of the time", () => {
    let lifted = 0;
    for (let i = 0; i < 200; i++) {
      const p = party();
      p.characters[0]!.conditions = ["Cursed"];
      castSpell(p, 3, 46, rng(`c${i}`), { target: 0 });
      if (!p.characters[0]!.conditions.includes("Cursed")) lifted++;
    }
    expect(lifted).toBeGreaterThan(70);
    expect(lifted).toBeLessThan(130);
  });
});

describe("Stone Skin, Rage and Power Shield", () => {
  it("Stone Skin adds the caster's level to the armor and halves the speed for twelve hours", () => {
    const p = party();
    const hero = p.characters[0]!;
    const armorBefore = armor(hero);
    const speedBefore = fightSpeed(hero);
    expect(castSpell(p, 3, 20, rng("a"), { target: 0 })).toMatchObject({ kind: "buff", effect: { kind: "stone_skin", character: 0 } });
    expect(armor(hero)).toBe(armorBefore + 4);
    expect(fightSpeed(hero)).toBe(Math.trunc(speedBefore / 2));
    expect(attr(hero, "spd", false)).toBeLessThan(speedBefore);
    advanceTime(p, 11 * HOUR);
    expect(armor(hero)).toBe(armorBefore + 4);
    advanceTime(p, 2 * HOUR);
    expect(armor(hero)).toBe(armorBefore);
    expect(fightSpeed(hero)).toBe(speedBefore);
  });

  it("Rage adds the caster's level to every blow and halves the armor", () => {
    const p = party();
    const hero = p.characters[0]!;
    const armorBefore = armor(hero);
    const blow = meleeDamage(hero, null, rng("same"));
    castSpell(p, 3, 25, rng("a"), { target: 0 });
    expect(armor(hero)).toBe(Math.trunc(armorBefore / 2));
    expect(meleeDamage(hero, null, rng("same"))).toBe(blow + 4);
    advanceTime(p, 13 * HOUR);
    expect(armor(hero)).toBe(armorBefore);
    expect(meleeDamage(hero, null, rng("same"))).toBe(blow);
  });

  it("Power Shield takes a tenth off every hit for an hour", () => {
    const p = party();
    const hero = p.characters[0]!;
    hero.hp = hero.health = 1000;
    const before = applyHit(p, 0, 100, null, rng("a")).damage;
    expect(before).toBe(100);
    castSpell(p, 3, 33, rng("a"));
    expect(hasEffect(p, "power_shield")).toBe(true);
    expect(applyHit(p, 0, 100, null, rng("a")).damage).toBe(90);
    advanceTime(p, HOUR + 1);
    expect(applyHit(p, 0, 100, null, rng("a")).damage).toBe(100);
  });

  it("Walk on Water holds while the party is in deep water and ends when it leaves", () => {
    const p = party();
    castSpell(p, 3, 34, rng("a"));
    surroundings.inDeepWater = true;
    advanceTime(p, 5 * HOUR);
    expect(hasEffect(p, "walk_on_water")).toBe(true);
    advanceTime(p, 5 * HOUR);
    expect(hasEffect(p, "walk_on_water")).toBe(true);
    surroundings.inDeepWater = false;
    advanceTime(p, 1);
    expect(hasEffect(p, "walk_on_water")).toBe(false);
    // on dry land it simply runs out after four hours
    castSpell(p, 3, 34, rng("a"));
    advanceTime(p, 4 * HOUR + 1);
    expect(hasEffect(p, "walk_on_water")).toBe(false);
  });

  it("Wizard Eye lasts eight hours and Detect Monster eight", () => {
    const p = party();
    castSpell(p, 3, 24, rng("a"));
    castSpell(p, 3, 36, rng("a"));
    advanceTime(p, 7 * HOUR);
    expect(hasEffect(p, "wizard_eye")).toBe(true);
    expect(hasEffect(p, "detect_monster")).toBe(true);
    advanceTime(p, 2 * HOUR);
    expect(hasEffect(p, "wizard_eye")).toBe(false);
    expect(hasEffect(p, "detect_monster")).toBe(false);
  });
});

describe("Dimensional Rift", () => {
  it("takes a hero out of the fight for five monster turns, or until the party moves", () => {
    const p = party();
    for (const c of p.characters) c.hp = c.health = 9999;
    const [bat] = ids((m) => m.treasure_level === 1 && m.terrain === "land");
    const enc = fight(0, 0, [[bat!, 1, 0]]);
    expect(castSpell(p, 3, 30, rng("a"), { target: 0 })).toEqual({ kind: "rift", target: 0 });
    expect(canAct(p.characters[0]!)).toBe(false);
    // nothing can hit them
    expect(applyHit(p, 0, 50, null, rng("a")).damage).toBe(0);
    for (let turn = 0; turn < 4; turn++) monsterTurn(p, open, enc, 0, 0, rng(`t${turn}`));
    expect(canAct(p.characters[0]!)).toBe(false);
    monsterTurn(p, open, enc, 0, 0, rng("t5"));
    expect(canAct(p.characters[0]!)).toBe(true);
    // and a step ends it
    castSpell(p, 3, 30, rng("a"), { target: 1 });
    expect(cancelRifts(p)).toEqual([1]);
    expect(canAct(p.characters[1]!)).toBe(true);
  });
});

describe("spells that change monsters", () => {
  const [goblin] = ids((m) => m.treasure_level === 1 && m.terrain === "land" && !isUndead(m.id) && m.no_of_attacks >= 1 && !m.special_abilties?.includes("Ranged"));

  it("Dimensional Phasing: the monsters neither move nor strike, nothing can hurt them, and after five turns they are back", () => {
    const p = party();
    for (const c of p.characters) c.hp = c.health = 9999;
    const enc = fight(0, 0, [[goblin!, 3, 0], [goblin!, 1, 0], [goblin!, 20, 0]]);
    expect(phaseMonsters(enc, 0, 0)).toHaveLength(2);
    const near = enc.monsters[0]!;
    const hpBefore = p.characters.map((c) => c.hp);
    for (let turn = 0; turn < 4; turn++) {
      const events = monsterTurn(p, open, enc, 0, 0, rng(`p${turn}`));
      expect(events.filter((e) => e.type === "monster_move" || e.type === "monster_attack")).toHaveLength(0);
    }
    expect(near.x).toBe(3);
    expect(p.characters.map((c) => c.hp)).toEqual(hpBefore);
    expect(partyAttack(p, open, enc, 0, 0, rng("x"), { kind: "melee", targetUid: enc.monsters[1]!.uid })).toEqual([{ type: "denied", reason: "no_target" }]);
    // the fifth turn is the last one: the one after it, they come for the party again
    monsterTurn(p, open, enc, 0, 0, rng("p4"));
    expect(near.phased).toBeUndefined();
    const events = monsterTurn(p, open, enc, 0, 0, rng("p5"));
    expect(events.some((e) => e.type === "monster_move" || e.type === "monster_attack")).toBe(true);
  });

  it("Immobilize keeps a monster from moving for three turns, once", () => {
    const p = party();
    const enc = fight(0, 0, [[goblin!, 4, 0]]);
    const m = enc.monsters[0]!;
    expect(immobilize(m)).toBe(true);
    for (let turn = 0; turn < 3; turn++) monsterTurn(p, open, enc, 0, 0, rng(`i${turn}`));
    expect(m.x).toBe(4);
    monsterTurn(p, open, enc, 0, 0, rng("i4"));
    expect(m.x).toBe(3);
    expect(immobilize(m)).toBe(false);
  });

  it("Clumsy makes a tenth of a monster's attacks fail, and does not stack", () => {
    const [many] = ids((m) => m.no_of_attacks >= 1 && m.speed > 0 && m.terrain === "land" && !m.special_abilties?.includes("Causes"));
    const strikes = (clumsy: boolean) => {
      let n = 0;
      for (let i = 0; i < 400; i++) {
        const p = party();
        for (const c of p.characters) c.hp = c.health = 99999;
        const enc = fight(0, 0, [[many!, 1, 0]]);
        if (clumsy) makeClumsy(enc.monsters[0]!);
        n += monsterTurn(p, open, enc, 0, 0, rng(`k${i}`)).filter((e) => e.type === "monster_attack").length;
      }
      return n;
    };
    const normal = strikes(false);
    const clumsy = strikes(true);
    expect(clumsy).toBeLessThan(normal);
    expect(clumsy).toBeGreaterThan(normal * 0.8);
    const enc = fight(0, 0, [[many!, 1, 0]]);
    expect(makeClumsy(enc.monsters[0]!)).toBe(true);
    expect(makeClumsy(enc.monsters[0]!)).toBe(false);
  });

  it("Gravity draws monsters to the party at once and they do not strike on that turn", () => {
    const p = party();
    for (const c of p.characters) c.hp = c.health = 9999;
    const enc = fight(0, 0, [[goblin!, 4, 0], [goblin!, 0, 3]]);
    const events = pullMonsters(open, enc, 0, 0);
    expect(events.filter((e) => e.type === "monster_pull")).toHaveLength(2);
    for (const m of enc.monsters) expect(Math.abs(m.x) + Math.abs(m.y)).toBe(1);
    const hits = monsterTurn(p, open, enc, 0, 0, rng("g")).filter((e) => e.type === "monster_attack");
    expect(hits).toHaveLength(0);
    expect(monsterTurn(p, open, enc, 0, 0, rng("g2")).some((e) => e.type === "monster_attack")).toBe(true);
  });
});

describe("attack spells with rules of their own", () => {
  const skeleton = 64;
  const bigUndead = ids((m) => isUndead(m.id) && m.health > 600)[0]!;
  const living = ids((m) => !isUndead(m.id) && m.treasure_level === 1 && m.terrain === "land")[0]!;
  const l5 = ids((m) => m.treasure_level === 5 && m.terrain === "land" && !isUndead(m.id))[0]!;

  const cast = (p: Party, enc: Encounter, kind: Parameters<typeof specialSpell>[6], target: string, seed = "s") => {
    for (const c of p.characters) c.hp = c.health = 99999;
    return specialSpell(p, open, enc, 0, 0, rng(seed), kind, target, { damage: 200, type: "magic" });
  };

  it("Holy Word hurts only the undead on the line: 150, or a quarter of the maximum for the big ones", () => {
    const p = party();
    const enc = fight(0, 0, [[living, 1, 0], [skeleton, 2, 0], [bigUndead, 3, 0], [skeleton, 2, 5]]);
    const events = cast(p, enc, "holy_word", "m0");
    const hits = events.filter((e) => e.type === "party_attack");
    expect(hits).toHaveLength(2);
    expect(enc.monsters.find((m) => m.uid === "m0")!.hp).toBe(MONSTERS[living]!.health);
    expect(enc.monsters.find((m) => m.uid === "m3")!.hp).toBe(MONSTERS[skeleton]!.health);
    const dealt = (uid: string) => hits.find((e) => e.type === "party_attack" && e.uid === uid) as { damage: number } | undefined;
    // the skeleton may be gone (150 is more than its health): then it is no longer in the fight
    expect(dealt("m1")?.damage).toBe(150);
    expect(dealt("m2")?.damage).toBe(Math.floor(MONSTERS[bigUndead]!.health * 0.25));
  });

  it("Mass Distortion halves the health of about a fifth of the monsters on the line and spares the level 5 ones", () => {
    let halved = 0;
    let l5Hurt = 0;
    for (let i = 0; i < 300; i++) {
      const p = party();
      const enc = fight(0, 0, [[living, 1, 0], [l5, 2, 0]]);
      cast(p, enc, "mass_distortion", "m0", `d${i}`);
      const a = enc.monsters.find((m) => m.uid === "m0");
      if (a && a.hp < MONSTERS[living]!.health) halved++;
      const b = enc.monsters.find((m) => m.uid === "m1");
      if (b && b.hp < MONSTERS[l5]!.health) l5Hurt++;
    }
    expect(halved).toBeGreaterThan(30);
    expect(halved).toBeLessThan(90);
    expect(l5Hurt).toBe(0);
  });

  it("Finger of Death kills a level 1 or 2 monster half of the time and nothing above", () => {
    let killed = 0;
    for (let i = 0; i < 200; i++) {
      const enc = fight(0, 0, [[living, 1, 0]]);
      cast(party(), enc, "finger_of_death", "m0", `f${i}`);
      if (enc.monsters.length === 0) killed++;
    }
    expect(killed).toBeGreaterThan(70);
    expect(killed).toBeLessThan(130);
    const enc = fight(0, 0, [[l5, 1, 0]]);
    cast(party(), enc, "finger_of_death", "m0");
    expect(enc.monsters).toHaveLength(1);
    expect(enc.monsters[0]!.hp).toBe(MONSTERS[l5]!.health);
  });

  it("Star Burst hits everything within three tiles of the target, not what is farther", () => {
    const p = party();
    const enc = fight(0, 0, [[living, 6, 0], [living, 8, 1], [living, 6, 3], [living, 12, 0]]);
    const events = cast(p, enc, "star_burst", "m0");
    const hit = new Set(events.filter((e) => e.type === "party_attack").map((e) => (e as { uid: string }).uid));
    // the first is 6 tiles from the party but the target; the second is 2.2 away, the third 3, the fourth 6
    expect([...hit].sort()).toEqual(["m0", "m1", "m2"]);
  });

  it("Moon Ray heals everyone who can be healed by up to 50 while it hits", () => {
    const p = party();
    for (const c of p.characters) c.hp = Math.max(1, c.health - 80);
    p.characters[1]!.conditions = ["Dead"];
    const before = p.characters.map((c) => c.hp);
    const result = castSpell(p, 3, 60, rng("a"));
    expect(result).toMatchObject({ kind: "attack", penetrate: true });
    expect(p.characters[0]!.hp).toBe(Math.min(p.characters[0]!.health, before[0]! + 50));
    expect(p.characters[1]!.hp).toBe(before[1]);
  });
});

describe("Pandora's box", () => {
  it("brings gold, items and monsters in the chances of the spell sheet", () => {
    const counts = { gold: 0, goldBig: 0, item: 0, monster: 0, dragon: 0 };
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const o = pandoraOutcome(rng(`p${i}`));
      if (o.type === "gold") (o.amount >= 1000 ? counts.goldBig++ : counts.gold++);
      else if (o.type === "item") counts.item++;
      else if (o.defId === DRAGON_LORD) counts.dragon++;
      else {
        expect(MONSTERS[o.defId]!.treasure_level).toBeLessThanOrEqual(2);
        expect(MONSTERS[o.defId]!.terrain).toBe("land");
        counts.monster++;
      }
    }
    const share = (c: number) => c / n;
    expect(share(counts.gold)).toBeCloseTo(0.35, 1); // 30 % up to 100 and 5 % up to 200
    expect(share(counts.item)).toBeCloseTo(0.35, 1);
    expect(share(counts.monster)).toBeCloseTo(0.25, 1);
    expect(share(counts.goldBig)).toBeCloseTo(0.04, 1);
    expect(share(counts.dragon)).toBeCloseTo(0.01, 1);
  });

  it("is too dangerous in a town and costs nothing there", () => {
    const p = party();
    const sp = p.characters[3]!.sp;
    expect(castSpell(p, 3, 2, rng("a"), { town: true })).toEqual({ kind: "fizzle", reason: "in_town" });
    expect(p.characters[3]!.sp).toBe(sp);
    expect(castSpell(p, 3, 2, rng("a"))).toMatchObject({ kind: "pandora" });
  });
});

describe("Lloyd's Beacon, Town Portal", () => {
  const here = { mode: "overworld", x: 5, y: 6, facing: "N" } as const;

  it("every hero has a fire of their own and goes back only to it", () => {
    const p = party();
    p.characters[2]!.spells = [32];
    p.characters[2]!.mana = p.characters[2]!.sp = 100;
    expect(castSpell(p, 3, 32, rng("a"), { beacon: "return" })).toEqual({ kind: "fizzle", reason: "no_beacon" });
    expect(castSpell(p, 3, 32, rng("a"), { beacon: "set", here })).toMatchObject({ kind: "world", beacon: "set" });
    expect(p.characters[3]!.beacon).toEqual(here);
    expect(p.characters[2]!.beacon).toBeUndefined();
    expect(castSpell(p, 2, 32, rng("a"), { beacon: "return" })).toEqual({ kind: "fizzle", reason: "no_beacon" });
    expect(castSpell(p, 3, 32, rng("a"), { beacon: "return" })).toMatchObject({ kind: "world", beacon: "return", place: here });
  });

  it("neither Return nor Town Portal works with monsters next to the party, and neither costs anything then", () => {
    const p = party();
    p.characters[3]!.beacon = here;
    const sp = p.characters[3]!.sp;
    expect(castSpell(p, 3, 32, rng("a"), { beacon: "return", battle: true })).toEqual({ kind: "fizzle", reason: "in_battle" });
    expect(castSpell(p, 3, 66, rng("a"), { battle: true })).toEqual({ kind: "fizzle", reason: "in_battle" });
    expect(p.characters[3]!.sp).toBe(sp);
    // setting a fire is allowed in a fight
    expect(castSpell(p, 3, 32, rng("a"), { beacon: "set", here, battle: true })).toMatchObject({ kind: "world" });
  });

  it("Super Shelter needs food", () => {
    const p = party();
    p.food = 0;
    expect(castSpell(p, 3, 52, rng("a"))).toEqual({ kind: "fizzle", reason: "no_food" });
    p.food = 1;
    expect(castSpell(p, 3, 52, rng("a"))).toEqual({ kind: "world", spellId: 52 });
  });
});

describe("Time Distortion", () => {
  it("finds the nearest ground that no monster reaches", () => {
    const enc = fight(0, 0, [[ids((m) => m.terrain === "land")[0]!, 3, 0]]);
    const spots = safeCells(enc, 0, 0, () => true);
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) expect((s.x - 3) ** 2 + s.y ** 2).toBeGreaterThan(49);
    // as near as it can be: the first ring that holds a safe cell (a wall of monsters all round leaves none within reach)
    expect(Math.max(Math.abs(spots[0]!.x), Math.abs(spots[0]!.y))).toBeLessThanOrEqual(11);
  });
});

describe("Combine, Duplication, Transform Ring", () => {
  function bag(n: number, material: number, kind = 20): Party {
    const p = party();
    const hero = p.characters[0]!;
    for (const slot of Object.keys(hero.inventory)) hero.inventory[slot] = null;
    for (let i = 0; i < n; i++) {
      const item = generateItem(rng(`i${i}`), 1, { forcedMaterial: material, forcedType: kind });
      item.id = `i${i}`;
      hero.inventory[`slot${i + 1}`] = item;
    }
    return p;
  }

  it("Combine turns three alike items into one of the next better material", () => {
    const p = bag(4, 3);
    const hero = p.characters[0]!;
    const groups = combineGroups(hero);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.slots).toHaveLength(4);
    expect(canCombine(hero, ["slot1", "slot2", "slot3"])).toBe(true);
    expect(canCombine(hero, ["slot1", "slot2", "slot2"])).toBe(false);
    const made = combine(hero, ["slot1", "slot2", "slot3"], rng("a"))!;
    expect(made.material).toBe(4);
    expect(made.type).toBe(hero.inventory.slot4!.type);
    expect(hero.inventory.slot2).toBeNull();
    expect(hero.inventory.slot3).toBeNull();
    expect(hero.inventory.slot1).toBe(made);
  });

  it("leaves out different kinds, different materials, quest items and the best material", () => {
    const p = bag(3, 3);
    const hero = p.characters[0]!;
    hero.inventory.slot3!.material = 2;
    expect(combineGroups(hero)).toHaveLength(0);
    hero.inventory.slot3!.material = 3;
    hero.inventory.slot3!.quest = true;
    expect(combineGroups(hero)).toHaveLength(0);
    const best = bag(3, 8);
    expect(combineGroups(best.characters[0]!)).toHaveLength(0);
  });

  it("Combine makes a ring one level better", () => {
    const p = party();
    const hero = p.characters[0]!;
    for (const slot of Object.keys(hero.inventory)) hero.inventory[slot] = null;
    for (let i = 0; i < 3; i++) hero.inventory[`slot${i + 1}`] = { ...generateItem(rng("ring"), 3, { forcedType: 36 }), id: `r${i}` };
    const level = ringLevel(hero.inventory.slot1!);
    expect(combineGroups(hero)).toHaveLength(1);
    const made = combine(hero, ["slot1", "slot2", "slot3"], rng("a"))!;
    expect(made.type).toBe("ring");
    expect(ringLevel(made)).toBe(level + 1);
  });

  it("Duplication copies half of the time, destroys a quarter and does nothing for a quarter", () => {
    const tally = { duplicated: 0, destroyed: 0, nothing: 0, no_room: 0 };
    for (let i = 0; i < 2000; i++) {
      const p = bag(1, 2);
      tally[duplicate(p, p.characters[0]!, "slot1", rng(`d${i}`))]++;
    }
    expect(tally.duplicated / 2000).toBeCloseTo(0.5, 1);
    expect(tally.destroyed / 2000).toBeCloseTo(0.25, 1);
    expect(tally.nothing / 2000).toBeCloseTo(0.25, 1);
    const p = bag(1, 2);
    p.characters[0]!.inventory.slot1!.quest = true;
    expect(duplicate(p, p.characters[0]!, "slot1", rng("q"))).toBe("nothing");
  });

  it("Transform Ring keeps the level, changes the ring and loses it one time in four", () => {
    let lost = 0;
    let changed = 0;
    for (let i = 0; i < 400; i++) {
      const p = party();
      const hero = p.characters[0]!;
      hero.inventory.slot1 = { ...generateItem(rng("r"), 4, { forcedType: 36 }), id: "r" };
      const level = ringLevel(hero.inventory.slot1);
      const r = transformRing(hero, "slot1", rng(`t${i}`));
      if (r.result === "destroyed") {
        lost++;
        expect(hero.inventory.slot1).toBeNull();
      } else {
        changed++;
        expect(ringLevel(hero.inventory.slot1!)).toBe(level);
      }
    }
    expect(lost / 400).toBeCloseTo(0.25, 1);
    expect(changed).toBe(400 - lost);
    expect(makeItem({ name: "x", type: "ring" }).type).toBe("ring");
  });
});

describe("schools", () => {
  it("every class with magic has at least the spells of its school", () => {
    for (const school of Object.values(SPELL_SCHOOL)) expect(Object.values(SPELLS).some((s) => s.type.includes(school))).toBe(true);
    expect(MINUTES_PER_DAY).toBe(1440);
    expect(createCharacter({ name: "x", classType: "Wizard", raceType: "Human", avatar: "character05", attrs: { str: 10, int: 10, per: 10, end: 10, spd: 10, acc: 10, lck: 10 } }).mods).toBeUndefined();
    void recalcValues;
  });
});
