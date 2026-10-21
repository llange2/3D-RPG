import type { Rng } from "../core/rng";
import { CONSTANTS, MONSTERS, type MonsterDef } from "../data/tables";
import { addCondition, armor, canAct, getBaseValue, itemBonus, pyRound, removeCondition } from "./character";
import { cheats } from "./cheats";
import { protectionLevel } from "./party";
import type { Character, Condition, Party } from "./types";

export type DamageType = "physical" | "fire" | "ice" | "acid" | "magic" | "poison";

/** Monster condition names as written in `special_abilties` ("Causes Poisoned"). */
const SPECIAL_CONDITIONS: Record<string, Condition> = {
  Poisoned: "Poisoned",
  Sleeping: "Sleeping",
  Weak: "Weak",
  Crazy: "Crazy",
  Cursed: "Cursed",
  Diseased: "Diseased",
  Paralyzed: "Paralyzed",
  Petrified: "Petrified",
  Dead: "Dead",
  Unconscious: "Unconscious",
  Eradication: "Rotten",
};

/** The condition a monster's special attack inflicts, parsed like the old code: the word after "Causes". */
export function specialCondition(monster: MonsterDef): Condition | null {
  const text = monster.special_abilties ?? "";
  const at = text.indexOf("Causes");
  if (at < 0) return null;
  const word = text.slice(at + "Causes".length).trim().split(/\s+/)[0]?.replace(/[,.;:]+$/g, "") ?? "";
  return SPECIAL_CONDITIONS[word] ?? null;
}

const STANCE = () => 1 - CONSTANTS.STANCE_MODIFIER;

/** Melee damage of a character against a monster (armor reduces it). Port of calculate_character_damage("Melee"). */
export function meleeDamage(c: Character, monster: MonsterDef | null, rng: Rng): number {
  if (!canAct(c)) return 0;
  const base = c.str / 10 + getBaseValue(c.raceType, c.classType, "base_melee");
  const min = itemBonus(c, "dam_min");
  const max = itemBonus(c, "dam_max");
  let weapon = rng.range(Math.min(min, max), Math.max(min, max));
  if (weapon === 0) weapon = 1;
  let total = Math.ceil(base * c.level + weapon);
  if (c.defensiveStance) total = Math.trunc(total * STANCE());
  if (monster && monster.armor > 0) total = Math.max(0, total - monster.armor);
  return Math.trunc(total);
}

/** Ranged damage; the hit chance falls with distance and monster speed. Port of calculate_character_damage("Ranged"). */
export function rangedDamage(c: Character, monster: MonsterDef | null, distance: number, rng: Rng): number {
  if (!canAct(c)) return 0;
  let hitChance = 1;
  if (monster && monster.speed > 0 && distance > 0) hitChance = Math.min(1, Math.max(0, c.acc / (monster.speed * distance * 0.5)));
  if (!(rng.float() <= hitChance)) return 0;
  const min = itemBonus(c, "ranged_dam_min");
  const max = itemBonus(c, "ranged_dam_max");
  const weapon = rng.range(Math.min(min, max), Math.max(min, max));
  const base = c.acc / 10 + getBaseValue(c.raceType, c.classType, "base_ranged");
  let total = Math.ceil(base * c.level + weapon);
  if (c.defensiveStance) total = Math.trunc(total * STANCE());
  if (monster && monster.armor > 0) total = Math.max(0, total - Math.trunc(monster.armor / 2));
  return Math.trunc(total);
}

/** Damage of a spell against a monster: resisted share is subtracted (monster resistances are fractions). */
export function spellDamageToMonster(monster: MonsterDef, damage: number, type: string): number {
  const key = `res_${type}` as keyof MonsterDef;
  const res = typeof monster[key] === "number" ? (monster[key] as number) : 0;
  return damage - Math.trunc(damage * res);
}

const ELEMENT_RESIST: Record<string, "resFire" | "resIce" | "resAcid" | "resMagic"> = {
  fire: "resFire",
  ice: "resIce",
  acid: "resAcid",
  magic: "resMagic",
};

