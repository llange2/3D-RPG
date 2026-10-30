import { derive, LAYER, Rng, type SeedState } from "../core/rng";
import { BANNER, CASTLE_STATUES, KING, THRONE } from "../data/castles";
import { letterHints } from "../data/letter-hints";
import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import { hideInChests } from "./machines";
import { pickWord, wordById } from "./questGen";
import type { ActionInstance, Anchor, MapContent } from "./types";

/**
 * The objects of a castle (quest document 1.2, castle_1). The castle has no roaming monsters: its guards come when an alarm sounds. Four statues
 * give a four-letter word, the statue near the king wants it, and then the king's two chests (5 million gold each) can be tried; the chests in the
 * niches raise an alarm. The banner of its kind hangs along the walls of the keep (across from every niche, too), the statues and the throne are those of its kind.
 */

const CHEST_NOBLE = 72;
const CHEST_PLAIN = 1;
/** Cells between two banners on a wall (the document: 2 to 4). */
const BANNER_SPACING = 3;
/** The gold of each of the king's chests. */
export const KING_CHEST_GOLD = 5_000_000;

const FACINGS: readonly Facing[] = ["N", "E", "S", "W"];
const OPPOSITE: Record<Facing, Facing> = { N: "S", E: "W", S: "N", W: "E" };
/** Compass bearing in degrees of a model that looks the given way (0 north), as the objects of the interior view take it. */
const BEARING: Record<Facing, number> = { N: 0, E: 90, S: 180, W: 270 };

/**
 * The wall-side cells of the keep in runs along straight walls, a banner every `spacing` cells, centred on the run. `facing` is the way the banner
 * looks, away from the wall it hangs on (a banner in a corridor with two walls used to be turned along the corridor and stood across it, 31st playtest).
 */
function bannerCells(map: InteriorMap, taken: ReadonlySet<number>, spacing: number): (Anchor & { facing: Facing })[] {
  const castle = map.castle!;
  const floorAt = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR;
  const runs = new Map<string, (Anchor & { facing: Facing })[]>();
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
    list.push({ x, y, depth: along, roomId: -1, facing: OPPOSITE[wall] });
    runs.set(key, list);
  }
  const chosen: (Anchor & { facing: Facing })[] = [];
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

  // the gate of the keep is the way out: the party starts inside it
  actions.push({ uid: uid("exit"), kind: "transfer", x: map.exit.x, y: map.exit.y, params: { mode: "poi_exit", tier } });
  actions.push({ uid: uid("throne"), kind: "decor", x: castle.throne.x, y: castle.throne.y, params: { item: THRONE[castle.alignment] } });
  actions.push({ uid: uid("king"), kind: "king", x: castle.king.x, y: castle.king.y, params: { persona: KING[castle.alignment], alignment: castle.alignment } });

  // the code word: four letters, one for each statue of the keep; the statue near the king wants it
  const pick = castle.word > 0 ? wordById(castle.word) : pickWord(rng, 4);
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
  // the chests in the niches: one level above the castle and twice the loot; the first one tried raises the alarm
  for (const c of castle.alarmChests) {
    actions.push({ uid: uid("alarmchest"), kind: "treasure", x: c.x, y: c.y, params: { chest: rng.chance(500) ? CHEST_PLAIN : CHEST_NOBLE, level: Math.min(8, tier + 1), gold: (tier + 1) * 140 * 2 + rng.range(0, 200), items: 2, warn: "alarm" } });
  }
  const taken = new Set<number>(actions.map((a) => a.y * map.width + a.x));
  // nothing hangs in the cells round the gate and the start (the spawn zone of the validation)
  for (const c of [map.spawn, map.exit]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) taken.add((c.y + dy) * map.width + c.x + dx);
  const banner =(x: number, y: number, facing: Facing): void => {
    taken.add(y * map.width + x);
    actions.push({ uid: uid("banner"), kind: "decor", x, y, params: { item: BANNER[castle.alignment], bearing: BEARING[facing] } });
  };
  // a banner on the wall across from every niche, looking at it (the wall behind the cell in front of the niche)
  const floorAt = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR;
  for (const c of castle.alarmChests) {
    const f = FACINGS.find((o) => floorAt(c.x + FACING_DELTA[o].dx, c.y + FACING_DELTA[o].dy));
    if (!f) continue;
    const { dx, dy } = FACING_DELTA[f];
    const front = { x: c.x + dx, y: c.y + dy };
    if (!taken.has(front.y * map.width + front.x) && !floorAt(front.x + dx, front.y + dy)) banner(front.x, front.y, OPPOSITE[f]);
  }
  // the banners of its kind along the walls of the keep
  for (const c of bannerCells(map, taken, BANNER_SPACING)) banner(c.x, c.y, c.facing);
  hideInChests(map, actions, castle.coins, 0, seed, true);
  return { mapKey: map.key, tier, actions, spawns: [] };
}
