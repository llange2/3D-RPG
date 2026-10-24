/**
 * The formulas of the fight, level and XP rules as swappable functions. `CURRENT` is a line-by-line copy of what the game does today
 * (`verify.ts` compares it with the real code in `src/sim`); a proposal is `{ ...CURRENT, ...overrides }`.
 * Nothing in here touches the game: it only reads the exported data tables.
 */
import { CONSTANTS, type MonsterDef } from "../../src/data/tables";
import type { ClassName, RaceName } from "../../src/sim/types";

export const ATTRS = ["str", "int", "per", "end", "spd", "acc", "lck"] as const;
export type Attr = (typeof ATTRS)[number];
export type Element = "fire" | "ice" | "acid" | "magic";
export type Mascot = "none" | "Crow" | "Donkey" | "Fairy" | "Orb" | "Wolf";
export const MASCOTS: Mascot[] = ["none", "Fairy", "Orb", "Wolf"];

/** Everything a formula may read about a hero. Attributes are the base values, `gear` the equipment bonuses; the game's formulas read the sum (`withGear`). */
export interface HeroStats {
  cls: ClassName;
  race: RaceName;
  level: number;
  str: number;
  int: number;
  per: number;
  end: number;
  spd: number;
  acc: number;
  lck: number;
  /** Equipment bonuses per attribute. */
  gear: Record<Attr, number>;
  /** Sum of the armor of every worn piece. */
  armor: number;
  /** Melee damage bonus of all equipment (weapon plus rings), as the game sums it. */
  damMin: number;
  damMax: number;
  /** The part of it that comes from rings and affixes (the weapon alone is `damMin - ringDamMin`). */
  ringDamMin: number;
  ringDamMax: number;
  /** Ranged damage of the bow plus the damage of the rings (rings carry `dam_min/max` only; the game adds them for the shot too). */
  rangedMin: number;
  rangedMax: number;
  classHp: number;
  raceHp: number;
  raceMana: number;
  classMelee: number;
  classRanged: number;
  /** Resistances in percent: the race's value plus what the worn items add. */
  res: Record<Element, number>;
}

/** The raw numbers a monster attack needs, rolled by the fight engine so that the formula stays a pure function. */
export interface MonsterAttackRoll {
  /** Damage roll between damage_min and damage_max. */
  damage: number;
  /** Uniform [0, 1) for the hit roll of a ranged shot. */
  hit: number;
  /** Uniform [0, 1) for the Ninja's evasion. */
  evade: number;
  ranged: boolean;
  distance: number;
  /** Points the Fairy takes off an elemental hit (0 without the Fairy). */
  fairy: number;
}

export interface Formulas {
  id: string;
  title: string;
  maxHp(h: HeroStats): number;
  maxMana(h: HeroStats, mascot: Mascot): number;
  /** Damage of one melee blow; `roll` is the weapon's damage roll. */
  meleeDamage(h: HeroStats, mon: MonsterDef, roll: number): number;
  rangedHitChance(h: HeroStats, mon: MonsterDef, distance: number): number;
  rangedDamage(h: HeroStats, mon: MonsterDef, roll: number): number;
  /** Damage one attack of a monster does to a hero. */
  monsterDamage(mon: MonsterDef, h: HeroStats, a: MonsterAttackRoll): number;
  /** Chance that a hit with a special attack ("Causes Poisoned") sticks. */
  specialChance(h: HeroStats, lethal: boolean): number;
  /** XP needed to rise from `level` to `level + 1`. */
  xpStep(cls: ClassName, level: number): number;
  /** Gold for one level. */
  trainingCost(level: number): number;
  /** The Wolf kills every monster that drops below this share of its health ... */
  wolfBelow: number;
  /** ... unless its treasure level is above this (5 = the Wolf works on everything). */
  wolfMaxTier: number;
  /** A hero at 0 hit points dies when one blow took more than this share of the maximum, or when the hit points fall below minus `deathBelow` of it (game: 1/2 and 1/3). */
  deathHit: number;
  deathBelow: number;
  /** The Orb raises the mana of a caster by this share. */
  orbMana: number;
  /** The Orb raises the damage of attack spells of every caster by this share (docs v4 proposal; 0 = the game). */
  orbSpell: number;
  /** The Fairy takes this much off every elemental hit. */
  fairyReduction: number;
  /** Multiplier on the XP a monster gives (a hook for proposals that change monster XP as a function of the monster). */
  monsterXp(mon: MonsterDef): number;
  /** Multiplier on the monster's health, damage etc. is not offered on purpose: monsters stay as they are. */
}

