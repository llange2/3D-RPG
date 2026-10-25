import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, SPELLS } from "../../src/data/tables";
import { setBalanceMode } from "../../src/sim/balance";
import { armor, canEquip, createCharacter, equipSlots, itemBonus, levelUp, pyRound, recalcValues, swapSlots, xpToNextLevel } from "../../src/sim/character";
import { applyHit, meleeDamage, monsterDamage, rangedDamage, specialCondition } from "../../src/sim/combat";
import { createEncounter, createMonster, lineOfSight, monsterTurn, partyAttack, spellInLine, spellRound, updateBattleMode, wayToPlayer, type GridView } from "../../src/sim/encounter";
import { bonusDescription, generateItem, makeItem, spellScroll } from "../../src/sim/items";
import { ACTION_MINUTES, addEffect, advanceTime, createDefaultParty, giveItem, hasEffect, protectionLevel, rest, stepMinutes } from "../../src/sim/party";
import { learnSpell } from "../../src/sim/economy";
import { castSpell, isSpellImplemented, learnableSpells, learnBlock, SPELL_SCHOOL } from "../../src/sim/spells";
import { BAG_SLOTS, type Party } from "../../src/sim/types";

const rng = (s: string) => new Rng(seedFromString(s));

/**
 * BALANCE v4: the tests that pin the OLD numbers run in the legacy mode (sim/balance.ts), so the rollback branch stays covered until the
 * clean-up deletes it. The numbers of the new rules are pinned in balanceV4.test.ts.
 */
function legacyRules<T>(fn: () => T): T {
  setBalanceMode("legacy");
  try {
    return fn();
  } finally {
    setBalanceMode("v4");
  }
}

/** The default party without its starter equipment and with 500 gold: formulas are easiest to check on bare characters. */
function bareParty(): Party {
  const p = createDefaultParty();
  for (const c of p.characters) for (const slot of Object.keys(c.inventory)) c.inventory[slot] = null;
  for (const c of p.characters) recalcValues(c, p.talents, true);
  p.gold = 500;
  p.itemCounter = 0;
  return p;
}
const TEXTURES = join(import.meta.dirname, "..", "..", "..", "old_code", "resources", "textures");

describe("starter equipment", () => {
  it("gives every hero a weapon and body armour that the class may use", () => {
    const party = createDefaultParty();
    for (const c of party.characters) {
      expect(c.inventory.left_hand, `${c.name} weapon`).not.toBeNull();
      expect(c.inventory.body_armor, `${c.name} armor`).not.toBeNull();
      expect(itemBonus(c, "dam_max")).toBeGreaterThan(0);
      expect(armor(c)).toBeGreaterThan(0);
    }
    // archers and ninjas can shoot
    expect(itemBonus(party.characters[2]!, "ranged_dam_max")).toBeGreaterThan(0);
    expect(itemBonus(party.characters[1]!, "ranged_dam_max")).toBeGreaterThan(0);
  });

  it("is identical for every new game", () => {
    expect(JSON.stringify(createDefaultParty())).toBe(JSON.stringify(createDefaultParty()));
  });
});

describe("python rounding", () => {
  it("rounds halves to even like the old game", () => {
    expect([0.5, 1.5, 2.5, 3.5, -0.5].map((v) => pyRound(v) + 0)).toEqual([0, 2, 2, 4, 0]);
    expect(pyRound(2.4)).toBe(2);
    expect(pyRound(2.6)).toBe(3);
  });
});

describe("characters", () => {
  it("computes health and mana of the four default heroes like the old formulas", () => {
    const party = legacyRules(() => createDefaultParty());
    const [maximus, elrin, ralvar, lyneth] = party.characters;
    // health = round(level * (END/2 + class hp + race hp)); BALANCE v4 adds 10 (pinned in balanceV4.test.ts)
    expect([maximus!.health, elrin!.health, ralvar!.health, lyneth!.health]).toEqual([16, 10, 8, 8]);
    // mana: Archer = round(1 * (10 - 90/INT + race mana)); Druid = round(1 * (25 - 500/(PER+INT) + race mana)); fighters have none
    expect([maximus!.mana, elrin!.mana, ralvar!.mana, lyneth!.mana]).toEqual([0, 0, 6, 13]);
    expect(maximus!.resMagic).toBe(0); // orc
    expect(elrin!.resAcid).toBe(20); // dwarf
    expect(elrin!.thievery).toBe(25); // ninja 15 + dwarf 10
  });

  it("needs a geometric amount of XP per level and 1,024,000 per level above 10", () => {
    const knight = createCharacter({ name: "K", classType: "Knight", raceType: "Human", avatar: "character04", attrs: { str: 17, int: 8, per: 12, end: 18, spd: 15, acc: 18, lck: 14 } });
    // BALANCE v4 replaced this table (pinned in balanceV4.test.ts); the old one is the legacy branch
    legacyRules(() => {
      expect(xpToNextLevel(knight)).toBe(1500);
      expect(xpToNextLevel(knight, 2)).toBe(1500 + 3000);
      expect(xpToNextLevel(knight, 10)).toBe(1500 * (2 ** 10 - 1));
      expect(xpToNextLevel(knight, 12)).toBe(1500 * (2 ** 10 - 1) + 2 * 1_024_000);
      knight.xp = 1200;
      expect(xpToNextLevel(knight)).toBe(300);
      levelUp(knight, [], 1);
      expect(knight.level).toBe(2);
      expect(knight.xp).toBe(1500);
      expect(knight.hp).toBe(knight.health);
    });
  });

  it("adds the talent mana bonus for casters", () => {
    const wizard = createCharacter({ name: "W", classType: "Wizard", raceType: "Elf", avatar: "character05", attrs: { str: 8, int: 20, per: 10, end: 10, spd: 10, acc: 10, lck: 10 } });
    const plain = wizard.mana;
    recalcValues(wizard, ["talent_prestidigitator"], true);
    expect(wizard.mana).toBe(plain + 2);
  });

  it("equips only fitting items and keeps two-handers and shields apart", () => {
    const c = createDefaultParty().characters[0]!;
    for (const slot of Object.keys(c.inventory)) c.inventory[slot] = null;
    const sword = makeItem({ name: "Sword", type: "long sword" });
    const axe = makeItem({ name: "Axe", type: "great axe" });
    const shield = makeItem({ name: "Shield", type: "shield" });
    const helm = makeItem({ name: "Helm", type: "helmet" });
    c.inventory.slot1 = sword;
    c.inventory.slot2 = axe;
    c.inventory.slot3 = shield;
    c.inventory.slot4 = helm;
    expect(canEquip(c.inventory, sword, "left_hand")).toBe(true);
    expect(canEquip(c.inventory, sword, "right_hand")).toBe(false);
    expect(canEquip(c.inventory, helm, "helmet")).toBe(true);
    expect(canEquip(c.inventory, helm, "boots")).toBe(false);
    expect(swapSlots(c, "slot3", "right_hand")).toBe(true); // shield
    expect(swapSlots(c, "slot1", "left_hand")).toBe(true);
    // a two-hander takes the shield off: it goes into the backpack, the sword takes the place the axe leaves
    expect(swapSlots(c, "slot2", "left_hand")).toBe(true);
    expect(c.inventory.left_hand).toBe(axe);
    expect(c.inventory.right_hand).toBeNull();
    expect(c.inventory.slot2).toBe(sword);
    expect(c.inventory.slot1).toBe(shield); // the first free place
    // and no shield next to it as long as it is worn
    expect(canEquip(c.inventory, shield, "right_hand")).toBe(false);
  });

  it("needs one more free place for a two-hander only when weapon and shield are both worn", () => {
    const c = createDefaultParty().characters[0]!;
    for (const slot of Object.keys(c.inventory)) c.inventory[slot] = null;
    const sword = makeItem({ name: "Sword", type: "long sword" });
    const axe = makeItem({ name: "Axe", type: "great axe" });
    const shield = makeItem({ name: "Shield", type: "shield" });
    // a full backpack: the axe and nineteen fillers
    const fill = () => BAG_SLOTS.forEach((s, i) => (c.inventory[s] = i === 0 ? axe : makeItem({ name: `junk${i}`, type: "club" })));
    fill();
    c.inventory.left_hand = sword;
    c.inventory.right_hand = shield;
    expect(equipSlots(c.inventory, "slot1", "left_hand")).toBe("bag_full");
    expect(c.inventory.left_hand).toBe(sword); // nothing moved
    expect(c.inventory.right_hand).toBe(shield);
    expect(c.inventory.slot1).toBe(axe);
    // weapon only: the axe and the sword just trade places
    c.inventory.right_hand = null;
    expect(equipSlots(c.inventory, "slot1", "left_hand")).toBe("ok");
    expect(c.inventory.slot1).toBe(sword);
    // shield only: the shield takes the place the axe leaves
    c.inventory.left_hand = null;
    c.inventory.right_hand = shield;
    c.inventory.slot1 = axe;
    expect(equipSlots(c.inventory, "slot1", "left_hand")).toBe("ok");
    expect(c.inventory.slot1).toBe(shield);
    expect(c.inventory.right_hand).toBeNull();
    // weapon and shield with one free place elsewhere
    c.inventory.left_hand = sword;
    c.inventory.right_hand = shield;
    c.inventory.slot1 = axe;
    c.inventory.slot7 = null;
    expect(equipSlots(c.inventory, "slot1", "left_hand")).toBe("ok");
    expect(c.inventory.slot1).toBe(sword);
    expect(c.inventory.slot7).toBe(shield);
  });
});

