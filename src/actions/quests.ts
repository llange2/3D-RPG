import type { ActionInstance, MapContent } from "./types";

/**
 * State of the quest objects of a themed place (docs/DUNGEON_THEMES.md, chapter 2). The save keeps one set of strings for every
 * action that has been used (`opened`); the quests reuse it, so no new field in the save is needed:
 *  - a gong or riddle statue that is done: its uid
 *  - a lever that has been pulled an odd number of times: its uid (pulling again takes it out)
 *  - a rotating head that has been turned: `<uid>=<facing>` (0 north, 1 east, 2 south, 3 west); none means it still has its start facing
 */

export const FACING_NAMES = ["north", "east", "south", "west"] as const;
export const FACING_LETTERS = ["N", "E", "S", "W"] as const;

/** Facing of a rotating head. */
export function headFacing(a: Pick<ActionInstance, "uid" | "params">, opened: ReadonlySet<string>): number {
  for (let f = 0; f < 4; f++) if (opened.has(`${a.uid}=${f}`)) return f;
  return Number(a.params.start ?? 0);
}

/** The state changes that turn a head to a new facing. */
export function turnHead(a: Pick<ActionInstance, "uid" | "params">, opened: ReadonlySet<string>, facing: number): { add: string[]; remove: string[] } {
  const remove: string[] = [];
  for (let f = 0; f < 4; f++) if (opened.has(`${a.uid}=${f}`)) remove.push(`${a.uid}=${f}`);
  return { add: [`${a.uid}=${facing}`], remove };
}

/** Does a head of the ring stand on its cell? It starts as `start` says and flips with every pull of its lever. */
export function ringHeadPresent(a: Pick<ActionInstance, "params">, opened: ReadonlySet<string>): boolean {
  return (Number(a.params.start ?? 0) === 1) !== opened.has(String(a.params.lever ?? ""));
}

const heads = (content: MapContent, mode: string): ActionInstance[] => content.actions.filter((a) => a.kind === "head" && a.params.mode === mode);

/** Heads that a lever sets or removes: the ring of the older quest and the field of moaning statues of quest 1. */
const standing = (content: MapContent): ActionInstance[] => [...heads(content, "ring"), ...heads(content, "moan")];

/** Grid indices of the cells that a head of the ring or a moaning statue blocks right now. */
export function ringBlocked(content: MapContent, width: number, opened: ReadonlySet<string>): number[] {
  return standing(content)
    .filter((a) => ringHeadPresent(a, opened))
    .map((a) => a.y * width + a.x);
}

/**
 * Quest 1: the statues of the field stand where `want` says (1 stands, 0 does not) in all eight outer cells; nothing else counts. The middle then
 * teleports the party into the end room.
 */
export function moanSolved(content: MapContent, opened: ReadonlySet<string>): boolean {
  const field = heads(content, "moan");
  return field.length > 0 && field.every((a) => (Number(a.params.want) === 1) === ringHeadPresent(a, opened));
}

/** The flag in the save that says the end room of a place has been opened (`opened` is saved with the game). */
export const endFlag = (mapKey: string): string => `${mapKey}@end`;

/** The ring is right when a head stands in each of its four corners (the old prover looked at the corners only). */
export function ringSolved(content: MapContent, opened: ReadonlySet<string>): boolean {
  const ring = heads(content, "ring");
  return ring.length > 0 && ring.filter((a) => a.params.corner === true).every((a) => ringHeadPresent(a, opened));
}

/** The row is right when every head faces the way it should. */
export function rotationSolved(content: MapContent, opened: ReadonlySet<string>): boolean {
  const row = heads(content, "rotate");
  return row.length > 0 && row.every((a) => headFacing(a, opened) === Number(a.params.want));
}

/** How many gongs have sounded, and how many there are. */
export function gongsStruck(content: MapContent, opened: ReadonlySet<string>): { done: number; total: number } {
  const gongs = content.actions.filter((a) => a.kind === "gong");
  return { done: gongs.filter((a) => opened.has(a.uid)).length, total: gongs.length };
}

/**
 * The gong that sounded last, once all of them have (40th playtest, point 6): the runes of quest 3 lie round it. `opened` keeps the order things were added in (a
 * save writes it as a list and reads it back in the same order), and a gong is added only by its first strike, so the last gong in the set is the last one struck.
 */
export function finalGong(content: MapContent, opened: ReadonlySet<string>): string | null {
  const gongs = new Set(content.actions.filter((a) => a.kind === "gong").map((a) => a.uid));
  if (gongs.size === 0 || ![...gongs].every((uid) => opened.has(uid))) return null;
  let last: string | null = null;
  for (const key of opened) if (gongs.has(key)) last = key;
  return last;
}

/** Whether a rune of quest 3 is there: all gongs have sounded and the rune lies round the one that came last (a rune without `after` belongs to no gong and shows for any). */
export function gongRuneActive(a: Pick<ActionInstance, "params">, content: MapContent, opened: ReadonlySet<string>): boolean {
  const last = finalGong(content, opened);
  return last !== null && (a.params.after === undefined || a.params.after === last);
}

/**
 * Is the rune there and does it work? The runes of quest 1 lie in the middle of the field and work once it is right; those of quest 3 appear round the last gong; those of
 * quest 2 (42nd playtest, point 6: its end room lies too far from the hall to be sealed next to it, so the right row calls up runes in the hall) appear when every head is right.
 */
export function runeActive(a: Pick<ActionInstance, "params">, content: MapContent, opened: ReadonlySet<string>): boolean {
  if (a.params.need === "moan") return moanSolved(content, opened);
  if (a.params.need === "heads") return rotationSolved(content, opened);
  return gongRuneActive(a, content, opened);
}

/** An answer counts when it matches ignoring case, spaces and a leading article ("a gold coin" is "gold coin"). */
export function sameAnswer(given: string, expected: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/^(a|an|the) /, "").replace(/\s+/g, " ").trim();
  return norm(given) === norm(expected);
}

/** Is this spawn the end boss of quest 5? Its death opens the end room. */
export const isEndBoss = (uid: string): boolean => uid.includes("#q-endboss");