/** Python's round(): halves round to the even neighbour (the game uses it for health and mana). */
export function pyRound(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

const use = (h: HeroStats, a: Attr): number => Math.max(1, h[a] + h.gear[a]);

/** Mana as `recalcValues` computes it (no talents). */
export function currentMana(h: HeroStats, mascot: Mascot, orb: number): number {
  const mana = h.raceMana;
  const lvl = h.level;
  let m: number;
  switch (h.cls) {
    case "Archer":
      m = pyRound(lvl * (10 - 90 / use(h, "int") + mana));
      break;
    case "Cleric":
      m = pyRound(lvl * (25 - 250 / use(h, "per") + mana));
      break;
    case "Druid":
      m = pyRound(lvl * (25 - 500 / (use(h, "per") + use(h, "int")) + mana));
      break;
    case "Paladin":
      m = pyRound(lvl * (10 - 90 / use(h, "per") + mana));
      break;
    case "Ranger":
      m = pyRound(lvl * (10 - 180 / (use(h, "per") + use(h, "int")) + mana));
      break;
    case "Wizard":
      m = pyRound(lvl * (25 - 250 / use(h, "int") + mana));
      break;
    default:
      m = 0;
  }
  m = Math.max(0, m);
  if (mascot === "Orb" && m > 0) m = pyRound(m * (1 + orb));
  return m;
}

/** An attribute with the worn items (what `attr` in `sim/character.ts` returns); the damage formulas read this, not the bare value. */
export const withGear = (h: HeroStats, a: Attr): number => h[a] + h.gear[a];

/** What a monster hit does today (port of `monsterDamage` in `sim/combat.ts`). */
export function currentMonsterDamage(mon: MonsterDef, h: HeroStats, a: MonsterAttackRoll): number {
  const type = mon.attack_type.toLowerCase();
  const ninja = h.cls === "Ninja";
  const hitChance = a.ranged ? (a.distance > 0 ? Math.min(1, Math.max(0, mon.speed / (h.spd * a.distance * (ninja ? 0.75 : 0.5)))) : 1) : 1;
  const hit = a.ranged ? (a.hit <= hitChance ? 1 : 0) : 1;
  // a missed shot does no damage at all
  if (!hit) return 0;
  let total = a.damage;
  if (type === "fire" || type === "ice" || type === "acid" || type === "magic") {
    const res = h.res[type];
    let t = pyRound(total * (1 - res / 100));
    t -= a.fairy;
    total = Math.max(0, t);
  } else if (type === "physical") {
    const arm = h.armor;
    if (arm > 0) total = Math.max(0, total - arm);
    if (a.ranged) total = Math.max(0, total - Math.trunc(arm / 2));
  }
  if (!a.ranged && ninja && a.evade < 0.1) total = 0;
  return Math.trunc(total);
}

export const CURRENT: Formulas = {
  id: "current",
  title: "Aktueller Stand des Spiels",
  maxHp(h) {
    let calc = use(h, "end") / 2 + h.classHp + h.raceHp;
    if (calc <= 0) calc = 1;
    return pyRound(h.level * calc);
  },
  maxMana(h, mascot) {
    return currentMana(h, mascot, this.orbMana);
  },
  meleeDamage(h, mon, roll) {
    const base = withGear(h, "str") / 10 + h.classMelee;
    let total = Math.ceil(base * h.level + (roll === 0 ? 1 : roll));
    if (mon.armor > 0) total -= mon.armor;
    return Math.max(0, Math.trunc(total));
  },
  rangedHitChance(h, mon, distance) {
    if (mon.speed > 0 && distance > 0) return Math.min(1, Math.max(0, withGear(h, "acc") / (mon.speed * distance * 0.5)));
    return 1;
  },
  rangedDamage(h, mon, roll) {
    const base = withGear(h, "acc") / 10 + h.classRanged;
    let total = Math.ceil(base * h.level + roll);
    if (mon.armor > 0) total -= Math.trunc(mon.armor / 2);
    return Math.max(0, Math.trunc(total));
  },
  monsterDamage: currentMonsterDamage,
  specialChance: (h, lethal) => (lethal ? 5 : 10) / (withGear(h, "lck") ** 2 * 0.05),
  xpStep(cls, level) {
    const base = CONSTANTS.CHARACTER_XP[cls] ?? 2000;
    return level <= 10 ? 2 ** (level - 1) * base : 1_024_000;
  },
  trainingCost: (level) => level * 250,
  wolfBelow: 0.9,
  wolfMaxTier: 5,
  deathHit: 1 / 2,
  deathBelow: 1 / 3,
  orbMana: 0.2,
  orbSpell: 0,
  fairyReduction: CONSTANTS.MASCOT_FAIRY_ELEMENTAL_DAMAGE_REDUCTION,
  monsterXp: () => 1,
};

/** Cumulative XP a hero needs to stand on `level` (level 1 needs 0). */
export function xpForLevel(F: Formulas, cls: ClassName, level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += F.xpStep(cls, l);
  return total;
}
