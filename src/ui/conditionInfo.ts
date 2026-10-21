import { worstCondition } from "../sim/character";
import { minutesToDeath } from "../sim/conditions";
import type { Character, Condition } from "../sim/types";

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

export const conditionClass = (c: Character): string => `cond-${CONDITION_LOOK[worstCondition(c)]}`;

/** "Dies in >8 hours": whole hours are enough, minutes would only promise a precision nobody can use. */
export function deathNote(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours < 1 ? "Dies in <1 hour" : `Dies in >${hours} hour${hours === 1 ? "" : "s"}`;
}

/** What the mouse-over of a hero's condition says: every condition they have, and when they die if nobody helps (poison, disease, madness). */
export function conditionTitle(c: Character, now: number): string {
  const lines = c.conditions.length > 1 ? [c.conditions.join(", ")] : [];
  const left = minutesToDeath(c, now);
  if (left !== null) lines.push(deathNote(left));
  return lines.join("\n");
}
