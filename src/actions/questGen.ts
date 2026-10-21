import { derive, Rng, type SeedState } from "../core/rng";
import type { DungeonTheme } from "../data/dungeon-themes";
import { allowedIn, type Place } from "../data/item-rules";
import { placeOf } from "../interiors/place";
import { RIDDLES_MASTER } from "../data/tables";
import type { InteriorMap } from "../interiors/types";
import type { AnchorSet } from "./anchors";
import { FACING_LETTERS, FACING_NAMES } from "./quests";
import { themeMonsters } from "./monsterPool";
import type { ActionInstance, Anchor, ParamValue } from "./types";

/**
 * The puzzles of the dungeon themes (docs/DUNGEON_THEMES.md, chapter 2): riddle statues, the coordinates of a treasure, gongs and
 * the lords with a sum, the number drawn in the walls, the field of runes, the ring of heads and the row of heads. Each one is built
 * from what the place offers (rooms, a hall the generator set aside) and checked by `questIssues` in validate.ts.
 */

export interface QuestEnv {
  map: InteriorMap;
  theme: DungeonTheme;
  /** The tier of the place. */
  tier: number;
  anchors: AnchorSet;
  mapSeed: SeedState;
  actions: ActionInstance[];
  /** A fresh uid `<map key>#<name>:<n>`. */
  uid(name: string): string;
  /** Is the cell a floor cell that nothing uses and that is not next to the way in or out? */
  free(x: number, y: number): boolean;
  /** Puts an action on its cell; false if the cell is taken or the object would cut the place in two. */
  place(a: ActionInstance): boolean;
  /** Keeps a cell clear of the ordinary rules (monsters, props) without putting anything on it. */
  reserve(x: number, y: number): void;
  trapDamage(trap: string, tier: number, rng: Rng): number;
}

export interface QuestResult {
  /** The chest that the key card goes into, with the lock the puzzle puts on it, instead of the boss room. */
  cardChest?: { x: number; y: number; params: Record<string, ParamValue> };
  /** Runs after the ordinary rules, when everything the puzzle counts is where it will stay. */
  finish?: () => void;
}

/** Riddles of the old table with a short, plain answer. */
const RIDDLE_IDS: number[] = Object.entries(RIDDLES_MASTER)
  .filter(([, r]) => /^[a-z ]{2,18}$/.test(r.answer.toLowerCase()))
  .map(([id]) => Number(id))
  .sort((a, b) => a - b);

/**
 * Statues that stand for the lords, riddle statues and hints: the first of these the theme uses, else the first the kind of place allows
 * (a stone head in a dungeon, a stone statue in a cave: the user's list keeps heads and pegasi out of caves).
 */
