/**
 * Formula proposals. Every entry is `{ ...CURRENT, ...overrides }`: what is not listed stays as the game has it today.
 * The reasoning and the measurements behind them are in docs/KAMPF_BALANCE.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONSTANTS } from "../../src/data/tables";
import { CURRENT, type Formulas, pyRound } from "./formulas";
import { DEFAULT_PARAMS, type Params, makeFormulas } from "./parametric";

/** XP step with a constant growth `g` per level from `fromLevel` on (the doubling before it stays as it is). */
export function xpGrowth(g: number, fromLevel = 10): Formulas["xpStep"] {
  return (cls, level) => {
    const base = CONSTANTS.CHARACTER_XP[cls] ?? 2000;
    const doubling = (l: number) => 2 ** (l - 1) * base;
    return level <= fromLevel ? doubling(level) : doubling(fromLevel) * g ** (level - fromLevel);
  };
}

/**
 * A smooth XP step: `s` times the class base for level 1, then `g1` more for every level up to `k`, `g2` more after that.
 * (The class bases of the game, 1000 to 2000, stay as they are: a thief needs two thirds of what a wizard needs.)
 */
export function xpSmooth(s: number, g1: number, k: number, g2: number): Formulas["xpStep"] {
  return (cls, level) => {
    const base = CONSTANTS.CHARACTER_XP[cls] ?? 2000;
    return base * s * g1 ** (Math.min(level, k) - 1) * g2 ** Math.max(0, level - k);
  };
}

export const PROPOSALS: Record<string, Formulas> = {
  xs_20_125_18_106: { ...CURRENT, id: "xs_20_125_18_106", title: "XP glatt: 20 x Basis, +25 % bis Stufe 18, danach +6 %", xpStep: xpSmooth(20, 1.25, 18, 1.06) },
  xs_20_125_18_108: { ...CURRENT, id: "xs_20_125_18_108", title: "XP glatt: 20 x Basis, +25 % bis Stufe 18, danach +8 %", xpStep: xpSmooth(20, 1.25, 18, 1.08) },
  xs_20_125_18_110: { ...CURRENT, id: "xs_20_125_18_110", title: "XP glatt: 20 x Basis, +25 % bis Stufe 18, danach +10 %", xpStep: xpSmooth(20, 1.25, 18, 1.1) },
  xs_25_125_18_106: { ...CURRENT, id: "xs_25_125_18_106", title: "XP glatt: 25 x Basis, +25 % bis Stufe 18, danach +6 %", xpStep: xpSmooth(25, 1.25, 18, 1.06) },
  xs_25_125_18_108: { ...CURRENT, id: "xs_25_125_18_108", title: "XP glatt: 25 x Basis, +25 % bis Stufe 18, danach +8 %", xpStep: xpSmooth(25, 1.25, 18, 1.08) },
  xs_25_125_18_110: { ...CURRENT, id: "xs_25_125_18_110", title: "XP glatt: 25 x Basis, +25 % bis Stufe 18, danach +10 %", xpStep: xpSmooth(25, 1.25, 18, 1.1) },
  xs_30_125_18_106: { ...CURRENT, id: "xs_30_125_18_106", title: "XP glatt: 30 x Basis, +25 % bis Stufe 18, danach +6 %", xpStep: xpSmooth(30, 1.25, 18, 1.06) },
  xs_30_125_18_108: { ...CURRENT, id: "xs_30_125_18_108", title: "XP glatt: 30 x Basis, +25 % bis Stufe 18, danach +8 %", xpStep: xpSmooth(30, 1.25, 18, 1.08) },
  xs_30_120_20_107: { ...CURRENT, id: "xs_30_120_20_107", title: "XP glatt: 30 x Basis, +20 % bis Stufe 20, danach +7 %", xpStep: xpSmooth(30, 1.2, 20, 1.07) },
  xs_25_120_18_108: { ...CURRENT, id: "xs_25_120_18_108", title: "XP glatt: 25 x Basis, +20 % bis Stufe 18, danach +8 %", xpStep: xpSmooth(25, 1.2, 18, 1.08) },
  xp_g05: { ...CURRENT, id: "xp_g05", title: "XP: ab Stufe 10 +5 % je Stufe", xpStep: xpGrowth(1.05) },
  xp_g08: { ...CURRENT, id: "xp_g08", title: "XP: ab Stufe 10 +8 % je Stufe", xpStep: xpGrowth(1.08) },
  xp_g10: { ...CURRENT, id: "xp_g10", title: "XP: ab Stufe 10 +10 % je Stufe (Vorschlag des Nutzers)", xpStep: xpGrowth(1.1) },
  xp_g12: { ...CURRENT, id: "xp_g12", title: "XP: ab Stufe 10 +12 % je Stufe", xpStep: xpGrowth(1.12) },
  xp_g15: { ...CURRENT, id: "xp_g15", title: "XP: ab Stufe 10 +15 % je Stufe", xpStep: xpGrowth(1.15) },
};

/**
 * The combat proposal of docs/KAMPF_BALANCE.md (v3): health with a floor, melee that is no longer swallowed by armor, a bow that no longer beats the
 * sword and armor that always lets half a blow through. (The missed shot that really misses and the lethal special attacks at half the chance
 * were part of v3; the game has them since the fixes of docs section 3.5, so they are the defaults now.)
 */