describe("items", () => {
  it("is deterministic for the same stream", () => {
    const a = Array.from({ length: 30 }, (_, i) => generateItem(rng(`item-${i}`), 3));
    const b = Array.from({ length: 30 }, (_, i) => generateItem(rng(`item-${i}`), 3));
    expect(a).toEqual(b);
  });

  it("limits the material by treasure level and lets rare materials appear later", () => {
    const r = rng("materials");
    const low = new Set<number>();
    const high = new Set<number>();
    for (let i = 0; i < 600; i++) {
      low.add(generateItem(r, 1).material);
      high.add(generateItem(r, 5).material);
    }
    expect(Math.max(...low)).toBeLessThanOrEqual(4);
    expect(Math.max(...high)).toBe(8);
  });

  it("names, values and bonuses follow the old tables", () => {
    const sword = generateItem(rng("forced"), 1, { forcedMaterial: 3, forcedType: 13 }); // iron long sword
    expect(sword.name).toBe("Iron Long Sword");
    expect(sword.type).toBe("long sword");
    expect(sword.bonus.dam_min).toBe(3 + 6);
    expect(sword.bonus.dam_max).toBe(9 + 6);
    expect(sword.value).toBe(Math.floor(100 * 3 + 0.9999));
    expect(sword.texture).toBe("item_1h_long_sword_iron");
    const bow = generateItem(rng("forced2"), 1, { forcedMaterial: 4, forcedType: 12 }); // steel long bow
    expect(bow.bonus.ranged_dam_min).toBe(5 + 4); // steel adds 8 to melee weapons and half of it to ranged weapons
    expect(bow.bonus.dam_min).toBeUndefined();
    const plate = generateItem(rng("forced3"), 1, { forcedMaterial: 8, forcedType: 30 }); // obsidian plate armor
    expect(plate.bonus.arm).toBe(10 + 20);
    expect(bonusDescription(plate)).toBe("Armor: 30");
  });

  it("only ever produces textures that exist in the original asset folder", () => {
    const r = rng("textures");
    const missing = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const item = generateItem(r, 1 + (i % 5));
      if (!existsSync(join(TEXTURES, `${item.texture}.png`)) && !existsSync(join(TEXTURES, `${item.texture}.jpg`))) missing.add(item.texture);
    }
    expect([...missing]).toEqual([]);
  });

  it("gives rings prefix and suffix bonuses that sum to their level", () => {
    const r = rng("rings");
    let rings = 0;
    for (let i = 0; i < 800; i++) {
      const item = generateItem(r, 5);
      if (item.type !== "ring") continue;
      rings++;
      expect(item.name.endsWith("Ring") || item.name.includes(" of ")).toBe(true);
      expect(Object.keys(item.bonus).length).toBeGreaterThan(0);
    }
    expect(rings).toBeGreaterThan(50);
  });

  it("builds a spell scroll with the spell's name", () => {
    const scroll = spellScroll(3);
    expect(scroll.type).toBe("spell");
    expect(scroll.name).toBe("Elemental Arrow");
    expect(scroll.texture).toBe("item_spell_arcane_nature");
  });
});

