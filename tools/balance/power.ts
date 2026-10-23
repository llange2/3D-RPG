/**
 * Power tables without any dice: what one hero does per action and how much he can take, by class and level.
 * Everything is an expected value over the weapon roll; monsters are given as numbers (armor, speed) so the table does not depend on the monster list.
 */
import { MONSTERS, type MonsterDef } from "../../src/data/tables";
import { type Formulas, pyRound } from "./formulas";
import { type GearSpec, type Growth, type HeroSpec, type Hero, makeHero, spellsOf } from "./hero";

/** A dummy monster with the numbers that matter for hero damage. */
export const dummy = (armor: number, speed: number): MonsterDef => ({ ...(MONSTERS[31] as MonsterDef), armor, speed, health: 1000, res_fire: 0, res_ice: 0, res_acid: 0, res_magic: 0, res_physical: 0 });

export interface Power {
  hp: number;
  mana: number;
  meleeHit: number;
  /** Ranged damage per shot including the hit chance, at distance 1 and 4. */
  rangedHit1: number;
  rangedHit4: number;
  /** The strongest attack spell per cast against a monster without resistance, and its damage per mana point. */
  spellCast: number;
  spellPerMana: number;
  /** How many casts of that spell the mana pool pays. */
  spellCasts: number;
  armor: number;
}

export function power(F: Formulas, h: Hero, mon: MonsterDef): Power {
  const hp = F.maxHp(h);
  const mana = F.maxMana(h, "none");
  const meleeHit = F.meleeDamage(h, mon, (h.damMin + h.damMax) / 2);
  const bow = h.rangedMax > 0;
  const shot = (d: number) => (bow ? F.rangedHitChance(h, mon, d) * F.rangedDamage(h, mon, (h.rangedMin + h.rangedMax) / 2) : 0);
  const sp = spellsOf(h.cls, h.level).attack;
  let best = 0;
  let bestMana = 1;
  let perMana = 0;
  for (const s of sp) {
    if (s.mana > mana) continue;
    const dmg = ((s.min + s.max) / 2) * (s.scales ? h.level : 1);
    if (dmg > best) {
      best = dmg;
      bestMana = s.mana;
    }
    perMana = Math.max(perMana, dmg / s.mana);
  }
  return { hp, mana, meleeHit, rangedHit1: shot(1), rangedHit4: shot(4), spellCast: best, spellPerMana: perMana, spellCasts: best > 0 ? Math.floor(mana / bestMana) : 0, armor: h.armor };
}

/** Mean over 24 gear rolls (rings differ a lot: one Ring of Endurance +50 is worth 25 hit points per level). */
export function heroPower(F: Formulas, spec: HeroSpec, level: number, growth: Growth, gear: GearSpec, mon: MonsterDef, salts = 24): Power {
  let acc: Power | null = null;
  for (let s = 0; s < salts; s++) {
    const p = power(F, makeHero(spec, level, growth, gear, s), mon);
    if (!acc) acc = { ...p };
    else for (const k of Object.keys(p) as (keyof Power)[]) acc[k] += p[k];
  }
  for (const k of Object.keys(acc!) as (keyof Power)[]) acc![k] /= salts;
  return acc!;
}

export const round1 = (x: number): number => Math.round(x * 10) / 10;
export { pyRound };

export interface RoundPower {
  /** All heroes strike in melee (one round of battle mode). */
  melee: number;
  /** All heroes with a bow shoot at the given distances (one action in free roam). */
  volley1: number;
  volley3: number;
  volley5: number;
  /** All heroes cast their best attack spell once (single target, no penetration counted). */
  spells: number;
}

/** Expected damage of one party action of each kind against a monster, over several gear rolls. */
export function roundPower(F: Formulas, members: HeroSpec[], level: number, growth: Growth, gear: GearSpec, mon: MonsterDef, salts = 24): RoundPower {
  const out: RoundPower = { melee: 0, volley1: 0, volley3: 0, volley5: 0, spells: 0 };
  for (let s = 0; s < salts; s++) {
    members.forEach((spec, i) => {
      const h = makeHero(spec, level, growth, gear, s * 4 + i);
      const p = power(F, h, mon);
      const bow = h.rangedMax > 0;
      const shot = (d: number) => (bow ? F.rangedHitChance(h, mon, d) * F.rangedDamage(h, mon, (h.rangedMin + h.rangedMax) / 2) : 0);
      out.melee += p.meleeHit / salts;
      out.volley1 += shot(1) / salts;
      out.volley3 += shot(3) / salts;
      out.volley5 += shot(5) / salts;
      out.spells += p.spellCast / salts;
    });
  }
  return out;
}