/**
 * What is left of an elemental hit on `target`: reduced by the resistance in percent, then by flat spell protection and the Fairy
 * mascot, never below 0 (the old apply_trap_damage and calculate_monster_damage do the same).
 */
export function elementalDamage(party: Party, target: Character, element: "acid" | "fire" | "ice" | "magic", damage: number): number {
  let total = pyRound(damage * (1 - target[ELEMENT_RESIST[element]!] / 100));
  total -= protectionLevel(party, element);
  if (party.mascot === "Fairy") total -= CONSTANTS.MASCOT_FAIRY_ELEMENTAL_DAMAGE_REDUCTION;
  return Math.max(0, total);
}

/**
 * Damage of one monster attack on one character. Port of calculate_monster_damage: elemental attacks are reduced by the
 * character's resistance in percent, then by flat spell protection and the Fairy mascot; physical attacks by armor;
 * poison is not reduced at all (the old code has no case for it). Ninjas evade.
 */
export function monsterDamage(party: Party, monster: MonsterDef, target: Character, ranged: boolean, distance: number, rng: Rng): number {
  const type = monster.attack_type.toLowerCase() as DamageType;
  const hitChance = ranged
    ? distance > 0
      ? Math.min(1, Math.max(0, monster.speed / (target.spd * distance * (target.classType === "Ninja" ? 0.75 : 0.5))))
      : 1
    : 1;
  const hit = ranged ? (rng.float() <= hitChance ? 1 : 0) : 1;
  let total = rng.range(Math.min(monster.damage_min, monster.damage_max), Math.max(monster.damage_min, monster.damage_max));

  if (ELEMENT_RESIST[type]) {
    // a missed shot does no damage at all, whatever the protection takes off
    total = elementalDamage(party, target, type as "acid" | "fire" | "ice" | "magic", total) * hit;
  } else if (type === "physical") {
    const arm = armor(target);
    if (arm > 0) total = Math.max(0, total - arm * hit);
    if (ranged) total = Math.max(0, total - Math.trunc(arm / 2));
  } else {
    total *= hit;
  }

  if (!ranged && target.classType === "Ninja" && rng.float() < 0.1) total = 0;
  if (ranged && target.defensiveStance) return Math.trunc(total * STANCE());
  return Math.trunc(total);
}

export interface HitResult {
  damage: number;
  /** New condition the hit caused (special attack or going down). */
  conditions: Condition[];
  /** True when no character in the party can act any more. */
  defeated: boolean;
}

/**
 * Applies damage to a character. Port of apply_damage_to_character:
 * a hit wakes a sleeping character; a special attack lands with probability 10 / (luck² · 0.05);
 * at 0 HP the character dies if the hit was more than half of the maximum or HP is below -1/3 of it, else is knocked out.
 */
export function applyHit(party: Party, index: number, damage: number, monster: MonsterDef | null, rng: Rng, force = false): HitResult {
  const c = party.characters[index]!;
  const added: Condition[] = [];
  // debug menu, god mode: nothing hurts and nothing sticks
  if (cheats.god) return { damage: 0, conditions: added, defeated: false };
  if (damage > 0) c.hp -= damage;

  if (c.conditions.includes("Sleeping") && damage > 0) {
    removeCondition(c, "Sleeping");
  }

  const special = monster ? specialCondition(monster) : null;
  if (special) {
    const chance = 10 / (c.lck * c.lck * 0.05);
    if ((damage > 0 && rng.float() < chance) || force) {
      addCondition(c, special, party.minutes);
      added.push(special);
    }
  }

  if (c.hp <= 0 && !c.conditions.includes("Dead")) {
    const killed = damage > Math.floor(c.health / 2) || c.hp <= -Math.floor(c.health / 3);
    const cond: Condition = killed ? "Dead" : "Unconscious";
    addCondition(c, cond, party.minutes);
    added.push(cond);
  }

  const anyAlive = party.characters.some((x) => canAct(x));
  return { damage, conditions: added, defeated: !anyAlive };
}

export function monsterById(id: number): MonsterDef {
  const m = MONSTERS[id];
  if (!m) throw new Error(`unknown monster ${id}`);
  return m;
}