const STATUES = [28, 27, 61, 29, 95, 33];
const statueOf = (t: DungeonTheme, place: Place): number => {
  const fitting = STATUES.filter((i) => allowedIn(i, place));
  return fitting.find((i) => t.props.includes(i)) ?? fitting[0] ?? 29;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** What a puzzle pays out: the chest formula of the place, with the theme's share of gold and the level above the ordinary. */
function reward(env: QuestEnv, rng: Rng, extra: number): Record<string, ParamValue> {
  const level = clamp(env.tier + env.theme.loot.level + extra, 1, 8);
  return { level, gold: Math.floor(((level * 150 + rng.range(0, 200)) * env.theme.loot.gold) / 100), items: 1 + (extra > 0 ? 1 : 0) };
}

function edgeSpots(env: QuestEnv, rng: Rng, outside?: { x: number; y: number; w: number; h: number }): Anchor[] {
  const inside = (a: Anchor) => !!outside && a.x >= outside.x && a.y >= outside.y && a.x < outside.x + outside.w && a.y < outside.y + outside.h;
  return rng.shuffle(env.anchors.byKind.roomEdge.filter((a) => env.free(a.x, a.y) && !inside(a)));
}

/** Puts `make(spot)` on the first spot that takes it. */
function placeOnFirst(env: QuestEnv, spots: Anchor[], make: (a: Anchor) => ActionInstance): Anchor | null {
  for (const s of spots) if (env.place(make(s))) return s;
  return null;
}

export function placeQuest(env: QuestEnv): QuestResult {
  const rng = new Rng(derive(env.mapSeed, "quest-puzzle", env.theme.quest));
  switch (env.theme.quest) {
    case "riddle_statues":
      return riddleStatues(env, rng);
    case "coordinates":
      return coordinates(env, rng);
    case "gongs":
      return gongs(env, rng);
    case "map_picture":
      return mapPicture(env, rng);
    case "jump_field":
      return jumpField(env, rng);
    case "head_ring":
      return headRing(env, rng);
    case "head_rotation":
      return headRotation(env, rng);
    default:
      return {};
  }
}

// ---------------------------------------------------------------- riddle statues

function riddleStatues(env: QuestEnv, rng: Rng): QuestResult {
  const count = env.theme.id === "cursed_cold_cavern" ? 4 : 2;
  const ids = rng.shuffle([...RIDDLE_IDS]).slice(0, count);
  const spots = edgeSpots(env, rng);
  for (const id of ids) {
    const r = RIDDLES_MASTER[id]!;
    placeOnFirst(env, spots, (s) => ({
      uid: env.uid("riddle"),
      kind: "riddle",
      x: s.x,
      y: s.y,
      params: { item: statueOf(env.theme, placeOf(env.map)), question: r.question, answer: r.answer.toLowerCase(), riddle: id, ...reward(env, rng, 0) },
    }));
  }
  return {};
}

// ---------------------------------------------------------------- coordinates

const compass = (d: number, neg: string, pos: string) => (d < 0 ? neg : pos);

function coordinates(env: QuestEnv, rng: Rng): QuestResult {
  // The treasure lies at the end of a side passage, or in a corner of a room if no passage is in reach of two statues; the statues
  // tell where it lies from where they stand.
  const deep = [...env.anchors.byKind.deadEnd].filter((a) => env.free(a.x, a.y)).sort((a, b) => b.depth - a.depth || a.y - b.y || a.x - b.x);
  const statues = edgeSpots(env, rng);
  const reach = (t: Anchor) => statues.filter((s) => s.x !== t.x && s.y !== t.y && Math.abs(t.x - s.x) <= REACH && Math.abs(t.y - s.y) <= REACH);
  for (const t of [...deep, ...statues]) {
    const near = reach(t);
    if (near.length < 2) continue;
    if (!env.place({ uid: env.uid("treasure"), kind: "treasure", x: t.x, y: t.y, params: { ...reward(env, rng, 1), chest: env.theme.chest } })) continue;
    let placed = 0;
    for (const s of near) {
      if (placed >= 2) break;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const text = `The treasure lies ${Math.abs(dx)} ${compass(dx, "west", "east")} and ${Math.abs(dy)} ${compass(dy, "north", "south")} of this statue.`;
      if (env.place({ uid: env.uid("hint"), kind: "lore", x: s.x, y: s.y, params: { pool: "dungeon", line: 0, item: statueOf(env.theme, placeOf(env.map)), text, treasure: `${t.x},${t.y}` } })) placed++;
    }
    break;
  }
  return {};
}

/** How far (in cells, along each axis) a statue can send the party to a treasure. */
const REACH = 30;

// ---------------------------------------------------------------- gongs and the lords

function gongs(env: QuestEnv, rng: Rng): QuestResult {
  const monsters = themeMonsters(env.theme, env.tier).join(",");
  const used = new Set<number>();
  const spots = edgeSpots(env, rng);
  const placedGongs: ActionInstance[] = [];
  // one gong to a room as far as the place allows, in the corners of the map in the old game
  for (const pass of [0, 1]) {
    for (const s of spots) {
      if (placedGongs.length >= 4) break;
      if (pass === 0 && used.has(s.roomId)) continue;
      const a: ActionInstance = { uid: env.uid("gong"), kind: "gong", x: s.x, y: s.y, params: { item: 118, group: 1 + Math.floor(env.tier / 2), monsters } };
      if (env.place(a)) {
        placedGongs.push(a);
        used.add(s.roomId);
      }
    }
  }
  const bossSpots = env.anchors.byKind.bossRoomEdge.filter((a) => env.free(a.x, a.y));
  const lord = placeOnFirst(env, [...bossSpots, ...edgeSpots(env, rng)], (s) => ({
    uid: env.uid("lord"),
    kind: "riddle",
    x: s.x,
    y: s.y,
    params: { item: statueOf(env.theme, placeOf(env.map)), question: "?", answer: "0", requires: "gongs", ...reward(env, rng, 2) },
  }));
  const hints: ActionInstance[] = [];
  for (let i = 0; i < 3; i++) {
    const s = placeOnFirst(env, edgeSpots(env, rng), (c) => ({ uid: env.uid("hint"), kind: "lore", x: c.x, y: c.y, params: { pool: "dungeon", line: 0, item: statueOf(env.theme, placeOf(env.map)), text: "?" } }));
    if (s) hints.push(env.actions[env.actions.length - 1]!);
  }
  return {
    finish: () => {
      if (!lord || placedGongs.length === 0) return;
      // the sum the lords describe: start with S, add g for every gong, subtract c for every crystal of the cavern
      const crystals = env.actions.filter((a) => (a.kind === "decor" || a.kind === "shrine") && a.params.item === 117).length;
      const g = rng.range(2, 5);
      const c = rng.range(1, 3);
      const answer = rng.range(25, 70);
      const start = answer - g * placedGongs.length + c * crystals;
      const lines = [`Lord Personality says: "Start with ${start}."`, `Lord Luck says: "Add ${g} for every gong in this cavern."`, `Lord Speed says: "Subtract ${c} for every crystal in this cavern."`];
      hints.forEach((h, i) => {
        h.params.text = lines[i]!;
        h.params.sum = i === 0 ? start : i === 1 ? g : c;
      });
      const master = env.actions.find((a) => a.kind === "riddle" && a.params.requires === "gongs")!;
      master.params.question = "I am Lord Intelligence. My brothers have told you the sum. What is the number?";
      master.params.answer = String(answer);
    },
  };
}

// ---------------------------------------------------------------- the number in the walls

function mapPicture(env: QuestEnv, rng: Rng): QuestResult {
  const dungeon = env.map.dungeon;
  if (!dungeon?.hall || !dungeon.glyph) return {};
  placeOnFirst(env, edgeSpots(env, rng, dungeon.hall), (s) => ({
    uid: env.uid("riddle"),
    kind: "riddle",
    x: s.x,
    y: s.y,
    params: { item: statueOf(env.theme, placeOf(env.map)), question: "I guard a secret number. It is written in the walls of the great hall, for those who can read a map. What is it?", answer: dungeon.glyph!, ...reward(env, rng, 1) },
  }));
  return {};
}

// ---------------------------------------------------------------- the field of runes

function jumpField(env: QuestEnv, rng: Rng): QuestResult {
  const hall = env.map.dungeon?.hall;
  if (!hall) return {};
  const mid = hall.y + Math.floor(hall.h / 2);
  const centre = { x: hall.x + Math.floor(hall.w / 2), y: mid };
  const back = { x: hall.x, y: mid };
  const inner = { x0: hall.x + 1, y0: hall.y + 1, x1: hall.x + hall.w - 2, y1: hall.y + hall.h - 2 };
  const key = (x: number, y: number) => `${x},${y}`;

  // the way through: from the west side of the field to its middle, with turns, over cells that hold nothing
  const safe = new Set<string>();
  let x = inner.x0;
  let y = clamp(mid + rng.range(-3, 3), inner.y0, inner.y1);
  safe.add(key(x, y));
  // it ends on the cell west of the middle, so it never runs over the cells of the two chests above and below the middle
  const door = { x: centre.x - 1, y: centre.y };
  while (x !== door.x || y !== door.y) {
    const wantX = x !== door.x;
    const wantY = y !== door.y;
    if (wantX && (!wantY || rng.chance(550))) x += Math.sign(door.x - x);
    else if (wantY) y += Math.sign(door.y - y);
    safe.add(key(x, y));
  }
  safe.add(key(centre.x, centre.y));
  const chests = [
    { x: centre.x, y: centre.y - 1 },
    { x: centre.x, y: centre.y + 1 },
  ];
  for (const c of chests) safe.add(key(c.x, c.y));
  const chestCells = new Set(chests.map((c) => key(c.x, c.y)));

  const visible = env.theme.id === "maze_from_hell";
  const traps = env.theme.trap !== "none" && env.theme.trap !== "steal_gold";
  for (let cy = inner.y0; cy <= inner.y1; cy++) {
    for (let cx = inner.x0; cx <= inner.x1; cx++) {
      if (chestCells.has(key(cx, cy))) continue;
      if (safe.has(key(cx, cy)) || !env.free(cx, cy)) {
        env.reserve(cx, cy);
        continue;
      }
      if (!rng.chance(380)) {
        env.reserve(cx, cy);
        continue;
      }
      if (traps && rng.chance(330)) {
        env.place({ uid: env.uid("trap"), kind: "trap", x: cx, y: cy, params: { trap: env.theme.trap, damage: env.trapDamage(env.theme.trap, env.tier, rng) } });
      } else {
        // the runes of the Maze from Hell are drawn on the floor, the ones of the Slithercult are not
        env.place({ uid: env.uid("rune"), kind: "teleporter", x: cx, y: cy, params: { tx: back.x, ty: back.y, ...(visible ? { item: 73 } : {}) } });
      }
    }
  }
  for (const c of chests) env.place({ uid: env.uid("treasure"), kind: "treasure", x: c.x, y: c.y, params: { ...reward(env, rng, 1), chest: env.theme.chest } });
  env.reserve(back.x, back.y);
  env.place({
    uid: env.uid("hint"),
    kind: "lore",
    x: hall.x,
    y: mid - 2,
    params: {
      pool: "dungeon",
      line: 0,
      text: visible ? "Runes are carved into the floor of this hall. Whoever steps on one is thrown back to the door. Jump over them, or find the way between." : "Some of the floor in this hall is not what it seems. Whoever steps on the wrong stone is thrown back to the door. Remember where it happened.",
    },
  });
  // the ring of floor around the field is the way to its door: nothing else may stand on it
  for (let ry = hall.y; ry < hall.y + hall.h; ry++) for (let rx = hall.x; rx < hall.x + hall.w; rx++) env.reserve(rx, ry);
  return {};
}

// ---------------------------------------------------------------- the ring of heads

function headRing(env: QuestEnv, rng: Rng): QuestResult {
  const hall = env.map.dungeon?.hall;
  if (!hall) return {};
  const cx = hall.x + Math.floor(hall.w / 2);
  const cy = hall.y + Math.floor(hall.h / 2);
  // the eight cells around the middle: corners first, then the sides
  const cells: { x: number; y: number; corner: boolean }[] = [
    { x: cx - 1, y: cy - 1, corner: true },
    { x: cx + 1, y: cy - 1, corner: true },
    { x: cx - 1, y: cy + 1, corner: true },
    { x: cx + 1, y: cy + 1, corner: true },
    { x: cx, y: cy - 1, corner: false },
    { x: cx + 1, y: cy, corner: false },
    { x: cx, y: cy + 1, corner: false },
    { x: cx - 1, y: cy, corner: false },
  ];
  // two corners start empty, two sides start empty (so that the middle can be reached), the rest stand
  const emptyCorners = new Set(rng.shuffle([0, 1, 2, 3]).slice(0, 2));
  const emptySides = new Set(rng.shuffle([4, 5, 6, 7]).slice(0, 2));
  const headUids = cells.map(() => env.uid("head"));
  const leverUids = cells.map(() => env.uid("lever"));
  cells.forEach((c, i) => {
    const start = c.corner ? (emptyCorners.has(i) ? 0 : 1) : emptySides.has(i) ? 0 : 1;
    const head: ActionInstance = { uid: headUids[i]!, kind: "head", x: c.x, y: c.y, params: { item: 33, mode: "ring", start, lever: leverUids[i]!, corner: c.corner } };
    env.reserve(c.x, c.y);
    env.actions.push(head);
  });
  env.reserve(cx, cy);
  // eight levers that work and eight that look the same and do nothing, scattered over the other rooms
  const spots = edgeSpots(env, rng, hall);
  let used = 0;
  const next = (): Anchor | undefined => spots[used++];
  cells.forEach((_, i) => {
    for (let tries = 0; tries < spots.length; tries++) {
      const s = next();
      if (!s) return;
      if (env.place({ uid: leverUids[i]!, kind: "lever", x: s.x, y: s.y, params: { item: 39, target: headUids[i]! } })) return;
    }
  });
  for (let i = 0; i < 8; i++) {
    const s = next();
    if (s) env.place({ uid: env.uid("lever"), kind: "lever", x: s.x, y: s.y, params: { item: 39, target: "" } });
  }
  // the hint on a coffin or a stone head
  for (let i = 0; i < 2; i++) {
    placeOnFirst(env, edgeSpots(env, rng, hall), (s) => ({
      uid: env.uid("hint"),
      kind: "lore",
      x: s.x,
      y: s.y,
      params: { pool: "dungeon", line: 0, item: env.theme.props.includes(62) ? 62 : 33, text: "Only if the corners groan, the middle will reveal my master." },
    }));
  }
  return { cardChest: { x: cx, y: cy, params: { lock: "ring" } } };
}

// ---------------------------------------------------------------- the row of heads

function headRotation(env: QuestEnv, rng: Rng): QuestResult {
  const hall = env.map.dungeon?.hall;
  if (!hall) return {};
  const cx = hall.x + Math.floor(hall.w / 2);
  const cy = hall.y + Math.floor(hall.h / 2);
  const columns = [2, 4, 6, 8, 10].map((d) => hall.x + d);
  const wants = columns.map(() => rng.int(4));
  // at least three of the heads start the wrong way
  const starts = wants.map((w) => (w + 1 + rng.int(3)) % 4);
  columns.forEach((x, i) => {
    env.reserve(x, hall.y + 2);
    env.actions.push({ uid: env.uid("head"), kind: "head", x, y: hall.y + 2, params: { item: 29, mode: "rotate", start: starts[i]!, want: wants[i]! } });
  });
  // the cups in a row below them: whoever drinks sees the way the head above should look
  columns.forEach((x, i) => {
    const text = `You drink from the chalice. A vision shows you a stone head that looks ${FACING_NAMES[wants[i]!]}: the letter ${FACING_LETTERS[wants[i]!]}.`;
    env.place({ uid: env.uid("chalice"), kind: "lore", x, y: hall.y + 8, params: { pool: "dungeon", line: 0, item: 86, text, letter: FACING_LETTERS[wants[i]!]! } });
  });
  env.reserve(cx, cy);
  env.place({
    uid: env.uid("hint"),
    kind: "lore",
    x: hall.x,
    y: cy,
    params: { pool: "dungeon", line: 0, text: "Drink from the cups, turn the heads to see what the cups have shown you, and the chest will open." },
  });
  return { cardChest: { x: cx, y: cy, params: { lock: "rotation" } } };
}
