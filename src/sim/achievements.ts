import { ACHIEVEMENTS, TAVERN_PASSWORDS, UNSTOPPABLE_LEVEL, type CounterKey } from "../data/achievements";
import { OLD_AGE, totalAge } from "./aging";
import type { Character, Ledger, Party, PartyAch } from "./types";

/**
 * Achievements, the rules (no DOM, no randomness: `game/achievements.ts` keeps the profile in the browser and shows the dialogs).
 *
 * Two levels. The **profile** (`Profile`) belongs to the player: what is unlocked and the totals of the counters that run over any number of games. The **game** (`Party.ach`) is in the
 * save: its ledger of what it earned and the flags of the achievements that depend on one whole game. A counter is never raised by an event itself: the game's ledger is credited to
 * the profile above the high-water mark of that game (`creditLedger`), so loading an older save and doing the same again (opening a king's chest, handing in artifacts) brings nothing twice.
 */

export interface Totals {
  gold: number;
  artifacts: number;
  riddles: number;
  dungeons: number;
}

export interface Profile {
  version: 1;
  /** Achievement id → the day it dropped (ISO date). */
  unlocked: Record<string, string>;
  /** Dropped, but the dialog was not confirmed yet (the party left, the page was closed): shown again at the next chance. */
  unseen: string[];
  totals: Totals;
  /** Game id → the highest ledger of that game that was credited. */
  seen: Record<string, Ledger>;
}

export const emptyLedger = (): Ledger => ({ goldIn: 0, goldBack: 0, artifacts: 0, riddles: 0, dungeons: 0 });
export const emptyTotals = (): Totals => ({ gold: 0, artifacts: 0, riddles: 0, dungeons: 0 });
export const emptyProfile = (): Profile => ({ version: 1, unlocked: {}, unseen: [], totals: emptyTotals(), seen: {} });

/** The games whose high-water marks the profile keeps (about 100 bytes each); the oldest are forgotten. */
export const SEEN_GAMES = 100;

/** The achievement part of a party, made when it is missing (an old save). The game id stays empty until `Game` names the game. */
export function achOf(party: Party): PartyAch {
  return (party.ach ??= { id: "", passwords: [], ledger: emptyLedger(), sections: [] });
}

/** Gold that comes into the party (loot, chests, quests, sales, interest). Every income goes through here so that the ledger sees it; spending and the bank's withdrawals do not. */
export function gainGold(party: Party, amount: number): void {
  if (!(amount > 0)) return;
  party.gold += amount;
  achOf(party).ledger.goldIn += amount;
}

/** Adds to a counter of the game's ledger. */
export function countFor(party: Party, key: "artifacts" | "riddles" | "dungeons", n = 1): void {
  achOf(party).ledger[key] += n;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

function parseLedger(v: unknown): Ledger {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof Ledger, unknown>>;
  return { goldIn: num(o.goldIn), goldBack: num(o.goldBack), artifacts: num(o.artifacts), riddles: num(o.riddles), dungeons: num(o.dungeons) };
}

/** Reads the stored profile; anything unreadable gives an empty one (storage blocked, damaged JSON), a damaged part is dropped and the rest kept. */
export function parseProfile(raw: string | null): Profile {
  if (!raw) return emptyProfile();
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== "object") return emptyProfile();
    const known = new Set(ACHIEVEMENTS.map((a) => a.id));
    const unlocked: Record<string, string> = {};
    for (const [id, day] of Object.entries((o.unlocked ?? {}) as Record<string, unknown>)) if (known.has(id)) unlocked[id] = typeof day === "string" ? day : "";
    const unseen = Array.isArray(o.unseen) ? o.unseen.filter((id): id is string => typeof id === "string" && known.has(id) && id in unlocked) : [];
    const t = (o.totals && typeof o.totals === "object" ? o.totals : {}) as Partial<Record<keyof Totals, unknown>>;
    const seen: Record<string, Ledger> = {};
    for (const [id, ledger] of Object.entries((o.seen ?? {}) as Record<string, unknown>)) seen[id] = parseLedger(ledger);
    return { version: 1, unlocked, unseen: [...new Set(unseen)], totals: { gold: num(t.gold), artifacts: num(t.artifacts), riddles: num(t.riddles), dungeons: num(t.dungeons) }, seen };
  } catch {
    return emptyProfile();
  }
}

/**
 * Credits what a game's ledger earned above the high-water mark of that game to the totals, and raises the mark. Returns whether anything changed.
 * Gold counts the income less what was bought back (a sale that is bought back in the same visit is no income); both only grow in a game, so loading an older save credits nothing again.
 */
