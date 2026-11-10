/**
 * TEMPORARY (balance journal): a log of what happens in a playthrough, kept in the save game (`GameState.journal`, `SaveFile.state.journal`) so that a tester can export the saves
 * (Esc > Debug > Export saves) and the numbers can be read off them later for balancing: the chance of the thievery rolls, the fights, the pace of the levels, the traps, the downed heroes.
 *
 * The sim only reports (`journalEmit`) and never reads the journal back: it changes no state and draws no random number, so a game plays out the same with or without it. `Game` registers
 * the sink (`setJournalSink`), stamps every entry with the step, the game minute and the place, and files it in the state. With no sink (tests, tools) an entry is built and dropped.
 *
 * Remove it with its call sites in one step when the numbers are in: `grep -rn "balance journal" src tests tools docs`.
 */

export type LockKind = "chest" | "king chest" | "door";

/** Where and when an entry was made; `Game` adds it. */
export interface Stamp {
  /** Steps of the party so far. */
  s: number;
  /** Game minute. */
  m: number;
  /** `ow` for the overworld, else the id of the place. */
  at: string;
  x: number;
  y: number;
}

/** One hero who rolled at a lock: the numbers the roll is made of, the roll itself and the chance this hero alone had. */
export interface LockHero {
  /** Index in the party. */
  i: number;
  name: string;
  cls: string;
  race: string;
  lvl: number;
  xp: number;
  /** The base attributes in the order str, int, per, end, spd, acc, lck. */
  a: number[];
  /** Luck and accuracy as the roll sees them (gear, boons). */
  eLck: number;
  eAcc: number;
  /** The thievery value of the hero. */
  thv: number;
  /** The top of the roll; the bottom is `floor(skill / 3)`. */
  skill: number;
  roll: number;
  /** The chance of this hero alone to reach the lock, 0 to 1. */
  p: number;
}

export interface LockEvent {
  t: "lock";
  kind: LockKind;
  tier: number;
  /** The uid of the chest or door. */
  uid: string;
  /** Average level of the heroes who can act, and the level the lock was worked out for (raised to the entry of the tier and cut at the exit of the next tier, `lockLevel`). */
  lvl: number;
  lockLvl: number;
  diff: number;
  /** The roll of the hero who picked (the active hero with the highest thievery skill; since 10 Nov 2026 `heroes` holds only him, before it held every hero and the best roll counted). */
  best: number;
  ok: boolean;
  /** The chance that the roll reaches the lock, 0 to 1. */
  p: number;
  /** Set when the failed attempt set off the trap of the chest: the index of the hero it hit. */
  fumble?: number;
  heroes: LockHero[];
}

export interface TrapEvent {
  t: "trap";
  /** pit, guillotine, spring, generic, chest, rat, quest ... */
  kind: string;
  element?: string;
  uid: string;
  tier: number;
  hero: { i: number; name: string; cls: string; lvl: number; lck: number };
  /** Chance to get out of the way (chest traps only). */
  dodgeP?: number;
  dodged: boolean;
  /** Damage before resistance and protection, and what the hero lost. */
  raw: number;
  dmg: number;
  /** The hit put the hero down. */
  down?: boolean;
}

export interface FightHero {
  name: string;
  cls: string;
  lvl: number;
  /** Hit points at the start and at the end of the fight, and the maximum at the end. */
  hp0: number;
  hp1: number;
  health: number;
}

