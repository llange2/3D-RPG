import type { LockKind } from "../data/locks";
import { thieverySkill } from "./character";
import type { Party } from "./types";

/**
 * TEMPORARY (40th playtest, point 7): a log of every lock the party tries, to read the real chance of the thievery roll off a playthrough (the aim is about 70 % for the median ninja at an ordinary chest, see
 * `data/locks.ts`). Every attempt notes the heroes' skills, the exact chance this attempt had (the best of the heroes' rolls reaches the difficulty) and what came out. The sums at the
 * end of the lines are the figures to compare: "expected" is the average of the exact chances, "actual" the share of attempts that worked.
 * Remove it with its call sites (`handlers.ts` `logLock`, `Game.showThievery`) when the numbers are in; nothing else depends on it.
 */

export type { LockKind };

export interface ThieveryEntry {
  kind: LockKind;
  tier: number;
  difficulty: number;
  /** Per hero who tried: name, class, the top of the roll and the chance of this hero alone. */
  heroes: { name: string; classType: string; level: number; skill: number; chance: number }[];
  /** The best roll of the party, and the chance that the best of the party reaches the difficulty. */
  best: number;
  chance: number;
  success: boolean;
}

/** Chance that a roll uniform in [floor(skill / 3), skill] reaches `difficulty`. */
export function rollChance(skill: number, difficulty: number): number {
  const lo = Math.floor(skill / 3);
  if (difficulty <= lo) return 1;
  if (difficulty > skill) return 0;
  return (skill - difficulty + 1) / (skill - lo + 1);
}

export const thieveryEntries: ThieveryEntry[] = [];
let listener: ((entry: ThieveryEntry, summary: ThieverySummary) => void) | null = null;

export interface ThieverySummary {
  attempts: number;
  successes: number;
  /** The average of the exact chances of the attempts, in percent. */
  expected: number;
  /** The share of attempts that worked, in percent. */
  actual: number;
}

export function thieverySummary(kind?: LockKind): ThieverySummary {
  const list = kind ? thieveryEntries.filter((e) => e.kind === kind) : thieveryEntries;
  const successes = list.filter((e) => e.success).length;
  return {
    attempts: list.length,
    successes,
    expected: list.length > 0 ? (list.reduce((s, e) => s + e.chance, 0) / list.length) * 100 : 0,
    actual: list.length > 0 ? (successes / list.length) * 100 : 0,
  };
}

/** The game listens here and writes the entry to its log. */
export function onThievery(fn: ((entry: ThieveryEntry, summary: ThieverySummary) => void) | null): void {
  listener = fn;
}

/** Notes one attempt: `heroes` are the indices of the characters who rolled, `best` is the best roll, `difficulty` what it had to reach. */
export function recordThievery(party: Party, heroes: readonly number[], kind: LockKind, tier: number, difficulty: number, best: number): void {
  const rows = heroes.map((i) => {
    const c = party.characters[i]!;
    const skill = thieverySkill(c);
    return { name: c.name, classType: c.classType, level: c.level, skill, chance: rollChance(skill, difficulty) };
  });
  const miss = rows.reduce((p, r) => p * (1 - r.chance), 1);
  const entry: ThieveryEntry = { kind, tier, difficulty, heroes: rows, best, chance: 1 - miss, success: best >= difficulty };
  thieveryEntries.push(entry);
  listener?.(entry, thieverySummary());
}
