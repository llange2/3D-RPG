import type { Rng } from "../core/rng";
import { CONSTANTS, MONSTERS, type MonsterDef } from "../data/tables";
import { fairyReduction, isV4, RULES } from "./balance";
import { addCondition, anyoneLeft, armor, attr, canAct, equippedItems, fightSpeed, getBaseValue, isRifted, itemBonus, pyRound, removeCondition, resistance } from "./character";
import { cheats } from "./cheats";
import { sumBonus } from "./items";
import { hasEffect, protectionLevel } from "./party";
import type { Character, Condition, Party } from "./types";

export type DamageType = "physical" | "fire" | "ice" | "acid" | "magic" | "poison";

/** The conditions a monster's hit can cause, from the sheet's status columns (a Medusa petrifies and kills). */
export function specialConditions(monster: MonsterDef): Condition[] {
  return monster.causes as Condition[];
}

/** The first condition its special attack inflicts, null when it has none. */
export function specialCondition(monster: MonsterDef): Condition | null {
  return specialConditions(monster)[0] ?? null;
}

const STANCE = () => 1 - CONSTANTS.STANCE_MODIFIER;

/** Melee damage of a character against a monster (armor reduces it). Port of calculate_character_damage("Melee"). */
export function meleeDamage(c: Character, monster: MonsterDef | null, rng: Rng): number {
  if (!canAct(c)) return 0;
  const base = attr(c, "str") / 10 + getBaseValue(c.raceType, c.classType, "base_melee");
  const min = itemBonus(c, "dam_min");
  const max = itemBonus(c, "dam_max");
  let weapon = rng.range(Math.min(min, max), Math.max(min, max));
  if (weapon === 0) weapon = 1;
  // BALANCE v4: the level term counts a third (`weapon + base × level / 3`); LEGACY (balance v4): `base × level + weapon`
  let total = Math.ceil(isV4() ? weapon + (base * c.level) / RULES.v4.meleeLevelDivisor : base * c.level + weapon) + (c.mods?.rage ?? 0);
  if (c.defensiveStance) total = Math.trunc(total * STANCE());
  if (monster && monster.armor > 0) total -= monster.armor;
  // BALANCE v4: what the monster's physical resistance (sheet column, 0 to 1) holds back is taken off after the armor
  if (isV4() && monster) total *= 1 - monster.res_physical;
  // a weak hero (Wizard with Strength 7) must never heal the monster, whatever its armor
  return Math.max(0, Math.trunc(total));
}

/** Damage that rings and affixes add (they carry `dam_min/max` only); the bow has its own `ranged_dam_*`. */
export function ringDamage(c: Character, key: "dam_min" | "dam_max"): number {
  return sumBonus(equippedItems(c).filter((item) => item?.type === "ring"), key);
}

/** Ranged damage; the hit chance falls with distance and monster speed. Port of calculate_character_damage("Ranged"). */
export function rangedDamage(c: Character, monster: MonsterDef | null, distance: number, rng: Rng): number {
  if (!canAct(c)) return 0;
  let hitChance = 1;
  const acc = attr(c, "acc");
  // BALANCE v4: no factor 0.5 any more (`ACC / (speed × distance)`); LEGACY (balance v4): factor 0.5, i.e. twice the chance
  const rules = isV4() ? RULES.v4 : RULES.legacy;
  const hitFactor = rules.rangedHitFactor;
  if (monster && monster.speed > 0 && distance > 0) hitChance = Math.min(1, Math.max(0, acc / (monster.speed * distance * hitFactor)));
  // BALANCE v4 (ranged): next to the monster the bow hits only half as often (the sword is the better weapon there)
  if (distance === 1) hitChance *= rules.rangedPointBlank;
  if (!(rng.float() <= hitChance)) return 0;
  const min = itemBonus(c, "ranged_dam_min") + ringDamage(c, "dam_min");
  const max = itemBonus(c, "ranged_dam_max") + ringDamage(c, "dam_max");
  const weapon = rng.range(Math.min(min, max), Math.max(min, max));
  // BALANCE v4: only 0.8 of the class value counts for the bow (the Archer's 5 was higher than any melee class)
  const classShare = isV4() ? RULES.v4.rangedClassShare : RULES.legacy.rangedClassShare;
  const base = acc / 10 + getBaseValue(c.raceType, c.classType, "base_ranged") * classShare;
  // BALANCE v4 (ranged): the level term counts 1 / 1.5 (the sword's counts a third); LEGACY (balance v4): divisor 1
  let total = Math.ceil((base * c.level) / rules.rangedLevelDivisor + weapon) + (c.mods?.rage ?? 0);
  if (c.defensiveStance) total = Math.trunc(total * STANCE());
  if (monster && monster.armor > 0) total -= Math.trunc(monster.armor / 2);
  // BALANCE v4 (ranged): the physical resistance holds the arrow back as it holds the sword back (after the armor, like in `meleeDamage`)
  if (rules.rangedResPhysical && monster) total *= 1 - monster.res_physical;
  return Math.max(0, Math.trunc(total));
}

/** Power Shield takes this share off every hit the party suffers. */
export const POWER_SHIELD_REDUCTION = 0.1;