export interface FightEvent {
  t: "fight";
  /** won: no monster left; left: the party left the scene (walked away, a town portal, a spell); lost: the party was defeated. */
  out: "won" | "left" | "lost";
  /** The stamp of a fight is where and when it began; the step and minute it ended at are here. */
  endS: number;
  endM: number;
  tier: number;
  /** Steps of the fight that had blows or shots in them. */
  rounds: number;
  /** The monsters met: definition id and how many. */
  mon: { id: number; n: number }[];
  heroes: FightHero[];
  /** What the party dealt, by kind of attack. */
  dealt: { melee: number; ranged: number; magic: number };
  /** Attacks of the party and how many hit. */
  pAtk: number;
  pHit: number;
  /** What the monsters dealt, by kind of damage. */
  taken: Record<string, number>;
  /** Attacks of the monsters and how many hit. */
  mAtk: number;
  mHit: number;
  killed: number;
  /** The Wolf finished off this many. */
  wolf: number;
  xp: number;
  gold: number;
  items: number;
  mascot: string;
}

export interface SnapHero {
  lvl: number;
  xp: number;
  hp: number;
  health: number;
  cond: string;
}

/** The time line: the state of the party at a moment. */
export interface SnapEvent {
  t: "snap";
  /** steps: every so many steps; enter and leave: the party changed between the overworld and a place; load: a save was loaded. */
  why: string;
  tier: number;
  heroes: SnapHero[];
  gold: number;
  bank: number;
  food: number;
  kills: number;
}

export interface LevelEvent {
  t: "level";
  name: string;
  cls: string;
  from: number;
  to: number;
  xp: number;
}

/** A hero who went down (Unconscious) or died. */
export interface DownEvent {
  t: "down";
  name: string;
  cls: string;
  lvl: number;
  cond: string;
  /** The monster that did it, or the kind of thing (trap, poison ...). */
  by: string;
  dmg: number;
}

export type JournalEvent = LockEvent | TrapEvent | FightEvent | SnapEvent | LevelEvent | DownEvent;
export type JournalEntry = JournalEvent & Stamp;

let sink: ((event: JournalEvent) => void) | null = null;

/** The game files the entries here (and stamps them); null in tests and tools. */
export function setJournalSink(fn: ((event: JournalEvent) => void) | null): void {
  sink = fn;
}

/**
 * Reports an entry. Returns it so that the caller can still add to it (a lock whose failure sets off a trap): the sink keeps the very same object.
 */
export function journalEmit<T extends JournalEvent>(event: T): T {
  sink?.(event);
  return event;
}

/** The most entries a save keeps; the oldest go first, the snapshots before the rest. */
export const JOURNAL_LIMIT = 3000;

/** Adds an entry and keeps the journal within `JOURNAL_LIMIT`. */
export function pushJournal(journal: JournalEntry[], entry: JournalEntry): void {
  journal.push(entry);
  if (journal.length <= JOURNAL_LIMIT) return;
  // the time line is the least precious: drop its oldest entry first, then the oldest of anything
  const snap = journal.findIndex((e) => e.t === "snap");
  journal.splice(snap >= 0 ? snap : 0, 1);
}

/** Chance that a roll uniform in [floor(skill / 3), skill] reaches `difficulty`. */
export function rollChance(skill: number, difficulty: number): number {
  const lo = Math.floor(skill / 3);
  if (difficulty <= lo) return 1;
  if (difficulty > skill) return 0;
  return (skill - difficulty + 1) / (skill - lo + 1);
}

export interface ThieverySummary {
  attempts: number;
  successes: number;
  /** The average of the exact chances of the attempts, in percent. */
  expected: number;
  /** The share of attempts that worked, in percent. */
  actual: number;
}

/** "expected" is the average of the exact chances, "actual" the share of attempts that worked: the two figures to compare. */
export function thieverySummary(journal: readonly JournalEvent[], kind?: LockKind): ThieverySummary {
  const list = journal.filter((e): e is LockEvent => e.t === "lock" && (kind === undefined || e.kind === kind));
  const successes = list.filter((e) => e.ok).length;
  return {
    attempts: list.length,
    successes,
    expected: list.length > 0 ? (list.reduce((s, e) => s + e.p, 0) / list.length) * 100 : 0,
    actual: list.length > 0 ? (successes / list.length) * 100 : 0,
  };
}
