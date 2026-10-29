import RAW from "./riddles-world.json";

/**
 * The riddles of the generated world (riddle statues, mini quests, rumours, quest_6): the user's list from the quest document, cleaned by
 * `tools/export/export_world_riddles.py` (one word per answer, at most four riddles share an answer). The campaign has its own table
 * (`RIDDLES_MASTER`) and does not read this one. Pure data: no DOM, no Babylon.
 */
export interface WorldRiddle {
  question: string;
  /** The one word the riddle stands for. */
  answer: string;
  /** Other words that are right too ("clock" for "watch"). */
  aliases: string[];
}

export const RIDDLES_WORLD = RAW as unknown as Record<string, WorldRiddle>;

/** Riddle numbers in ascending order. */
export const RIDDLE_NUMBERS: readonly number[] = Object.keys(RIDDLES_WORLD)
  .map(Number)
  .sort((a, b) => a - b);

const ARTICLE = /^(a|an|the) /;

/** Lower case, letters and spaces only, no leading article. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(ARTICLE, "");
}

/** Plural and singular are the same word for the player ("boots" = "boot", "teeth" is its own word in the list). */
const stem = (w: string): string => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/** One typing slip (a letter more, less or changed) is allowed in a word of five letters or more. */
function withinOneSlip(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

/** Does the typed text answer the riddle? Case, articles, plurals, the aliases of the riddle and one slip of the finger do not matter. */
export function answerMatches(given: string, riddle: Pick<WorldRiddle, "answer" | "aliases">): boolean {
  const g = normalizeAnswer(given);
  if (g === "") return false;
  return [riddle.answer, ...riddle.aliases].some((w) => {
    const n = normalizeAnswer(w);
    return n === g || stem(n) === stem(g) || withinOneSlip(stem(n), stem(g));
  });
}

/**
 * Riddles that quest_6 can build a word from: one word of 3 to 8 letters (the user's answers to open points 8 and 9) that the question does
 * not give away.
 */
export const WORD_RIDDLES: readonly number[] = RIDDLE_NUMBERS.filter((n) => {
  const r = RIDDLES_WORLD[String(n)]!;
  return /^[a-z]{3,8}$/.test(r.answer) && !new RegExp(`\\b${r.answer}\\b`, "i").test(r.question);
});