/** Damage of a spell against a monster: resisted share is subtracted (monster resistances are fractions). */
export function spellDamageToMonster(monster: MonsterDef, damage: number, type: string): number {
  const key = `res_${type}` as keyof MonsterDef;
  const res = typeof monster[key] === "number" ? (monster[key] as number) : 0;
  return damage - Math.trunc(damage * res);
}

const ELEMENTS = new Set(["fire", "ice", "acid", "magic"]);

/**
 * What is left of an elemental hit on `target`: reduced by the resistance in percent (worn items count), then by flat spell
 * protection and the Fairy mascot, never below 0 (the old apply_trap_damage and calculate_monster_damage do the same).
 */
export function elementalDamage(party: Party, target: Character, element: "acid" | "fire" | "ice" | "magic", damage: number): number {
  let total = pyRound(damage * (1 - resistance(target, element) / 100));
  total -= protectionLevel(party, element);
  // BALANCE v4: the Fairy takes 30 off (the old game's constant is 20; the generated constants.json stays untouched)
  if (party.mascot === "Fairy") total -= fairyReduction(CONSTANTS.MASCOT_FAIRY_ELEMENTAL_DAMAGE_REDUCTION);
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
      ? Math.min(1, Math.max(0, monster.speed / (fightSpeed(target) * distance * (target.classType === "Ninja" ? 0.75 : 0.5))))
      : 1
    : 1;
  const hit = ranged ? (rng.float() <= hitChance ? 1 : 0) : 1;
  let total = rng.range(Math.min(monster.damage_min, monster.damage_max), Math.max(monster.damage_min, monster.damage_max));

  // a missed shot does no damage at all, whatever the armor or protection takes off (the old code let a physical miss through in full)
  if (!hit) return 0;

  if (ELEMENTS.has(type)) {
    total = elementalDamage(party, target, type as "acid" | "fire" | "ice" | "magic", total);
  } else if (type === "physical") {
    const arm = armor(target);
    if (ranged && isV4()) {
      // BALANCE v4 (ranged): the armor counts half against a shot, like the monster's armor against the heroes' bows, and a quarter of the
      // roll always gets through; LEGACY (balance v4): the armor and half of it again, down to 0
      total = Math.max(Math.trunc(RULES.v4.monsterShotFloor * total), total - Math.trunc(arm * RULES.v4.monsterShotArmor));
    } else {
      if (arm > 0) total = Math.max(0, total - arm);
      if (ranged) total = Math.max(0, total - Math.trunc(arm / 2));
    }
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
  /** Spell points the hit took away (Mystic cloud, Vampire). */
  drained?: number;
  /** Years the hit added to the hero's magical age (Ghost, Phantom). */
  aged?: number;
}

/**
 * Applies damage to a character. Port of apply_damage_to_character:
 * a hit wakes a sleeping character; a special attack lands with probability 10 / (luck² · 0.05), 5 / … for Dead and Rotten;
 * at 0 HP the character dies if the hit was more than half of the maximum or HP is below -1/3 of it, else is knocked out.
 */
export function applyHit(party: Party, index: number, damage: number, monster: MonsterDef | null, rng: Rng, force = false): HitResult {
  const c = party.characters[index]!;
  const added: Condition[] = [];
  // debug menu, god mode: nothing hurts and nothing sticks
  if (cheats.god) return { damage: 0, conditions: added, defeated: false };
  // nothing can hit a hero in the Dimensional Rift
  if (isRifted(c)) return { damage: 0, conditions: added, defeated: false };
  if (damage > 0 && hasEffect(party, "power_shield")) damage = Math.trunc(damage * (1 - POWER_SHIELD_REDUCTION));
  if (damage > 0) c.hp -= damage;

  if (c.conditions.includes("Sleeping") && damage > 0) {
    removeCondition(c, "Sleeping");
  }

  let drained = 0;
  let aged = 0;
  if (monster) {
    for (const special of specialConditions(monster)) {
      const luck = attr(c, "lck");
      // being killed or rotted outright is half as likely as the other conditions
      const chance = (special === "Dead" || special === "Rotten" ? 5 : 10) / (luck * luck * 0.05);
      if ((damage > 0 && rng.float() < chance) || force) {
        addCondition(c, special, party.minutes);
        added.push(special);
      }
    }
    if (damage > 0 && monster.steal_mana > 0) {
      drained = Math.min(c.sp, Math.ceil(c.mana * monster.steal_mana));
      c.sp -= drained;
    }
    if (damage > 0 && monster.aging_years > 0) {
      c.magicAge = (c.magicAge ?? 0) + monster.aging_years;
      aged = monster.aging_years;
    }
  }

  if (c.hp <= 0 && !c.conditions.includes("Dead")) {
    const killed = damage > Math.floor(c.health / 2) || c.hp <= -Math.floor(c.health / 3);
    const cond: Condition = killed ? "Dead" : "Unconscious";
    addCondition(c, cond, party.minutes);
    added.push(cond);
  }

  return { damage, conditions: added, defeated: !anyoneLeft(party.characters), ...(drained > 0 ? { drained } : {}), ...(aged > 0 ? { aged } : {}) };
}

export function monsterById(id: number): MonsterDef {
  const m = MONSTERS[id];
  if (!m) throw new Error(`unknown monster ${id}`);
  return m;
}
