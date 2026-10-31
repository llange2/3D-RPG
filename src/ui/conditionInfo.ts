import { worstCondition } from "../sim/character";
import { CONDITIONS } from "../sim/types";
import { minutesToDeath } from "../sim/conditions";
import type { Character, Condition } from "../sim/types";

/** Poison, disease and madness: the conditions with a time to death. */
const DEADLY: readonly Condition[] = ["Poisoned", "Diseased", "Crazy"];

/** The look of the worst condition, in the colours of the old character screen: green healthy, yellow harmless, red needs a cure, blue out of action. */
const CONDITION_LOOK: Record<Condition, "ok" | "warn" | "bad" | "down" | "bless"> = {
  Healthy: "ok",
  Blessed: "bless",
  Drunk: "warn",
  Lovestruck: "warn",
  Sleeping: "warn",
  Cursed: "warn",
  Weak: "warn",
  Crazy: "bad",
  Diseased: "bad",
  Poisoned: "bad",
  Dead: "down",
  Paralyzed: "down",
  Petrified: "down",
  Rotten: "down",
  Unconscious: "down",
};

/** The conditions that put a hero out of action: they are shown whatever else the hero has. */
const OUT_OF_ACTION: ReadonlySet<Condition> = new Set<Condition>(["Dead", "Paralyzed", "Petrified", "Rotten", "Unconscious"]);

/** The conditions that kill when their time is up, with the minutes that are left (soonest first). */
function deadlyTimers(c: Character, now: number): { condition: Condition; left: number }[] {
  return DEADLY.filter((cond) => c.conditions.includes(cond) && c.conditionDue?.[cond] !== undefined)
    .map((condition) => ({ condition, left: Math.max(0, c.conditionDue![condition]! - now) }))
    .sort((a, b) => a.left - b.left);
}

/** The condition the card names (36th playtest, point 19): a hero out of action shows that; else the one that kills first; else the worst. */
export function shownCondition(c: Character, now: number): Condition {
  const worst = worstCondition(c);
  if (OUT_OF_ACTION.has(worst)) return worst;
  return deadlyTimers(c, now)[0]?.condition ?? worst;
}

export const conditionClass = (c: Character, now = Number.NaN): string => `cond-${CONDITION_LOOK[Number.isNaN(now) ? worstCondition(c) : shownCondition(c, now)]}`;

/** "Dies in >8 hours": whole hours are enough, minutes would only promise a precision nobody can use. */
export function deathNote(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours < 1 ? "Dies in <1 hour" : `Dies in >${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * What the mouse-over of a hero's condition says. One condition: when they die if nobody helps (poison, disease, madness), as before. Several: a line for each,
 * "Crazy: Dies in >10 hours", the ones that kill first at the top, then the rest by severity.
 */
export function conditionTitle(c: Character, now: number): string {
  if (c.conditions.length > 1) {
    const timers = deadlyTimers(c, now);
    const others = CONDITIONS.filter((cond) => c.conditions.includes(cond) && !timers.some((t) => t.condition === cond));
    return [...timers.map((t) => `${t.condition}: ${deathNote(t.left)}`), ...others].join("\n");
  }
  const left = minutesToDeath(c, now);
  return left !== null ? deathNote(left) : "";
}
