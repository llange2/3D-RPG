/**
 * BALANCE v4 (25.10.2026): the combat, level and training rules of docs/KAMPF_BALANCE.md (proposal v4, report docs/KAMPF_BALANCE_V4.md).
 *
 * Every place that changed carries a comment starting with `BALANCE v4`; `grep -rn "BALANCE v4" src tools tests docs` lists them all, and
 * docs/BALANCE_V4_UMSETZUNG.md explains each one (old formula, new formula, why). The old formulas are still in the code as the `legacy`
 * branch of the same functions, so the new system can be rolled back with ONE line: set `BALANCE.mode` below to "legacy"
 * (`tools/balance/verify.ts` follows the mode, and the tests that pin v4 numbers state which mode they expect).
 *
 * CLEAN-UP (finalizing the game): the legacy branches are dead code once v4 has proven itself. At that point ask the user:
 * "Es gibt noch die alten Kampfformeln im Code. Sollen diese beim Clean-up endgültig gelöscht werden?" (see CLAUDE.md, "Offene Punkte").
 * Deleting means: remove `BALANCE`, `isV4`, every `LEGACY` branch (marked `LEGACY (balance v4)`) and `CURRENT`/`PARAM` in tools/balance.
 */

export type BalanceMode = "v4" | "legacy";

/** The one switch. Tests may flip it with `setBalanceMode` and must put it back. */
export const BALANCE: { mode: BalanceMode } = { mode: "v4" };

export function setBalanceMode(mode: BalanceMode): void {
  BALANCE.mode = mode;
}

export const isV4 = (): boolean => BALANCE.mode === "v4";

/** The numbers of both rule sets side by side; the functions below pick by mode. */
export const RULES = {
  v4: {
    /** Health: `(END / 2 + class + race) × level + 10`. */
    healthFlat: 10,
    /** Melee: `weapon + (STR × 0.1 + class) / 3 × level`, then armor, then `× (1 − res_physical)`. */
    meleeLevelDivisor: 3,
    /** Ranged damage: `weapon + (ACC × 0.1 + 0.8 × class) × level`. */
    rangedClassShare: 0.8,
    /** Ranged hit chance: `ACC / (monster speed × distance × factor)`. */
    rangedHitFactor: 1,
    /** The Wolf kills a monster that is below this share of its health. */
    wolfBelow: 0.1,
    /** The Fairy takes this many points off every elemental hit. */
    fairyReduction: 30,
    /** The Orb raises the damage of attack spells by this share ... */
    orbSpellBonus: 0.2,
    /** ... and no longer the spell points. */
    orbManaBonus: 0,
    /**
     * XP step of a level (26.10.2026, the user's wish): the OLD table up to level 10 (`base × 2^(level − 1)`), and from level 11 on every
     * step is 2 % more than the one before it (first 8 %, lowered to 2 % on 26.10.2026), starting from the old flat 1'024'000:
     * step 11 = 1'024'000 × 1.02, step 12 = 1'024'000 × 1.02², …
     * (history: the first v4 table was `base × 25 × 1.25^(level − 1)` up to 18, the second `base × 2^(level − 1)` up to 18; both overshot).
     */
    xpDoublingUntil: 10,
    xpFlat: 1_024_000,
    xpGrowthAfter: 1.02,
    /** Training costs `10 × level²` per hero. */
    trainingPerLevelSquared: 10,
  },
  legacy: {
    healthFlat: 0,
    meleeLevelDivisor: 1,
    rangedClassShare: 1,
    rangedHitFactor: 0.5,
    wolfBelow: 0.9,
    /** The old game's value lives in the generated constants (`MASCOT_FAIRY_ELEMENTAL_DAMAGE_REDUCTION`, 20). */
    fairyReduction: 20,
    orbSpellBonus: 0,
    orbManaBonus: 0.2,
    trainingPerLevel: 250,
  },
} as const;

export const healthFlat = (): number => (isV4() ? RULES.v4.healthFlat : RULES.legacy.healthFlat);
export const wolfBelow = (): number => (isV4() ? RULES.v4.wolfBelow : RULES.legacy.wolfBelow);
export const fairyReduction = (legacyValue: number): number => (isV4() ? RULES.v4.fairyReduction : legacyValue);
export const orbSpellBonus = (): number => (isV4() ? RULES.v4.orbSpellBonus : RULES.legacy.orbSpellBonus);
export const orbManaBonus = (): number => (isV4() ? RULES.v4.orbManaBonus : RULES.legacy.orbManaBonus);

/**
 * XP needed to rise from `level` to `level + 1` under v4 for a class with XP base `base` (1000 to 2000).
 * Rounded to whole points so that the game, the tool (`tools/balance/proposals.ts`) and the training screen show the same numbers.
 */
export function xpStepV4(base: number, level: number): number {
  const r = RULES.v4;
  if (level <= r.xpDoublingUntil) return base * 2 ** (level - 1);
  return Math.round(r.xpFlat * r.xpGrowthAfter ** (level - r.xpDoublingUntil));
}