export const V3_PARAMS: Params = {
  ...DEFAULT_PARAMS,
  hpScale: 1.1,
  hpFlat: 25,
  mScale: 1.5,
  armorVsHeroes: 0.4,
  rClass: 0.8,
  rHit: 1,
  floorVsMonsters: 0.5,
};
PROPOSALS.v3 = makeFormulas(V3_PARAMS, "v3", "Kampfformeln, Vorschlag v3");

/** Training cost of the user's own formula sheet (level squared times ten); the game charges 250 a level. */
export const trainingSquare = (level: number): number => level * level * 10;

/** The complete proposal: combat formulas v3, the smooth XP curve and the cheaper early training. */
PROPOSALS.v3x = { ...PROPOSALS.v3!, id: "v3x", title: "Vorschlag komplett: Kampf v3, XP glatt (25 x Basis, +25 %, +8 %), Training Stufe^2 x 10, Wolf 1/3, Fee 30", xpStep: xpSmooth(25, 1.25, 18, 1.08), trainingCost: trainingSquare, wolfBelow: 1 / 3, fairyReduction: 30 };
/** The same combat formulas with the XP table of the user's suggestion (+10 % after level 10) and the game's training cost. */
PROPOSALS.v3u = { ...PROPOSALS.v3!, id: "v3u", title: "Kampf v3 mit XP-Vorschlag des Nutzers (+10 % ab Stufe 10)", xpStep: xpGrowth(1.1) };

/**
 * The revised proposal of the user (docs/KAMPF_BALANCE.md, summary table, state of 24.10.2026), called v4:
 *  health `(END/2 + class + race) * level + 10`; melee `(weapon * (STR*0.1 + class) / 3 * level - armor) * (1 - res_physical)`;
 *  bow hit chance `ACC / (speed * distance)`, bow damage as v3; monsters hit as today; Wolf kills below 10 %, Fairy -30, Orb +10 % spell damage
 *  (no extra mana any more); XP and training as v3x.
 * The melee line is ambiguous ("Waffe x (...) /3 x Stufe"): `melee` picks the reading (see `V4_MELEE`).
 */
const V4_MELEE = {
  /** As written: the weapon multiplies the whole level term. */
  mul: (weapon: number, a: number, level: number) => (weapon * a * level) / 3,
  /** The weapon is added, the level term is a third of the old one. */
  add3: (weapon: number, a: number, level: number) => weapon + (a * level) / 3,
  /** The weapon is added, the level term as today (the old melee, but armor counts fully and `res_physical` applies). */
  add1: (weapon: number, a: number, level: number) => weapon + a * level,
} as const;

export function makeV4(id: string, melee: keyof typeof V4_MELEE): Formulas {
  const level = V4_MELEE[melee];
  return {
    ...CURRENT,
    id,
    title: `Vorschlag v4 des Nutzers (Nahkampf: ${melee})`,
    maxHp(h) {
      let calc = Math.max(1, h.end + h.gear.end) / 2 + h.classHp + h.raceHp;
      if (calc <= 0) calc = 1;
      return pyRound(h.level * calc) + 10;
    },
    meleeDamage(h, mon, roll) {
      const a = (h.str + h.gear.str) / 10 + h.classMelee;
      const raw = Math.ceil(level(roll === 0 ? 1 : roll, a, h.level));
      return Math.max(0, Math.trunc((raw - mon.armor) * (1 - mon.res_physical)));
    },
    rangedHitChance(h, mon, distance) {
      if (mon.speed > 0 && distance > 0) return Math.min(1, Math.max(0, (h.acc + h.gear.acc) / (mon.speed * distance)));
      return 1;
    },
    rangedDamage(h, mon, roll) {
      const raw = Math.ceil(roll + ((h.acc + h.gear.acc) / 10 + 0.8 * h.classRanged) * h.level);
      return Math.max(0, Math.trunc(raw - Math.trunc(mon.armor / 2)));
    },
    xpStep: xpSmooth(25, 1.25, 18, 1.08),
    trainingCost: trainingSquare,
    wolfBelow: 0.1,
    orbMana: 0,
    orbSpell: 0.1,
    fairyReduction: 30,
  };
}
// v4 is the reading the user confirmed on 25.10.2026: weapon + (STR*0.1 + class) / 3 * level (Knight, level 35, STR 30, weapon 10: 68.3)
PROPOSALS.v4 = makeV4("v4", "add3");
PROPOSALS.v4mul = makeV4("v4mul", "mul");
PROPOSALS.v4b = makeV4("v4b", "add1");

const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");

/** `current`, a named proposal, or the result of a parameter search (`out/search-<name>.json`). */
export function formulasByName(name: string | undefined): Formulas {
  if (!name || name === "current") return CURRENT;
  const proposal = PROPOSALS[name];
  if (proposal) return proposal;
  const file = join(outDir, `search-${name}.json`);
  if (existsSync(file)) {
    const params = { ...DEFAULT_PARAMS, ...(JSON.parse(readFileSync(file, "utf8")).params as Partial<Params>) };
    return makeFormulas(params, name, `search result ${name}`);
  }
  throw new Error(`unknown formula set "${name}" (known: current, ${Object.keys(PROPOSALS).join(", ")}, or a search result in out/)`);
}
