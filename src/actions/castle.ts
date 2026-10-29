import { derive, LAYER, Rng, type SeedState } from "../core/rng";
import { BANNER, CASTLE_STATUES, KING, THRONE } from "../data/castles";
import { letterHints } from "../data/letter-hints";
import { CELL, FACING_DELTA, type InteriorMap } from "../interiors/types";
import { hideInChests } from "./machines";
import { pickWord } from "./questGen";
import type { ActionInstance, Anchor, MapContent } from "./types";

/**
 * The objects of a castle (quest document 1.2, castle_1). The castle has no roaming monsters: its guards come when an alarm sounds. Four statues
 * give a four-letter word, the statue near the king wants it, and then the king's two chests (5 million gold each) can be tried; the chests in the
 * yard raise an alarm. The banner of its kind hangs along the walls of the keep, the statues and the throne are those of its kind.
 */

const CHEST_NOBLE = 72;
const CHEST_PLAIN = 1;
/** Cells between two banners on a wall (the document: 2 to 4). */
const BANNER_SPACING = 3;
/** The gold of each of the king's chests. */
export const KING_CHEST_GOLD = 5_000_000;

/** The wall-side cells of the keep in runs along straight walls, a banner every `spacing` cells, centred on the run. */
function bannerCells(map: InteriorMap, taken: ReadonlySet<number>, spacing: number): Anchor[] {
  const castle = map.castle!;
  const floorAt = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR;
  const runs = new Map<string, Anchor[]>();
  for (const i of castle.keep) {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    if (taken.has(i)) continue;
    // a cell with a wall on one side, and floor on the two sides along it
    const wall = (["N", "E", "S", "W"] as const).find((f) => !floorAt(x + FACING_DELTA[f].dx, y + FACING_DELTA[f].dy));
    if (!wall) continue;
    const along = wall === "N" || wall === "S" ? x : y;
    const line = wall === "N" || wall === "S" ? y : x;
    const key = `${wall}:${line}`;
    const list = runs.get(key) ?? [];
    list.push({ x, y, depth: along, roomId: -1 });
    runs.set(key, list);
  }
  const chosen: Anchor[] = [];
  for (const list of [...runs.entries()].sort(([p], [q]) => (p < q ? -1 : 1)).map(([, l]) => l)) {
    list.sort((p, q) => p.depth - q.depth);
    let start = 0;
    for (let i = 1; i <= list.length; i++) {
      if (i < list.length && list[i]!.depth === list[i - 1]!.depth + 1) continue;
      const run = list.slice(start, i);
      start = i;
      if (run.length < 3) continue;
      for (let k = Math.floor(((run.length - 1) % spacing) / 2); k < run.length; k += spacing) chosen.push(run[k]!);
    }
  }
  return chosen;
}

export function buildCastleContent(map: InteriorMap, rootSeed: SeedState): MapContent {
  const castle = map.castle!;
  const seed = derive(rootSeed, LAYER.ACTION, map.key);
  const rng = new Rng(derive(seed, "castle"));
  const tier = Math.min(5, Math.max(1, map.tier));
  const actions: ActionInstance[] = [];
  const counts = new Map<string, number>();
  const uid = (name: string): string => {
    const n = counts.get(name) ?? 0;
    counts.set(name, n + 1);
    return `${map.key}#${name}:${n}`;
  };
  const statue = CASTLE_STATUES[castle.alignment][rng.int(2)]!;

  actions.push({ uid: uid("exit"), kind: "transfer", x: map.exit.x, y: map.exit.y, params: { mode: "poi_exit", tier } });
  // the door of the keep: an iron gate
  const door = castle.door;
  const wallAt = (x: number, y: number) => map.cells[y * map.width + x] !== CELL.FLOOR;
  actions.push({ uid: uid("door"), kind: "door", x: door.x, y: door.y, params: { locked: false, axis: wallAt(door.x, door.y - 1) && wallAt(door.x, door.y + 1) ? "x" : "y" } });
  actions.push({ uid: uid("throne"), kind: "decor", x: castle.throne.x, y: castle.throne.y, params: { item: THRONE[castle.alignment] } });
  actions.push({ uid: uid("king"), kind: "king", x: castle.king.x, y: castle.king.y, params: { persona: KING[castle.alignment], alignment: castle.alignment } });

  // the code word: four letters, one for each statue of the keep; the statue near the king wants it
  const pick = pickWord(rng, 4);
  const { hints, ask } = letterHints(rng, pick.word);
  const order = rng.shuffle([0, 1, 2, 3]);
  castle.statues.forEach((s, i) => {
    const letterIndex = order[i % 4]!;
    actions.push({ uid: uid("statue"), kind: "lore", x: s.x, y: s.y, params: { pool: "castle", line: 0, item: statue, bearing: s.bearing, text: hints[letterIndex]!, letter: pick.word[letterIndex]!.toUpperCase(), order: letterIndex + 1 } });
  });
  const answerUid = uid("riddle");
  actions.push({ uid: answerUid, kind: "riddle", x: castle.answer.x, y: castle.answer.y, params: { item: statue, question: ask, answer: pick.word, aliases: pick.aliases.join(","), opens: "castle", riddle: pick.id } });

  // the king's two chests: sealed until the word is said, then an alarm and the heavy guards, then a lock to pick
  for (const c of castle.kingChests) {
    actions.push({ uid: uid("kingchest"), kind: "treasure", x: c.x, y: c.y, params: { chest: CHEST_NOBLE, level: Math.min(8, tier + 1), gold: KING_CHEST_GOLD, items: 0, lock: "code", requires: answerUid, difficulty: tier + 1 } });
  }
  // the chests in the yard: one level above the castle and twice the loot; the first one tried raises the alarm
  for (const c of castle.yardChests) {
    actions.push({ uid: uid("yardchest"), kind: "treasure", x: c.x, y: c.y, params: { chest: rng.chance(500) ? CHEST_PLAIN : CHEST_NOBLE, level: Math.min(8, tier + 1), gold: (tier + 1) * 140 * 2 + rng.range(0, 200), items: 2, warn: "alarm" } });
  }
  // the banners of its kind along the walls of the keep
  const taken = new Set<number>(actions.map((a) => a.y * map.width + a.x));
  for (const c of bannerCells(map, taken, BANNER_SPACING)) actions.push({ uid: uid("banner"), kind: "decor", x: c.x, y: c.y, params: { item: BANNER[castle.alignment] } });
  hideInChests(map, actions, castle.coins, 0, seed, true);
  return { mapKey: map.key, tier, actions, spawns: [] };
}