describe("combat formulas", () => {
  const party = bareParty();
  const maximus = party.characters[0]!;
  const noArmor = Object.values(MONSTERS).find((m) => m.armor === 0)!;

  it("melee: ceil((STR/10 + class melee) * level + weapon) minus monster armor", () => {
    // BALANCE v4 changed the formula (pinned in balanceV4.test.ts); this is the legacy branch
    legacyRules(() => {
      // Maximus: 21/10 + 3 = 5.1; no weapon -> 1; ceil(6.1) = 7
      expect(meleeDamage(maximus, null, rng("m"))).toBe(7);
      expect(meleeDamage(maximus, noArmor, rng("m"))).toBe(7);
      const armored = Object.values(MONSTERS).find((m) => m.armor > 0 && m.armor < 7)!;
      expect(meleeDamage(maximus, armored, rng("m"))).toBe(7 - armored.armor);
      maximus.defensiveStance = true;
      expect(meleeDamage(maximus, null, rng("m"))).toBe(Math.trunc(7 * 0.75));
      maximus.defensiveStance = false;
    });
  });

  it("characters who cannot act deal no damage", () => {
    const c = createDefaultParty().characters[0]!;
    c.conditions = ["Paralyzed"];
    expect(meleeDamage(c, null, rng("p"))).toBe(0);
    expect(rangedDamage(c, null, 1, rng("p"))).toBe(0);
  });

  it("ranged hit chance drops with distance", () => {
    const archer = createDefaultParty().characters[2]!;
    archer.inventory.ranged_weapon = makeItem({ name: "Bow", type: "short bow", bonus: { ranged_dam_min: 3, ranged_dam_max: 6 } });
    const fast = Object.values(MONSTERS).find((m) => m.speed >= 30)!;
    const hits = (d: number) => {
      const r = rng(`ranged-${d}`);
      let n = 0;
      for (let i = 0; i < 2000; i++) if (rangedDamage(archer, fast, d, r) > 0) n++;
      return n;
    };
    expect(hits(1)).toBeGreaterThan(hits(5));
  });

  it("elemental monster damage is reduced by resistance percent, physical by armor, poison not at all", () => {
    const p = bareParty();
    const target = p.characters[0]!; // orc: 10 fire, 10 ice, 10 acid, 0 magic
    const fire = Object.values(MONSTERS).find((m) => m.attack_type === "Fire")!;
    const magic = Object.values(MONSTERS).find((m) => m.attack_type === "Magic")!;
    const physical = Object.values(MONSTERS).find((m) => m.attack_type === "Physical")!;
    const poison = Object.values(MONSTERS).find((m) => m.attack_type === "Poison");
    const fixed = (m: typeof fire) => ({ ...m, damage_min: 100, damage_max: 100 });
    expect(monsterDamage(p, fixed(fire), target, false, 1, rng("a"))).toBe(90);
    expect(monsterDamage(p, fixed(magic), target, false, 1, rng("a"))).toBe(100);
    target.inventory.body_armor = makeItem({ name: "Mail", type: "chain_mail", bonus: { arm: 12 } });
    expect(monsterDamage(p, { ...fixed(physical), damage_min: 40, damage_max: 40 }, target, false, 1, rng("a"))).toBe(28);
    if (poison) expect(monsterDamage(p, fixed(poison), target, false, 1, rng("a"))).toBe(100);
    addEffect(p, { kind: "protection", until: p.minutes + 600, element: "fire", amount: 15 });
    expect(protectionLevel(p, "fire")).toBe(15);
    expect(monsterDamage(p, fixed(fire), target, false, 1, rng("a"))).toBe(75);
  });

  it("reads the condition after 'Causes' in the special ability text", () => {
    expect(specialCondition(MONSTERS[17]!)).toBe("Paralyzed");
    expect(specialCondition(MONSTERS[30]!)).toBe("Poisoned");
    expect(specialCondition(MONSTERS[1]!)).toBeNull();
    expect(specialCondition(MONSTERS[3]!)).toBe("Weak"); // "Ranged Attack, Causes Weak, Hatred:Paladins"
  });

  it("knocks out or kills by the old rule", () => legacyRules(() => {
    // BALANCE v4: the heroes have 10 more health; the numbers below are those of 16 maximum health (legacy mode)
    const p = createDefaultParty();
    const c = p.characters[0]!; // 16 max health
    expect(applyHit(p, 0, 10, null, rng("h")).conditions).toEqual([]);
    expect(c.hp).toBe(6);
    // 6 hp - 6 = 0, damage 6 <= 8 and hp 0 > -5: knocked out
    const down = applyHit(p, 0, 6, null, rng("h"));
    expect(down.conditions).toEqual(["Unconscious"]);
    const p2 = createDefaultParty();
    // more than half of max health in one blow kills
    expect(applyHit(p2, 0, 20, null, rng("h")).conditions).toEqual(["Dead"]);
    // at 3 hp: a hit of 7 leaves -4 (above -health/3 = -5, not more than half of 16): knocked out
    const p3 = createDefaultParty();
    p3.characters[0]!.hp = 3;
    expect(applyHit(p3, 0, 7, null, rng("h")).conditions).toEqual(["Unconscious"]);
    // a hit of 8 leaves -5, which reaches the limit of -(16 // 3): dead
    const p4 = createDefaultParty();
    p4.characters[0]!.hp = 3;
    expect(applyHit(p4, 0, 8, null, rng("h")).conditions).toEqual(["Dead"]);
  }));

  it("wakes sleepers when they are hit and reports the end of the party", () => {
    const p = createDefaultParty();
    p.characters[1]!.conditions = ["Sleeping"];
    applyHit(p, 1, 1, null, rng("w"));
    expect(p.characters[1]!.conditions).toEqual(["Healthy"]);
    for (const c of p.characters) c.conditions = ["Dead"];
    expect(applyHit(p, 0, 1, null, rng("w")).defeated).toBe(true);
  });
});

function gridOf(rows: string[], offset = { x: 0, y: 0 }): GridView {
  const at = (x: number, y: number) => rows[y - offset.y]?.[x - offset.x] ?? "#";
  return {
    walkable: (x, y) => at(x, y) === "." || at(x, y) === "~",
    water: (x, y) => at(x, y) === "~",
    opaque: (x, y) => at(x, y) === "#",
  };
}