export function creditLedger(profile: Profile, gameId: string, ledger: Ledger): boolean {
  if (!gameId) return false;
  const seen = (profile.seen[gameId] ??= emptyLedger());
  let changed = false;
  if (ledger.goldIn > seen.goldIn || ledger.goldBack > seen.goldBack) {
    profile.totals.gold = Math.max(0, profile.totals.gold + Math.max(ledger.goldIn - seen.goldIn, 0) - Math.max(ledger.goldBack - seen.goldBack, 0));
    seen.goldIn = Math.max(seen.goldIn, ledger.goldIn);
    seen.goldBack = Math.max(seen.goldBack, ledger.goldBack);
    changed = true;
  }
  for (const key of ["artifacts", "riddles", "dungeons"] as const) {
    if (ledger[key] > seen[key]) {
      profile.totals[key] += ledger[key] - seen[key];
      seen[key] = ledger[key];
      changed = true;
    }
  }
  const ids = Object.keys(profile.seen);
  if (ids.length > SEEN_GAMES) for (const id of ids.slice(0, ids.length - SEEN_GAMES)) if (id !== gameId) delete profile.seen[id];
  return changed;
}

/** The counter achievements whose total has reached the target and that have not dropped yet. */
export function counterUnlocks(profile: Profile): string[] {
  return ACHIEVEMENTS.filter((a) => a.counter && !(a.id in profile.unlocked) && profile.totals[a.counter.key as CounterKey] >= a.counter.target).map((a) => a.id);
}

/** Marks an achievement as dropped. Returns false if it had dropped before (nothing to show). */
export function unlockIn(profile: Profile, id: string, day: string): boolean {
  if (id in profile.unlocked || !ACHIEVEMENTS.some((a) => a.id === id)) return false;
  profile.unlocked[id] = day;
  profile.unseen.push(id);
  return true;
}

/** The share of achievements that have dropped, in whole percent. */
export function percentDone(profile: Profile): number {
  return Math.round((ACHIEVEMENTS.filter((a) => a.id in profile.unlocked).length / ACHIEVEMENTS.length) * 100);
}

/** How far a counter achievement is (0 to its target), or null for the others. */
export function progressOf(profile: Profile, id: string): { value: number; target: number } | null {
  const c = ACHIEVEMENTS.find((a) => a.id === id)?.counter;
  if (!c) return null;
  return { value: id in profile.unlocked ? c.target : Math.min(c.target, profile.totals[c.key]), target: c.target };
}

// ---------------------------------------------------------------- what the heroes themselves show

/** The equipment slots that carry a material (the rings do not). */
const GEAR_SLOTS = ["helmet", "body_armor", "left_hand", "right_hand", "belt", "boots", "ranged_weapon"] as const;
const OBSIDIAN = 8;

/**
 * "Black is beautiful": every slot of weapons and armor holds obsidian (the material 8 and above; the rings carry no material): helmet, body armor, a one-handed weapon, shield, belt, boots and
 * a ranged weapon. A hero whose class cannot hold a shield or a bow (the Wizard, the Cleric) can never get there, as the spec says.
 */
export function isFullyObsidian(c: Character): boolean {
  return GEAR_SLOTS.every((slot) => {
    const item = c.inventory[slot];
    return !!item && !item.quest && item.material >= OBSIDIAN;
  });
}

/** The achievements that `heroUnlocks` looks for. */
export const HERO_ACHIEVEMENTS: readonly string[] = ["unstoppable", "retire", "sick", "obsidian"];

/** "I don't feel so good": poisoned, diseased and crazy at the same time. */
export const isSickAsADog = (c: Character): boolean => c.conditions.includes("Poisoned") && c.conditions.includes("Diseased") && c.conditions.includes("Crazy");

/**
 * The achievements the heroes show right now: level, age (also of a hero who died of it at 80: the age was reached before the roll), the three conditions, the obsidian gear.
 * Cheap enough for every step: a few comparisons per hero. `have` are the ones that dropped already, so the caller can skip the whole look when nothing is left.
 */
export function heroUnlocks(party: Party, have: (id: string) => boolean): string[] {
  const out: string[] = [];
  const want = (id: string) => !have(id) && !out.includes(id);
  if (HERO_ACHIEVEMENTS.every(have)) return out;
  for (const c of party.characters) {
    if (want("unstoppable") && c.level >= UNSTOPPABLE_LEVEL) out.push("unstoppable");
    if (want("retire") && totalAge(party, c) >= OLD_AGE) out.push("retire");
    if (want("sick") && isSickAsADog(c)) out.push("sick");
    if (want("obsidian") && isFullyObsidian(c)) out.push("obsidian");
  }
  return out;
}

/** The passwords of the taverns that the party has heard: a new one is added (distinct); true once there are enough for "Drunk blabbermouth". */
export function notePassword(party: Party, riddle: string): boolean {
  const ach = achOf(party);
  if (!ach.passwords.includes(riddle)) ach.passwords.push(riddle);
  return ach.passwords.length >= TAVERN_PASSWORDS;
}
