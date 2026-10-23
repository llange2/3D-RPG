/**
 * A parametric family of formulas around `CURRENT`: with `DEFAULT_PARAMS` it is exactly the game, every parameter bends one place.
 * The search (`search.ts`) looks for parameters; `proposals.ts` lists the rounded results as named proposals.
 */
import { CURRENT, type Formulas, type HeroStats, type MonsterAttackRoll, currentMana, pyRound, withGear } from "./formulas";

export interface Params {
  // ---- health and mana
  /** Health = hpScale * (END / 2 + class + race) * level^hpPow + hpFlat. The game: 1, 1, 0. */
  hpScale: number;
  hpPow: number;
  hpFlat: number;
  /** Multiplier on the mana pool (the spells themselves stay as they are). */
  manaScale: number;
  // ---- melee: weapon * mWeapon + mScale * (STR * mStr + class) * level^mPow - armor * armorK (the game: 1, 1, 0.1, 1, 1, 1)
  mWeapon: number;
  mScale: number;
  mStr: number;
  mPow: number;
  // ---- ranged: the same with ACC, a share of the class bonus, a different armor share and a steeper hit chance
  rWeapon: number;
  rScale: number;
  rAcc: number;
  rClass: number;
  rArmor: number;
  /** Hit chance = acc / (speed * distance * rHit); the game: 0.5. */
  rHit: number;
  // ---- armor on the heroes' side (what armor takes off a monster blow) and on the monsters' side
  /** Monster armor counts this much against the heroes' blows (game 1). */
  armorVsHeroes: number;
  /** A blow always does at least this share of its raw damage (game 0). */
  floorVsHeroes: number;
  /** Hero armor counts this much against monster blows (game 1). */
  armorVsMonsters: number;
  floorVsMonsters: number;
  /**
   * 0 = the game: armor is subtracted. 1 = armor works as a share: damage^2 / (damage + armor), which never reaches 0 and never cancels a
   * blow completely. In between the two are mixed. `*Vs*` above say how much armor counts.
   */
  blendVsHeroes: number;
  blendVsMonsters: number;
  // ---- the Wolf and the chance of a special attack
  wolfBelow: number;
  wolfMaxTier: number;
  /** Death rule at 0 hit points (game: a blow of more than 1/2 of the maximum, or below minus 1/3 of it). */
  deathHit: number;
  deathBelow: number;
  /** Upper limit of the special attack's chance (game: none = 1). */
  specialCap: number;
  /** Extra factor on the chance of the lethal special attacks (Causes Dead, Eradication); game 0.5. */
  lethalScale: number;
}

export const DEFAULT_PARAMS: Params = {
  hpScale: 1,
  hpPow: 1,
  hpFlat: 0,
  manaScale: 1,
  mWeapon: 1,
  mScale: 1,
  mStr: 0.1,
  mPow: 1,
  rWeapon: 1,
  rScale: 1,
  rAcc: 0.1,
  rClass: 1,
  rArmor: 0.5,
  rHit: 0.5,
  armorVsHeroes: 1,
  floorVsHeroes: 0,
  armorVsMonsters: 1,
  floorVsMonsters: 0,
  blendVsHeroes: 0,
  blendVsMonsters: 0,
  wolfBelow: 0.9,
  wolfMaxTier: 5,
  deathHit: 1 / 2,
  deathBelow: 1 / 3,
  specialCap: 1,
  lethalScale: 0.5,
};

/** What is left of a blow of `raw` against `armor`: flat subtraction with a floor, the share formula, or a mix. */
export function mitigate(raw: number, armor: number, floorShare: number, blend: number): number {
  const flat = Math.max(Math.trunc(raw * floorShare), raw - armor);
  if (blend <= 0) return flat;
  const share = raw > 0 ? (raw * raw) / (raw + armor) : 0;
  return (1 - blend) * flat + blend * share;
}

/** `x * f`, but `x / 10` for the game's 0.1 so that the default parameters give exactly the game's floating point numbers. */
const times = (x: number, f: number): number => (f === 0.1 ? x / 10 : x * f);

const use = (h: HeroStats, a: "end"): number => Math.max(1, h[a] + h.gear[a]);