describe("monster pathing and turns", () => {
  // a land monster that only fights in melee (the first one in the table, the Archer, shoots from a distance)
  const land = Object.values(MONSTERS).find((m) => m.terrain === "land" && !m.special_abilties?.includes("Ranged Attack"))!;
  const water = Object.values(MONSTERS).find((m) => m.terrain === "water")!;
  const open = ["...........", "...........", "...........", "...........", "..........."];

  it("finds a path to a tile next to the player and respects walls", () => {
    const path = wayToPlayer(gridOf(open), land, 0, 2, 5, 2, 7)!;
    expect(path.length).toBe(4);
    expect(path[path.length - 1]).toEqual([4, 2]);
    const wall = ["...........", "....#######", "....#......", "....#......", "..........."];
    expect(wayToPlayer(gridOf(wall), land, 0, 3, 8, 3, 9)).not.toBeNull();
    const sealed = ["...#.......", "...#.......", "...#.......", "...#.......", "...#......."];
    expect(wayToPlayer(gridOf(sealed), land, 0, 2, 8, 2, 9)).toBeNull();
  });

  it("keeps water monsters in the water", () => {
    const lake = ["...........", "..~~~~~~~..", "..~~~~~~~..", "..~~~~~~~..", "..........."];
    expect(wayToPlayer(gridOf(lake), water, 3, 2, 8, 2, 9)).not.toBeNull();
    expect(wayToPlayer(gridOf(lake), water, 0, 2, 8, 2, 9)).toBeNull(); // starts on land
  });

  it("moves monsters one step towards the party and lets them attack when adjacent", () => {
    const party = createDefaultParty();
    const enc = createEncounter();
    enc.monsters.push(createMonster("m1", land.id, 2, 2));
    const view = gridOf(open);
    const events = monsterTurn(party, view, enc, 5, 2, rng("turn"));
    expect(events.find((e) => e.type === "monster_move")).toMatchObject({ uid: "m1", from: [2, 2], to: [3, 2] });
    expect(events.some((e) => e.type === "monster_attack")).toBe(false);
    enc.monsters[0]!.x = 4;
    const second = monsterTurn(party, view, enc, 5, 2, rng("turn2"));
    expect(second.filter((e) => e.type === "monster_attack")).toHaveLength(land.no_of_attacks);
  });

  it("does not stack two monsters on one tile", () => {
    const party = createDefaultParty();
    const enc = createEncounter();
    enc.monsters.push(createMonster("a", land.id, 1, 2), createMonster("b", land.id, 0, 2));
    monsterTurn(party, gridOf(open), enc, 8, 2, rng("stack"));
    const keys = enc.monsters.map((m) => `${m.x},${m.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("battle mode starts next to a monster and orders the round by speed", () => {
    const party = createDefaultParty();
    const view = gridOf(open);
    const enc = createEncounter();
    const tough = Object.values(MONSTERS).find((m) => m.health >= 400 && m.terrain === "land")!;
    enc.monsters.push(createMonster("boss", tough.id, 6, 2));
    updateBattleMode(enc, 5, 2);
    expect(enc.battleMode).toBe(true);
    const events = partyAttack(party, view, enc, 5, 2, rng("battle"), { kind: "melee", targetUid: "boss" });
    expect(events[0]).toMatchObject({ type: "party_attack", kind: "melee" });
    // speeds: Maximus 16, Elrin 20, Ralvar 13, Lyneth 14 -> Elrin, Maximus, Lyneth, Ralvar
    expect(enc.sequence).toEqual([1, 0, 3, 2]);
    expect(enc.attacker).toBe(0);
    updateBattleMode(enc, 0, 0);
    expect(enc.battleMode).toBe(false);
    expect(enc.sequence).toEqual([]);
  });

  it("kills a monster, pays XP and rolls loot", () => {
    const party = createDefaultParty();
    const view = gridOf(open);
    const enc = createEncounter();
    const weak = Object.values(MONSTERS).find((m) => m.health <= 10 && m.armor === 0)!;
    enc.monsters.push(createMonster("weak", weak.id, 6, 2));
    enc.monsters[0]!.hp = 1; // one hit is enough whatever the damage roll is
    updateBattleMode(enc, 5, 2);
    const before = party.characters[0]!.xp;
    const events = partyAttack(party, view, enc, 5, 2, rng("kill"), { kind: "melee", targetUid: "weak" });
    const dead = events.find((e) => e.type === "monster_dead");
    expect(dead).toMatchObject({ uid: "weak", xp: weak.xp, loot: { gold: weak.gold } });
    expect(enc.monsters).toHaveLength(0);
    expect(party.characters[0]!.xp).toBe(before + weak.xp);
  });

  it("hands the turn on when the current attacker has fallen, instead of denying every action", () => {
    const party = createDefaultParty();
    const view = gridOf(open);
    const enc = createEncounter();
    const tough = Object.values(MONSTERS).find((m) => m.health >= 400 && m.terrain === "land")!;
    enc.monsters.push(createMonster("boss", tough.id, 6, 2));
    updateBattleMode(enc, 5, 2);
    partyAttack(party, view, enc, 5, 2, rng("fall1"), { kind: "melee", targetUid: "boss" });
    // the character whose turn it is falls in the monsters' answer
    const fallen = enc.attacker!;
    party.characters[fallen]!.conditions = ["Dead"];
    const events = partyAttack(party, view, enc, 5, 2, rng("fall2"), { kind: "melee", targetUid: "boss" });
    expect(events.some((e) => e.type === "denied")).toBe(false);
    const attack = events.find((e) => e.type === "party_attack");
    expect(attack).toBeDefined();
    expect((attack as { attacker: number }).attacker).not.toBe(fallen);
    expect(enc.attacker).not.toBe(fallen);
    // only when nobody is left, the action is refused
    for (const c of party.characters) c.conditions = ["Dead"];
    const none = partyAttack(party, view, enc, 5, 2, rng("fall3"), { kind: "melee", targetUid: "boss" });
    expect(none[0]).toMatchObject({ type: "denied", reason: "cannot_act" });
  });

  it("denies ranged attacks without a ranged weapon and beyond the radius", () => {
    const party = bareParty();
    const view = gridOf(["...................."]);
    const enc = createEncounter();
    enc.monsters.push(createMonster("far", land.id, 12, 0), createMonster("near", land.id, 4, 0));
    expect(partyAttack(party, view, enc, 0, 0, rng("r"), { kind: "ranged", targetUid: "far" })[0]).toMatchObject({ type: "denied", reason: "out_of_range" });
    expect(partyAttack(party, view, enc, 0, 0, rng("r"), { kind: "ranged", targetUid: "near" })[0]).toMatchObject({ type: "denied", reason: "no_ranged_weapon" });
    expect(partyAttack(party, view, enc, 0, 0, rng("r"), { kind: "melee", targetUid: "gone" })[0]).toMatchObject({ type: "denied", reason: "no_target" });
  });
});

describe("line of sight of ranged attacks", () => {
  const archer = Object.values(MONSTERS).find((m) => m.terrain === "land" && m.special_abilties?.includes("Ranged Attack"))!;

  it("is clear over open ground and in both directions alike", () => {
    const view = gridOf(["........", "........", "........"]);
    expect(lineOfSight(view, null, 0, 1, 7, 1)).toBe(true);
    expect(lineOfSight(view, null, 0, 0, 7, 2)).toBe(true);
    expect(lineOfSight(view, null, 7, 2, 0, 0)).toBe(true);
    expect(lineOfSight(view, null, 3, 1, 3, 1)).toBe(true);
  });

  it("stops at a wall in between but not at a wall beside the line", () => {
    const view = gridOf(["........", "...#....", "........"]);
    expect(lineOfSight(view, null, 0, 1, 7, 1)).toBe(false);
    expect(lineOfSight(view, null, 7, 1, 0, 1)).toBe(false);
    expect(lineOfSight(view, null, 0, 2, 7, 2)).toBe(true);
    // the end points are the monster and the party, not obstacles
    expect(lineOfSight(view, null, 3, 1, 5, 1)).toBe(true);
    expect(lineOfSight(view, null, 2, 1, 3, 1)).toBe(true);
  });

  it("stops at the corner of a wall that the line cuts into", () => {
    // the line from (0,0) to (3,2) leaves the tile row 1 at x = 2.25 and clips the corner of (2,2); a Bresenham walk went past it
    const view = gridOf(["....", "....", "..#."]);
    expect(lineOfSight(view, null, 0, 0, 3, 2)).toBe(false);
    expect(lineOfSight(view, null, 3, 2, 0, 0)).toBe(false);
    // the same wall one row further down is out of the way
    expect(lineOfSight(gridOf(["....", "....", "....", "..#."]), null, 0, 0, 3, 2)).toBe(true);
  });

  it("does not slip through the corner where two walls touch, but may pass along a single wall", () => {
    // (0,0) to (1,1) crosses the corner point shared by (1,0) and (0,1)
    expect(lineOfSight(gridOf([".#.", "#..", "..."]), null, 0, 0, 1, 1)).toBe(false);
    expect(lineOfSight(gridOf([".#.", "#..", "..."]), null, 1, 1, 0, 0)).toBe(false);
    expect(lineOfSight(gridOf([".#.", "...", "..."]), null, 0, 0, 1, 1)).toBe(true);
    expect(lineOfSight(gridOf(["...", "#..", "..."]), null, 0, 0, 1, 1)).toBe(true);
    // the same on the way from (0,0) to (2,2): the second corner is shared by (2,1) and (1,2)
    expect(lineOfSight(gridOf(["...", "..#", ".#."]), null, 0, 0, 2, 2)).toBe(false);
    expect(lineOfSight(gridOf(["...", "..#", "..."]), null, 0, 0, 2, 2)).toBe(true);
    // the other diagonal: (2,0) to (0,2) crosses the corner shared by (1,0) and (2,1) on its way to the middle tile
    expect(lineOfSight(gridOf([".#.", "..#", "..."]), null, 2, 0, 0, 2)).toBe(false);
    expect(lineOfSight(gridOf([".#.", "...", "..."]), null, 2, 0, 0, 2)).toBe(true);
  });

  it("is stopped by an obstacle item such as a gate, which is not a wall", () => {
    const rows = ["........"];
    const gate = new Set(["3,0"]);
    const view: GridView = { ...gridOf(rows), obstacle: (x, y) => gate.has(`${x},${y}`) };
    expect(lineOfSight(view, null, 0, 0, 7, 0)).toBe(false);
    gate.clear();
    expect(lineOfSight(view, null, 0, 0, 7, 0)).toBe(true);
  });

  it("lets a shot pass other monsters unless asked otherwise", () => {
    const view = gridOf(["........"]);
    const enc = createEncounter();
    enc.monsters.push(createMonster("between", archer.id, 3, 0));
    expect(lineOfSight(view, enc, 0, 0, 7, 0)).toBe(true);
    expect(lineOfSight(view, enc, 0, 0, 7, 0, true)).toBe(false);
  });

  describe("of the party", () => {
    const tough = Object.values(MONSTERS).find((m) => m.health >= 400 && m.terrain === "land")!;
    const rows = ["#######", ".......", "#######"];
    const gateAt = (...cells: string[]): { view: GridView; gate: Set<string> } => {
      const gate = new Set(cells);
      return { gate, view: { ...gridOf(rows), obstacle: (x, y) => gate.has(`${x},${y}`) } };
    };
    const encounterWith = (...at: [string, number][]) => {
      const enc = createEncounter();
      for (const [uid, x] of at) enc.monsters.push(createMonster(uid, tough.id, x, 1));
      return enc;
    };

    it("stops an arrow at a closed gate and flies once it is open", () => {
      const party = createDefaultParty();
      const { view, gate } = gateAt("3,1");
      expect(partyAttack(party, view, encounterWith(["far", 5]), 0, 1, rng("arrow"), { kind: "ranged", targetUid: "far" })).toEqual([{ type: "denied", reason: "no_target" }]);
      gate.clear();
      const open = partyAttack(party, view, encounterWith(["far", 5]), 0, 1, rng("arrow"), { kind: "ranged", targetUid: "far" });
      expect(open.some((e) => e.type === "party_attack" && e.kind === "ranged")).toBe(true);
    });

    it("stops an attack spell at a closed gate and at a wall", () => {
      const party = createDefaultParty();
      const magic = { damage: 20, type: "fire" };
      const { view, gate } = gateAt("3,1");
      expect(partyAttack(party, view, encounterWith(["far", 5]), 0, 1, rng("spell"), { kind: "magic", targetUid: "far", magic })).toEqual([{ type: "denied", reason: "no_target" }]);
      gate.clear();
      expect(partyAttack(party, view, encounterWith(["far", 5]), 0, 1, rng("spell"), { kind: "magic", targetUid: "far", magic }).some((e) => e.type === "party_attack" && e.kind === "magic")).toBe(true);
      // a wall in the way: the same
      const walled = gridOf(["#######", "...#...", "#######"]);
      expect(partyAttack(party, walled, encounterWith(["far", 5]), 0, 1, rng("spell"), { kind: "magic", targetUid: "far", magic })).toEqual([{ type: "denied", reason: "no_target" }]);
    });

    it("lets a beam hit what is in line up to a gate, but not what is behind it", () => {
      const party = createDefaultParty();
      const magic = { damage: 20, type: "fire" };
      const { view, gate } = gateAt("4,1");
      const enc = encounterWith(["near", 2], ["behind", 5]);
      const hits = spellInLine(party, view, enc, 0, 1, rng("beam"), "near", magic, null).filter((e) => e.type === "party_attack");
      expect(hits.map((e) => (e as { uid: string }).uid)).toEqual(["near"]);
      gate.clear();
      const both = spellInLine(party, view, encounterWith(["near", 2], ["behind", 5]), 0, 1, rng("beam"), "near", magic, null).filter((e) => e.type === "party_attack");
      expect(both.map((e) => (e as { uid: string }).uid)).toEqual(["near", "behind"]);
      // a target that is itself behind the gate cannot be picked at all
      gate.add("4,1");
      expect(spellInLine(party, view, encounterWith(["behind", 5]), 0, 1, rng("beam"), "behind", magic, null)).toEqual([{ type: "denied", reason: "no_target" }]);
    });
  });

  it("keeps a monster behind a closed gate from shooting, and lets it shoot once the gate is open", () => {
    const gate = new Set(["2,1"]);
    const rows = ["#######", ".......", "#######"];
    const view: GridView = { ...gridOf(rows), walkable: (x, y) => gridOf(rows).walkable(x, y) && !gate.has(`${x},${y}`), obstacle: (x, y) => gate.has(`${x},${y}`) };
    const party = createDefaultParty();
    const enc = createEncounter();
    enc.monsters.push(createMonster("archer", archer.id, 0, 1));
    const closed = monsterTurn(party, view, enc, 4, 1, rng("gate"));
    expect(closed.some((e) => e.type === "monster_attack")).toBe(false);
    gate.clear();
    const open = monsterTurn(party, view, enc, 4, 1, rng("gate"));
    expect(open.some((e) => e.type === "monster_attack" && e.ranged)).toBe(true);
  });
});

describe("time costs", () => {
  const tough = Object.values(MONSTERS).find((m) => m.health >= 400 && m.terrain === "land")!;
  const open = ["...........", "...........", "...........", "...........", "..........."];
  const melee = { kind: "melee", targetUid: "boss" } as const;
  const bossNextToParty = () => {
    const enc = createEncounter();
    enc.monsters.push(createMonster("boss", tough.id, 6, 2));
    return enc;
  };
  /** The boss would wipe out the starting party within two rounds, and the fallen cannot act (and so cost no time). */
  const sturdyParty = (): Party => {
    const p = createDefaultParty();
    for (const c of p.characters) c.hp = 100000;
    return p;
  };

  it("takes one minute a step inside and ten outside, one minute an action everywhere", () => {
    expect(stepMinutes(false)).toBe(1);
    expect(stepMinutes(true)).toBe(10);
    expect(ACTION_MINUTES).toBe(1);
  });

  it("charges a minute for every attack, in free roam and for each hero in battle", () => {
    const party = sturdyParty();
    const view = gridOf(open);
    const enc = bossNextToParty();
    const start = party.minutes;
    partyAttack(party, view, enc, 5, 2, rng("free"), melee);
    expect(enc.battleMode).toBe(false);
    expect(party.minutes).toBe(start + ACTION_MINUTES);
    // in battle mode every hero acts on his or her own: a round of four is four minutes, not one
    updateBattleMode(enc, 5, 2);
    expect(enc.battleMode).toBe(true);
    for (let i = 0; i < party.characters.length; i++) partyAttack(party, view, enc, 5, 2, rng(`battle${i}`), melee);
    expect(party.minutes).toBe(start + ACTION_MINUTES * (1 + party.characters.length));
  });

  it("charges nothing for an attack that was refused", () => {
    const party = bareParty();
    const enc = createEncounter();
    enc.monsters.push(createMonster("near", tough.id, 4, 0));
    const start = party.minutes;
    expect(partyAttack(party, gridOf(["..........."]), enc, 0, 0, rng("denied"), { kind: "ranged", targetUid: "near" })[0]).toMatchObject({ type: "denied" });
    expect(partyAttack(party, gridOf(["..........."]), enc, 0, 0, rng("denied"), { kind: "melee", targetUid: "gone" })[0]).toMatchObject({ type: "denied" });
    expect(party.minutes).toBe(start);
  });

  it("charges a minute for a spell that heals, buffs or flies along a line", () => {
    const party = sturdyParty();
    const enc = bossNextToParty();
    const start = party.minutes;
    spellRound(party, gridOf(open), enc, 5, 2, rng("heal"));
    expect(party.minutes).toBe(start + ACTION_MINUTES);
    spellInLine(party, gridOf(open), enc, 5, 2, rng("beam"), "boss", { damage: 20, type: "fire" }, null);
    expect(party.minutes).toBe(start + 2 * ACTION_MINUTES);
  });

  it("reports a spell that runs out while the action takes its minute", () => {
    const party = createDefaultParty();
    addEffect(party, { kind: "light", until: party.minutes + ACTION_MINUTES });
    const events = spellRound(party, gridOf(open), createEncounter(), 5, 2, rng("fade"));
    expect(events).toContainEqual({ type: "effects_ended", effects: [{ kind: "light", until: party.minutes }] });
    expect(hasEffect(party, "light")).toBe(false);
    // without anything running out the log stays quiet
    expect(spellRound(party, gridOf(open), createEncounter(), 5, 2, rng("quiet")).some((e) => e.type === "effects_ended")).toBe(false);
  });
});

describe("party clock and rest", () => {
  it("expires effects, eats one ration per day and blocks resting without food", () => {
    const party = createDefaultParty();
    addEffect(party, { kind: "light", until: party.minutes + 240 });
    expect(hasEffect(party, "light")).toBe(true);
    advanceTime(party, 239);
    expect(hasEffect(party, "light")).toBe(true);
    const r = advanceTime(party, 2);
    expect(r.expired.map((e) => e.kind)).toEqual(["light"]);
    expect(hasEffect(party, "light")).toBe(false);
    const food = party.food;
    advanceTime(party, 1440 * 2);
    expect(party.food).toBe(food - 2);
    party.food = 0;
    expect(rest(party)).toEqual({ ok: false, reason: "no_food" });
  });

  it("heals everybody on rest and wakes the knocked out", () => {
    const party = createDefaultParty();
    party.characters[0]!.hp = 1;
    party.characters[1]!.conditions = ["Unconscious"];
    party.characters[1]!.hp = -2;
    expect(rest(party)).toMatchObject({ ok: true });
    expect(party.characters[0]!.hp).toBe(party.characters[0]!.health);
    expect(party.characters[1]!.conditions).toEqual(["Healthy"]);
    expect(party.characters[1]!.hp).toBe(party.characters[1]!.health);
  });

  it("serializes to JSON and back without loss", () => {
    const party = createDefaultParty();
    giveItem(party, generateItem(rng("save"), 3));
    addEffect(party, { kind: "protection", until: 999, element: "ice", amount: 4 });
    expect(JSON.parse(JSON.stringify(party))).toEqual(party);
  });

  it("hands items out with unique ids and reports a full party", () => {
    const party = createDefaultParty();
    const ids = new Set<string>();
    let placed = 0;
    for (let i = 0; i < 100; i++) {
      const item = makeItem({ name: `x${i}`, type: "club" });
      if (giveItem(party, item)) {
        placed++;
        ids.add(item.id);
      }
    }
    expect(placed).toBe(80); // 4 characters x 20 bag slots
    expect(ids.size).toBe(80);
  });
});

describe("spells", () => {
  function caster(): { party: Party; r: Rng } {
    const party = createDefaultParty();
    party.characters[3]!.spells = [1, 3, 4, 6, 7, 12, 17, 19, 20, 21, 34, 2, 13, 11, 35];
    party.characters[3]!.sp = 100;
    party.characters[3]!.mana = 100;
    return { party, r: rng("spell") };
  }

  it("fizzles for unknown, unaffordable and unimplemented spells without charging mana", () => {
    const { party, r } = caster();
    const c = party.characters[3]!;
    expect(castSpell(party, 3, 99, r)).toMatchObject({ kind: "fizzle", reason: "unknown" });
    expect(castSpell(party, 3, 8, r)).toMatchObject({ kind: "fizzle", reason: "not_known" });
    expect(c.sp).toBe(100);
    c.sp = 0;
    expect(castSpell(party, 3, 3, r)).toMatchObject({ kind: "fizzle", reason: "mana" });
    c.sp = 100;
    c.conditions = ["Paralyzed"];
    expect(castSpell(party, 3, 3, r)).toMatchObject({ kind: "fizzle", reason: "cannot_act" });
  });

  it("rolls attack spells with the right element and charges mana", () => {
    const { party, r } = caster();
    const result = castSpell(party, 3, 3, r); // Elemental Arrow 8-8 acid/ice/fire
    expect(result).toMatchObject({ kind: "attack", damage: 8, penetrate: false, undead: null });
    expect(["acid", "ice", "fire"]).toContain((result as { type: string }).type);
    expect(party.characters[3]!.sp).toBe(100 - 2);
    expect(castSpell(party, 3, 19, r)).toMatchObject({ kind: "attack", undead: true, type: "fire", penetrate: true });
    // Pain hits the living and the dead alike since the spell sheet dropped "Doesn't affect undead"
    expect(castSpell(party, 3, 12, r)).toMatchObject({ kind: "attack", undead: null, type: "physical" });
  });

  it("heals up to maximum health and revives the knocked out", () => {
    const { party, r } = caster();
    const target = party.characters[0]!;
    target.hp = 3;
    expect(castSpell(party, 3, 4, r, { target: 0 })).toMatchObject({ kind: "heal", target: 0, amount: 6 });
    expect(target.hp).toBe(9);
    target.conditions = ["Unconscious"];
    target.hp = -1;
    castSpell(party, 3, 7, r, { target: 0 }); // Cure Wounds heals 15: -1 + 15 = 14, below the maximum of 16
    expect(target.conditions).toEqual(["Healthy"]);
    expect(target.hp).toBe(14);
    expect(castSpell(party, 3, 4, r)).toMatchObject({ kind: "fizzle", reason: "needs_target" });
  });

  it("cures conditions and applies timed buffs", () => {
    const { party, r } = caster();
    party.characters[1]!.conditions = ["Poisoned", "Weak"];
    // Suppress Poison only sets the clock back; Cure Poison takes the condition away
    expect(castSpell(party, 3, 11, r, { target: 1 })).toMatchObject({ kind: "suppress", condition: "Poisoned" });
    expect(party.characters[1]!.conditions).toEqual(["Poisoned", "Weak"]);
    expect(castSpell(party, 3, 35, r, { target: 1 })).toMatchObject({ kind: "cure", removed: ["Poisoned"] });
    expect(party.characters[1]!.conditions).toEqual(["Weak"]);
    castSpell(party, 3, 6, r);
    expect(hasEffect(party, "light")).toBe(true);
    expect(castSpell(party, 3, 17, r)).toMatchObject({ kind: "fizzle", reason: "needs_element" });
    castSpell(party, 3, 17, r, { element: "acid" });
    expect(protectionLevel(party, "acid")).toBe(1);
    castSpell(party, 3, 34, r);
    expect(hasEffect(party, "walk_on_water")).toBe(true);
    // spell 20 is Stone Skin now (the old Blessed spell was replaced by the spell sheet): armor for speed, twelve hours
    castSpell(party, 3, 20, r, { target: 0 });
    expect(party.characters[0]!.mods?.stoneSkin).toBe(1);
    advanceTime(party, 12 * 60 + 1);
    expect(party.characters[0]!.mods?.stoneSkin).toBeUndefined();
  });

  it("implements every spell of the spell sheet", () => {
    for (let id = 1; id <= 78; id++) expect(isSpellImplemented(id), `spell ${id}`).toBe(true);
    expect(isSpellImplemented(79)).toBe(false);
  });

  describe("learning (guild and scrolls: the old handle_right_click)", () => {
    const hero = (classType: "Wizard" | "Archer" | "Cleric" | "Paladin" | "Druid" | "Ranger" | "Knight" | "Ninja" | "Thief" | "Barbarian", level = 1) => {
      const c = createCharacter({ name: classType, classType, raceType: "Human", avatar: "character01", attrs: { str: 10, int: 10, per: 10, end: 10, spd: 10, acc: 10, lck: 10 } });
      c.level = level;
      return c;
    };
    const only = (school: string) => Object.values(SPELLS).find((s) => s.type.length === 1 && s.type[0] === school && s.level > 1)!;

    it("assigns one school to each magic class and none to the others", () => {
      expect(SPELL_SCHOOL).toEqual({ Wizard: "Arcane", Archer: "Arcane", Cleric: "Clerical", Paladin: "Clerical", Druid: "Nature", Ranger: "Nature" });
      for (const c of ["Knight", "Ninja", "Thief", "Barbarian"] as const) {
        for (const s of Object.values(SPELLS)) expect(learnBlock(hero(c, 40), s.id), `${c} spell ${s.id}`).toBe("class");
        expect(learnableSpells(hero(c, 40))).toEqual([]);
      }
    });

    it("lets a class learn only spells of its school", () => {
      const arcane = only("Arcane");
      const clerical = only("Clerical");
      const nature = only("Nature");
      const level = 40;
      for (const c of ["Wizard", "Archer"] as const) {
        expect(learnBlock(hero(c, level), arcane.id)).toBeNull();
        expect(learnBlock(hero(c, level), clerical.id)).toBe("class");
        expect(learnBlock(hero(c, level), nature.id)).toBe("class");
      }
      for (const c of ["Cleric", "Paladin"] as const) {
        expect(learnBlock(hero(c, level), clerical.id)).toBeNull();
        expect(learnBlock(hero(c, level), arcane.id)).toBe("class");
      }
      for (const c of ["Druid", "Ranger"] as const) {
        expect(learnBlock(hero(c, level), nature.id)).toBeNull();
        expect(learnBlock(hero(c, level), clerical.id)).toBe("class");
      }
    });

    it("also asks for the spell's level and refuses spells the hero knows", () => {
      const spell = only("Arcane");
      const wizard = hero("Wizard", spell.level - 1);
      expect(learnBlock(wizard, spell.id)).toBe("level");
      wizard.level = spell.level;
      expect(learnBlock(wizard, spell.id)).toBeNull();
      wizard.spells.push(spell.id);
      expect(learnBlock(wizard, spell.id)).toBe("known");
    });

    it("keeps the guild from teaching a hero a spell of another class, and from charging for it", () => {
      const party = createDefaultParty(); // Knight, Ninja, Archer, Druid
      party.gold = 100000;
      const nature = Object.values(SPELLS).find((s) => s.type.length === 1 && s.type[0] === "Nature" && s.level === 1 && isSpellImplemented(s.id));
      const target = nature ?? Object.values(SPELLS).find((s) => s.type.includes("Nature") && s.level === 1 && isSpellImplemented(s.id))!;
      expect(learnSpell(party, 0, target.id)).toMatchObject({ ok: false, reason: "cannot" }); // the Knight
      expect(party.gold).toBe(100000);
      expect(party.characters[0]!.spells).toEqual([]);
    });
  });
});

describe("action handlers", () => {
  const rootSeed = seedFromString("handlers");
  const ctxFor = (party: Party, attempt = 0): ActionContext => ({ party, rootSeed, attempt, monsterThemes: { beast: 1 }, tier: 2 });
  const act = (kind: ActionInstance["kind"], params: ActionInstance["params"], uid = `m#${kind}:0`): ActionInstance => ({ uid, kind, x: 1, y: 1, params });

  it("opens a chest once: gold and items, same loot for the same chest", () => {
    const a = createDefaultParty();
    const b = createDefaultParty();
    const startGold = a.gold;
    const chest = act("treasure", { level: 3, gold: 120, items: 2 }, "m#chest:1");
    const ra = resolveAction(chest, ctxFor(a));
    const rb = resolveAction(chest, ctxFor(b));
    expect(a.gold).toBe(startGold + 120);
    expect(ra.consumed).toBe(true);
    expect(ra.effects.filter((e) => e.type === "item")).toHaveLength(2);
    expect(JSON.stringify(ra.effects)).toBe(JSON.stringify(rb.effects));
  });

  it("an empty chest says so", () => {
    const r = resolveAction(act("treasure", { level: 1, gold: 0, items: 0 }), ctxFor(createDefaultParty()));
    expect(r.effects).toEqual([{ type: "text", text: "The chest is empty." }]);
  });

  it("lets a skilled thief pick a lock but keeps the door closed otherwise", () => {
    const party = createDefaultParty();
    const easy = resolveAction(act("door", { locked: true, difficulty: 1 }, "m#door:0"), ctxFor(party));
    expect(easy.effects[0]).toEqual({ type: "door", state: "unlocked" });
    expect(easy.consumed).toBe(true);
    const hard = resolveAction(act("door", { locked: true, difficulty: 999 }, "m#door:1"), ctxFor(party));
    expect(hard.effects[0]).toEqual({ type: "door", state: "locked" });
    expect(hard.consumed).toBe(false);
    expect(resolveAction(act("door", { locked: false }), ctxFor(party)).effects[0]).toEqual({ type: "door", state: "opened" });
  });

  it("rolls a different lock attempt each time but repeats the same attempt", () => {
    const party = createDefaultParty();
    const door = act("door", { locked: true, difficulty: 4 }, "m#door:7");
    const outcomes = Array.from({ length: 40 }, (_, i) => resolveAction(door, ctxFor(party, i)).consumed);
    expect(outcomes.some(Boolean)).toBe(true);
    expect(outcomes.some((o) => !o)).toBe(true);
    expect(resolveAction(door, ctxFor(party, 5)).consumed).toBe(outcomes[5]);
  });

  it("traps hurt, can knock out and can steal gold", () => {
    const party = createDefaultParty();
    const hurt = resolveAction(act("trap", { trap: "spring", damage: 5 }, "m#trap:0"), ctxFor(party));
    expect(hurt.effects.some((e) => e.type === "damage")).toBe(true);
    expect(party.characters.reduce((s, c) => s + (c.health - c.hp), 0)).toBe(5);
    const gold = party.gold;
    const steal = resolveAction(act("trap", { trap: "steal_gold", damage: 0 }, "m#trap:1"), ctxFor(party));
    expect(party.gold).toBeLessThan(gold);
    expect(steal.consumed).toBe(true);
  });

  it("ambushes bring monsters of the map's family and level", () => {
    const party = createDefaultParty();
    const r = resolveAction(act("ambush", { group: 3 }, "m#ambush:0"), ctxFor(party));
    const ambush = r.effects.find((e) => e.type === "ambush") as { monsterIds: number[] };
    expect(ambush.monsterIds).toHaveLength(3);
    for (const id of ambush.monsterIds) expect(MONSTERS[id]!.terrain).toBe("land");
  });

  it("shrines give a permanent bonus once; a breakable wall is only seen by a party that is Perceptive and breaks when asked", () => {
    const party = createDefaultParty();
    const before = JSON.stringify(party.characters);
    const shrine = resolveAction(act("shrine", { effect: "attribute", amount: 1 }, "m#shrine:0"), ctxFor(party));
    expect(shrine.consumed).toBe(true);
    expect(JSON.stringify(party.characters)).not.toBe(before);
    // without the talent it is a wall like any other: nothing is asked, nothing happens
    expect(resolveAction(act("breakable_wall", {}), ctxFor(party)).effects).toEqual([]);
    party.talents.push("talent_perceptive");
    const asked = resolveAction(act("breakable_wall", {}), ctxFor(party));
    expect(asked.effects[0]).toMatchObject({ type: "confirm", question: expect.stringContaining("looks brittle") });
    expect(asked.consumed).toBe(false);
    // declined: the wall stays; accepted: it breaks, once
    const declined = resolveAction(act("breakable_wall", {}), { ...ctxFor(party), answer: null });
    expect(declined.effects).toEqual([]);
    const broken = resolveAction(act("breakable_wall", {}), { ...ctxFor(party), answer: "yes" });
    expect(broken.effects[0]).toEqual({ type: "wall", state: "broken" });
    expect(broken.consumed).toBe(true);
  });

  it("passes transfers and services through unchanged", () => {
    const party = createDefaultParty();
    expect(resolveAction(act("transfer", { mode: "poi_exit", tier: 3 }), ctxFor(party)).effects[0]).toEqual({ type: "transfer", mode: "poi_exit", tier: 3 });
    expect(resolveAction(act("service", { service: "inn", tier: 2 }), ctxFor(party)).effects[0]).toEqual({ type: "service", service: "inn", tier: 2 });
    expect(resolveAction(act("lore", { pool: "town", line: 2 }), ctxFor(party)).effects[0]).toMatchObject({ type: "text" });
  });
});
