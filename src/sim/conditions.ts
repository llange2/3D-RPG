import type { Character, Condition, Party } from "./types";

const HOUR = 60;
const DAY = 24 * HOUR;

/** How a timed condition runs, as in the old `GameTimer.set_event` and `handle_events` (every duration is in game minutes). */
export interface ConditionTimer {
  /** From the moment it strikes to the moment it runs out. */
  minutes: number;
  /** Struck by it again while it runs: this many minutes are added to the timer (negative: closer to the end), or it starts over. */
  again: number | "restart";
  /** At the end: the hero dies, turns weak, or the condition just goes. */
  then: "dead" | "weak" | "gone";
}

/**
 * Poison, disease and madness end in death unless somebody helps, and every new strike takes two hours off the time that is left.
 * Drunk turns into weak, which fades; drink, weakness and sleep last two hours longer for each new strike.
 * Blessed has no entry: a blessing is a timed effect of the party (`TimedEffect`), as the new game made it.
 */
export const CONDITION_TIMERS: Partial<Record<Condition, ConditionTimer>> = {
  Poisoned: { minutes: 2 * DAY, again: -2 * HOUR, then: "dead" },
  Diseased: { minutes: 3 * DAY, again: -2 * HOUR, then: "dead" },
  Crazy: { minutes: 4 * DAY, again: -2 * HOUR, then: "dead" },
  Drunk: { minutes: 12 * HOUR, again: 2 * HOUR, then: "weak" },
  Weak: { minutes: DAY, again: 2 * HOUR, then: "gone" },
  Sleeping: { minutes: 8 * HOUR, again: 2 * HOUR, then: "gone" },
  Lovestruck: { minutes: 2 * DAY, again: "restart", then: "gone" },
};

/** The conditions that kill when their time is up. */
const DEADLY: Condition[] = ["Poisoned", "Diseased", "Crazy"];

/** Gives a condition to a hero, or strikes again when they already have it (the timer then shortens or lengthens, see `CONDITION_TIMERS`). */
export function addCondition(c: Character, cond: Condition, now: number): void {
  if (cond === "Healthy") return;
  const present = c.conditions.includes(cond);
  if (!present) c.conditions.push(cond);
  c.conditions = c.conditions.filter((x) => x !== "Healthy");
  const timer = CONDITION_TIMERS[cond];
  if (!timer) return;
  const due = (c.conditionDue ??= {});
  const running = due[cond];
  due[cond] = present && running !== undefined ? (timer.again === "restart" ? now + timer.minutes : running + timer.again) : now + timer.minutes;
}

export function removeCondition(c: Character, cond: Condition): void {
  c.conditions = c.conditions.filter((x) => x !== cond);
  if (c.conditionDue) delete c.conditionDue[cond];
  if (c.conditions.length === 0) c.conditions.push("Healthy");
}

/** What the "Suppress" spells do: the condition stays, but its timer starts over (the old game removed the event and set it again). */
export function restartCondition(c: Character, cond: Condition, now: number): boolean {
  const timer = CONDITION_TIMERS[cond];
  if (!timer || !c.conditions.includes(cond)) return false;
  (c.conditionDue ??= {})[cond] = now + timer.minutes;
  return true;
}

export interface ConditionEvent {
  /** Index of the hero in the party. */
  character: number;
  condition: Condition;
  outcome: "died" | "weak" | "ended";
}

/**
 * Lets the conditions whose time is up run out (the old `handle_events`): poison, disease and madness kill, drink turns into weakness
 * (which then lasts a day from now), the others go. Returns what happened for the log.
 */
export function tickConditions(party: Party): ConditionEvent[] {
  const events: ConditionEvent[] = [];
  party.characters.forEach((c, index) => {
    const due = c.conditionDue;
    if (!due) return;
    for (const cond of Object.keys(due) as Condition[]) {
      const at = due[cond];
      // an earlier entry of this very hero may have removed this one (a death takes all three deadly conditions away)
      if (at === undefined || at > party.minutes) continue;
      const timer = CONDITION_TIMERS[cond];
      if (!timer || !c.conditions.includes(cond)) {
        delete due[cond];
        continue;
      }
      if (timer.then === "dead") {
        for (const deadly of DEADLY) removeCondition(c, deadly);
        addCondition(c, "Dead", party.minutes);
        c.hp = 0;
        events.push({ character: index, condition: cond, outcome: "died" });
      } else if (timer.then === "weak") {
        removeCondition(c, cond);
        removeCondition(c, "Weak");
        addCondition(c, "Weak", party.minutes);
        events.push({ character: index, condition: cond, outcome: "weak" });
      } else {
        removeCondition(c, cond);
        events.push({ character: index, condition: cond, outcome: "ended" });
      }
    }
  });
  return events;
}

const CAUSE_OF_DEATH: Partial<Record<Condition, string>> = { Poisoned: "poison", Diseased: "disease", Crazy: "madness" };

/** The line for the log: "Maximus dies of poison." */
export function conditionEventText(name: string, e: ConditionEvent): string {
  if (e.outcome === "died") return `${name} dies of ${CAUSE_OF_DEATH[e.condition] ?? e.condition.toLowerCase()}.`;
  if (e.outcome === "weak") return `${name} sobers up, but feels weak.`;
  switch (e.condition) {
    case "Sleeping":
      return `${name} wakes up.`;
    case "Weak":
      return `${name} feels strong again.`;
    default:
      return `${name} is no longer ${e.condition.toLowerCase()}.`;
  }
}

/** Minutes until the hero dies of poison, disease or madness if nobody helps, or null when none of them is running. */
export function minutesToDeath(c: Character, now: number): number | null {
  if (c.conditions.includes("Dead") || c.conditions.includes("Rotten")) return null;
  let soonest: number | null = null;
  for (const cond of DEADLY) {
    const at = c.conditionDue?.[cond];
    if (at === undefined || !c.conditions.includes(cond)) continue;
    const left = Math.max(0, at - now);
    if (soonest === null || left < soonest) soonest = left;
  }
  return soonest;
}

/** A save from before the timers: every timed condition a hero already has starts its full time now. */
export function seedConditionTimers(party: Party): void {
  for (const c of [...party.characters, ...(party.reserve ?? [])]) {
    for (const cond of c.conditions) {
      const timer = CONDITION_TIMERS[cond];
      if (timer && c.conditionDue?.[cond] === undefined) (c.conditionDue ??= {})[cond] = party.minutes + timer.minutes;
    }
  }
}