export function makeFormulas(p: Params, id: string, title: string, over: Partial<Formulas> = {}): Formulas {
  return {
    ...CURRENT,
    id,
    title,
    maxHp(h) {
      let calc = use(h, "end") / 2 + h.classHp + h.raceHp;
      if (calc <= 0) calc = 1;
      return pyRound(p.hpScale * calc * h.level ** p.hpPow + p.hpFlat);
    },
    maxMana(h, mascot) {
      return pyRound(currentMana(h, mascot, this.orbMana) * p.manaScale);
    },
    meleeDamage(h, mon, roll) {
      const weapon = roll === 0 ? 1 : roll;
      const raw = Math.ceil(p.mWeapon * weapon + p.mScale * (times(withGear(h, "str"), p.mStr) + h.classMelee) * h.level ** p.mPow);
      const taken = mon.armor > 0 ? mitigate(raw, Math.trunc(mon.armor * p.armorVsHeroes), p.floorVsHeroes, p.blendVsHeroes) : raw;
      return Math.max(0, Math.trunc(taken));
    },
    rangedHitChance(h, mon, distance) {
      if (mon.speed > 0 && distance > 0) return Math.min(1, Math.max(0, withGear(h, "acc") / (mon.speed * distance * p.rHit)));
      return 1;
    },
    rangedDamage(h, mon, roll) {
      const raw = Math.ceil(p.rWeapon * roll + p.rScale * (times(withGear(h, "acc"), p.rAcc) + h.classRanged * p.rClass) * h.level ** p.mPow);
      const taken = mon.armor > 0 ? mitigate(raw, Math.trunc(mon.armor * p.rArmor), p.floorVsHeroes, p.blendVsHeroes) : raw;
      return Math.max(0, Math.trunc(taken));
    },
    monsterDamage(mon, h, a) {
      return monsterDamageWith(mon, h, a, p);
    },
    specialChance: (h, lethal) => Math.min(p.specialCap, 10 / (withGear(h, "lck") ** 2 * 0.05)) * (lethal ? p.lethalScale : 1),
    wolfBelow: p.wolfBelow,
    wolfMaxTier: p.wolfMaxTier,
    deathHit: p.deathHit,
    deathBelow: p.deathBelow,
    ...over,
  };
}

/** `currentMonsterDamage` with the armor terms made adjustable (same order of operations, so `DEFAULT_PARAMS` gives the same numbers). */
function monsterDamageWith(mon: Parameters<Formulas["monsterDamage"]>[0], h: HeroStats, a: MonsterAttackRoll, p: Params): number {
  const type = mon.attack_type.toLowerCase();
  const ninja = h.cls === "Ninja";
  const hitChance = a.ranged ? (a.distance > 0 ? Math.min(1, Math.max(0, mon.speed / (h.spd * a.distance * (ninja ? 0.75 : 0.5)))) : 1) : 1;
  const hit = a.ranged ? (a.hit <= hitChance ? 1 : 0) : 1;
  // a missed shot does no damage at all
  if (!hit) return 0;
  let total = a.damage;
  if (type === "fire" || type === "ice" || type === "acid" || type === "magic") {
    let t = pyRound(total * (1 - h.res[type] / 100));
    t -= a.fairy;
    total = Math.max(0, t);
  } else if (type === "physical") {
    const arm = Math.trunc(h.armor * p.armorVsMonsters);
    // with the default parameters this is the game's two successive subtractions of the armor and of half of it
    if (arm > 0) total = mitigate(total, a.ranged ? arm + Math.trunc(arm / 2) : arm, p.floorVsMonsters, p.blendVsMonsters);
  }
  if (!a.ranged && ninja && a.evade < 0.1) total = 0;
  return Math.trunc(total);
}

/** Parameters as a short text for logs: only what differs from the game. */
export function paramsDiff(p: Params): string {
  return (Object.keys(DEFAULT_PARAMS) as (keyof Params)[])
    .filter((k) => Math.abs(p[k] - DEFAULT_PARAMS[k]) > 1e-9)
    .map((k) => `${k}=${Number(p[k].toFixed(3))}`)
    .join(" ");
}
