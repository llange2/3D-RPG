/**
 * The reward factors of a world (bug_fix_59, points 4 and 6): gold, experience, attribute points and resistance points are the same in every world size, as the default world gives them.
 * A small world has fewer places and so each reward is bigger, a huge world has more places and each reward is smaller. The factors are worked out once when a game is created
 * (`rewardMeasure.ts`), kept in the save (`GameState.scale`) and applied when a reward is paid (here: `scaleAction` for what a container, shrine or chalice gives; `Game` for the gold and the
 * experience of a monster). Nothing here draws a random number that the generator or the simulation reads, so the worlds themselves stay what they are: no `GEN_VERSION`.
 * Pure data and arithmetic: no DOM, no Babylon.
 */
import type { ActionInstance, ParamValue } from "./types";

export interface RewardScale {
  /** Gold of monsters, chests, end rooms and burnt huts (not what the quest givers pay). */
  gold: number;
  /** Experience of monsters, burnt huts and the chalices and shrines that give experience (not what the quest givers pay). */
  xp: number;
  /** The attribute points of end rooms, vaults, shrines and chalices. */
  attr: number;
  /** What a Quatloo coin is worth: a factor on its three points. */
  coin: number;
  /** The resistance points of end rooms, vaults, shrines and chalices. */
  res: number;
}

/** A save without factors (every save before this change) and the tools: every reward as the tables say. */
export const NEUTRAL_SCALE: RewardScale = { gold: 1, xp: 1, attr: 1, coin: 1, res: 1 };

/** The points a Quatloo coin gives at the factor 1 (a machine of Seth Squirm). */
export const COIN_POINTS = 3;

export function parseRewardScale(raw: Partial<RewardScale> | null | undefined): RewardScale {
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 1);
  return raw ? { gold: num(raw.gold), xp: num(raw.xp), attr: num(raw.attr), coin: num(raw.coin), res: num(raw.res) } : { ...NEUTRAL_SCALE };
}

export const isNeutral = (s: RewardScale): boolean => s.gold === 1 && s.xp === 1 && s.attr === 1 && s.coin === 1 && s.res === 1;

/** A sum of gold with its digits kept short: three significant digits from 1 000 on (4'713'229 reads as 4'710'000), so that a scaled chest does not read like a calculator. */
export function niceAmount(n: number): number {
  if (n < 1000) return Math.max(0, Math.round(n));
  const step = 10 ** (Math.floor(Math.log10(n)) - 2);
  return Math.round(n / step) * step;
}

/** The gold a monster, a hut or a chest gives after the factor (nothing stays nothing, something stays at least 1). */
export function scaledGold(gold: number, scale: RewardScale | undefined): number {
  if (!scale || scale.gold === 1 || gold <= 0) return gold;
  return Math.max(1, niceAmount(gold * scale.gold));
}

/** The experience of a monster after the factor (whole numbers, at least 1 for a monster that gave any). */
export function scaledXp(xp: number, scale: RewardScale | undefined): number {
  if (!scale || scale.xp === 1 || xp <= 0) return xp;
  return Math.max(1, Math.floor(xp * scale.xp));
}

/** The points of a Quatloo coin after the factor. */
export function coinPoints(scale: RewardScale | undefined): number {
  return scale ? Math.max(1, Math.round(COIN_POINTS * scale.coin)) : COIN_POINTS;
}

/** A number in [0, 1) that belongs to a text alone (FNV-1a): the rounding of a point amount, without a random stream that anything else reads. */
function unit(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 100000) / 100000;
}

/** Points after a factor: whole numbers, the fraction rounded up or down by the uid of the action (so that the sum of many small gifts keeps the factor), at least 1. */
function scaledPoints(amount: number, factor: number, uid: string): number {
  const exact = amount * factor;
  if (exact >= 100) return Math.round(exact);
  const whole = Math.floor(exact);
  return Math.max(1, whole + (unit(uid) < exact - whole ? 1 : 0));
}

/** Marks an action whose rewards are scaled already (`resolveAction` calls itself for a barrel that holds points: the factor must not apply twice). */
const DONE = "scaled";

/**
 * The action as the party meets it in a world with this factor: the gold of a container, the points of an end room, vault, shrine or chalice and the experience of a shrine or chalice
 * multiplied (the params of the generator stay what they are). The quest rewards (orbs, skulls, pearls) are no action's params and are never touched.
 */
export function scaleAction(action: ActionInstance, scale: RewardScale | undefined): ActionInstance {
  if (!scale || isNeutral(scale) || action.params[DONE]) return action;
  const p = { ...action.params } as Record<string, ParamValue>;
  let changed = false;
  const gold = Number(p.gold ?? 0);
  if (gold > 0 && scale.gold !== 1) {
    p.gold = scaledGold(gold, scale);
    changed = true;
  }
  const amount = Number(p.amount ?? 0);
  if (amount > 0) {
    // a chalice or a barrel with a bonus names it, a shrine names it in `effect`
    const what = typeof p.bonus === "string" ? p.bonus : action.kind === "shrine" ? p.effect : undefined;
    const factor = what === "attr" || what === "attribute" ? scale.attr : what === "res" || what === "resist" ? scale.res : what === "xp" ? scale.xp : 1;
    if (factor !== 1) {
      p.amount = scaledPoints(amount, factor, action.uid);
      changed = true;
    }
  }
  if (!changed) return action;
  p[DONE] = true;
  return { ...action, params: p };
}
