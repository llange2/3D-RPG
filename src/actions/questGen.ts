import { derive, Rng, type SeedState } from "../core/rng";
import type { DungeonTheme } from "../data/dungeon-themes";
import { allowedIn, type Place } from "../data/item-rules";
import { letterHints } from "../data/letter-hints";
import { RIDDLES_WORLD, WORD_RIDDLES } from "../data/riddles";
import { placeOf } from "../interiors/place";
import type { InteriorMap } from "../interiors/types";
import type { AnchorSet } from "./anchors";
import { doorCell, fillEndRoom } from "./endRoom";
import { themeMonsters } from "./monsterPool";
import type { ActionInstance, Anchor, ParamValue, SpawnPoint } from "./types";

/**
 * The quests of the generated world (quest document 1.2): each one is built from what the place offers (rooms, the end room the layout set
 * aside) and checked by `questIssues` in questChecks.ts. A quest puts its objects first, before the ordinary rules fill the place, and
 * `fillEndRoom` puts the loot into the room it opens.
 */

export interface QuestEnv {
  map: InteriorMap;
  theme: DungeonTheme;
  /** The tier of the place. */
  tier: number;
  anchors: AnchorSet;
  mapSeed: SeedState;
  /** The seed of the world, for what is the same in the whole world (the statue of the machines). */
  rootSeed: SeedState;
  actions: ActionInstance[];
  spawns: SpawnPoint[];
  /** Counts of monsters scale with the size of the world: 2/3, 1, 4/3 and 5/3 (document, "Goldene Regeln"). */
  scale: number;
  /** A fresh uid `<map key>#<name>:<n>`. */
  uid(name: string): string;
  /** A random seed of the place for one purpose. */
  derive(name: string): SeedState;
  /** Is the cell a floor cell that nothing uses and that is not next to the way in or out? */
  free(x: number, y: number): boolean;
  /** Puts an action on its cell; false if the cell is taken or the object would cut the place in two. */
  place(a: ActionInstance): boolean;
  /** Puts an action in the end room, where the ordinary rules never reach. */
  placeEnd(a: ActionInstance): boolean;
  /** Keeps a cell clear of the ordinary rules (monsters, props) without putting anything on it. */
  reserve(x: number, y: number): void;
  trapDamage(trap: string, tier: number, rng: Rng): number;
}

export interface QuestResult {
  /** Runs after the ordinary rules, when everything the puzzle counts is where it will stay. */
  finish?: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A number of monsters at the size of the world, at least `min`. */
export const scaled = (n: number, scale: number, min = 1): number => Math.max(min, Math.round(n * scale));

/** The statue of a place: the first of `choices` that the kind of place allows (a stone head in a dungeon, a stone statue in a cave). */
function statueOf(rng: Rng, place: Place, choices: readonly number[]): number {
  const fitting = choices.filter((i) => allowedIn(i, place));
  return fitting.length > 0 ? fitting[rng.int(fitting.length)]! : 95;
}

function edgeSpots(env: QuestEnv, rng: Rng, outside?: { x: number; y: number; w: number; h: number }): Anchor[] {
  const inside = (a: Anchor) => !!outside && a.x >= outside.x && a.y >= outside.y && a.x < outside.x + outside.w && a.y < outside.y + outside.h;
  // the walls of the rooms first, then the ends of side passages (a maze has few rooms but many of those)
  const walls = rng.shuffle(env.anchors.byKind.roomEdge.filter((a) => env.free(a.x, a.y) && !inside(a)));
  const ends = rng.shuffle(env.anchors.byKind.deadEnd.filter((a) => env.free(a.x, a.y) && !inside(a)));
  return [...walls, ...ends];
}

/** Puts `make(spot)` on the first spot that takes it. */
function placeOnFirst(env: QuestEnv, spots: Anchor[], make: (a: Anchor) => ActionInstance): Anchor | null {
  for (const s of spots) if (env.place(make(s))) return s;
  return null;
}

/** The floor cell in front of the end room's seal, where the party stands before the wall. */
function approach(env: QuestEnv): { x: number; y: number } | null {
  const end = env.map.dungeon?.endRoom;
  if (!end?.seal) return null;
  const door = doorCell(env);
  return { x: end.seal.x - (door.x - end.seal.x), y: end.seal.y - (door.y - end.seal.y) };
}

/**
 * Puts an object on the free cell nearest to the end room, for the statue that wants the answer: close to the cell in front of the seal, but not on
 * it (that cell stays open, it is the way to the wall). A place whose end room is a pocket has no such cell: the deepest free cell then. Every
 * candidate is tried in turn, so the statue is placed wherever the place has room for it at all.
 */
function placeNearEnd(env: QuestEnv, make: (x: number, y: number) => ActionInstance, minDistance = 2): Anchor | null {
  const front = approach(env);
  const pool = [...env.anchors.byKind.roomEdge, ...env.anchors.byKind.deadEnd, ...env.anchors.byKind.corridor, ...env.anchors.byKind.roomCenter].filter((a) => env.free(a.x, a.y));
  const dist = (a: Anchor) => (front ? Math.abs(a.x - front.x) + Math.abs(a.y - front.y) : -a.depth);
  const sorted = pool.filter((a) => !front || dist(a) >= minDistance).sort((p, q) => dist(p) - dist(q) || p.y - q.y || p.x - q.x);
  for (const a of sorted) if (env.place(make(a.x, a.y))) return a;
  return null;
}

export function placeQuest(env: QuestEnv): QuestResult {
  const ref = env.map.dungeon;
  if (!ref || ref.quest === "spaceship") return {};
  const rng = new Rng(derive(env.mapSeed, "quest-puzzle", ref.quest));
  let result: QuestResult = {};
  switch (ref.quest) {
    case "quest_1":
      result = movingStatues(env, rng);
      break;
    case "quest_2":
      result = facesAndChalices(env, rng);
      break;
    case "quest_3":
      result = gongs(env, rng);
      break;
    case "quest_4":
      result = calculations(env, rng);
      break;
    case "quest_5":
      result = endBoss(env, rng);
      break;
    case "quest_6":
      result = riddleWord(env, rng);
      break;
  }
  placeMinis(env, new Rng(derive(env.mapSeed, "minis")));
  return result;
}

// ---------------------------------------------------------------- mini quests

const FAILS = ["none", "away", "trap"] as const;

/**
 * The mini quests of a place (quest document 1.2, "Miniquest - Extra Loot"): statues or crystals with a riddle of the world's list, independent of the
 * main quest. Easy statues take any number of answers, hard ones three; a wrong answer does nothing, throws the party away or onto a field of traps. The
 * reward is twice the ordinary loot of the level times the difficulty: 1 or 2 for the answers and 1, 2 or 3 for the penalty (12 at the most).
 */
function placeMinis(env: QuestEnv, rng: Rng): void {
  const ids = env.map.dungeon?.minis ?? [];
  if (ids.length === 0) return;
  const place = placeOf(env.map);
  for (const id of ids) {
    const r = RIDDLES_WORLD[String(id)];
    if (!r) continue;
    const hard = rng.chance(500);
    const fail = rng.int(3);
    const mult = (hard ? 2 : 1) * (fail + 1);
    const item = allowedIn(117, place) && rng.chance(300) ? 117 : statueOf(rng, place, [95, 61, 29, 28, 27]);
    const normalGold = env.tier * 150 + rng.range(0, 200);
    const gold = 2 * mult * normalGold;
    const items = Math.min(10, 2 * mult);
    const spot = placeOnFirst(env, edgeSpots(env, rng), (s) => ({
      uid: env.uid("mini"),
      kind: "riddle",
      x: s.x,
      y: s.y,
      params: { item, question: r.question, answer: r.answer, aliases: r.aliases.join(","), riddle: id, level: Math.min(8, env.tier), gold, items, mult, fail: FAILS[fail]!, tx: 0, ty: 0, damage: 0, ...(hard ? { tries: 3 } : {}) },
    }));
    if (!spot) continue;
    const statue = env.actions[env.actions.length - 1]!;
    if (fail === 0) continue;
    // where a wrong answer throws the party: away to a far place, or onto a trap of its own (a pit, in a cave a puddle of fire)
    const far = rng.shuffle(env.anchors.byKind.roomEdge.filter((a) => a.depth >= 0 && Math.abs(a.x - spot.x) + Math.abs(a.y - spot.y) > 10 && env.free(a.x, a.y)));
    const target = far[0];
    let kind = fail;
    if (!target) kind = 0;
    else if (fail === 2) {
      // the trap of the place if it has one; else a pit, in a cave a puddle of fire
      const cave = env.map.kind === "cave";
      const theme = env.theme.trap !== "none" ? env.theme.trap : cave ? "generic" : "pit";
      const damage = env.trapDamage(theme, env.tier, rng);
      const params: Record<string, ParamValue> = theme === "generic" ? { trap: "generic", damage, element: env.theme.trapElement ?? "fire" } : { trap: theme, damage };
      const field = far.find((a) => env.place({ uid: env.uid("trapfield"), kind: "trap", x: a.x, y: a.y, params }));
      if (field) {
        statue.params.tx = field.x;
        statue.params.ty = field.y;
        statue.params.damage = damage;
      } else kind = 1;
    }
    if (kind === 1) {
      statue.params.tx = target!.x;
      statue.params.ty = target!.y;
    }
    // a penalty that could not be built is a milder one, and the reward follows
    if (kind !== fail) {
      const m = (hard ? 2 : 1) * (kind + 1);
      statue.params.fail = FAILS[kind]!;
      statue.params.mult = m;
      statue.params.gold = 2 * m * normalGold;
      statue.params.items = Math.min(10, 2 * m);
    }
  }
}

// ---------------------------------------------------------------- quest 1: the moaning statues

const HERE: readonly [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function movingStatues(env: QuestEnv, rng: Rng): QuestResult {
  const hall = env.map.dungeon?.hall;
  if (!hall) return {};
  const place = placeOf(env.map);
  // the field lies in the entrance room, a 3 x 3 field with a free ring round it, on the far side from the way in
  const centre = { x: hall.x + (hall.w >> 1), y: hall.y + 3 };
  const statue = statueOf(rng, place, [33, 29]);
  // the solution: the four corners stand and the edges are empty, or (document, "Alternative") one side of three stands and the rest is empty
  const side = rng.chance(300) ? (["N", "E", "S", "W"] as const)[rng.int(4)]! : null;
  const stands = (dx: number, dy: number): boolean => (side === null ? dx !== 0 && dy !== 0 : side === "N" ? dy === -1 : side === "S" ? dy === 1 : side === "W" ? dx === -1 : dx === 1);
  const want = HERE.map(([dx, dy]) => (stands(dx, dy) ? 1 : 0));
  // the start is never the solution: at least two statues differ
  let start = HERE.map(() => rng.int(2));
  while (start.filter((s, i) => s !== want[i]).length < 2) start = HERE.map(() => rng.int(2));

  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) env.reserve(centre.x + dx, centre.y + dy);
  const heads = HERE.map(() => env.uid("moan"));
  const levers = HERE.map(() => env.uid("lever"));
  HERE.forEach(([dx, dy], i) => {
    // the heads in the corners look diagonally out of the field (36th playtest, point 11): the bearing is the compass direction from the middle to the corner
    const corner: Record<string, ParamValue> = dx !== 0 && dy !== 0 ? { bearing: (Math.round((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360 } : {};
    env.actions.push({ uid: heads[i]!, kind: "head", x: centre.x + dx, y: centre.y + dy, params: { mode: "moan", item: statue, start: start[i]!, want: want[i]!, lever: levers[i]!, ...corner } });
  });
  // the middle is bare: it teleports the party into the end room once the field is right, and does nothing before
  env.actions.push({ uid: env.uid("rune"), kind: "rune", x: centre.x, y: centre.y, params: { need: "moan" } });

  // twelve levers in the rest of the place: eight of them set a statue, four do the same without any effect
  const spots = edgeSpots(env, rng, hall);
  let next = 0;
  const take = (a: ActionInstance): void => {
    while (next < spots.length) {
      const s = spots[next++]!;
      if (env.place({ ...a, x: s.x, y: s.y })) return;
    }
  };
  levers.forEach((uid, i) => take({ uid, kind: "lever", x: 0, y: 0, params: { item: 39, target: heads[i]! } }));
  for (let i = 0; i < 4; i++) take({ uid: env.uid("lever"), kind: "lever", x: 0, y: 0, params: { item: 39, target: "" } });

  // the statue at the entrance tells what to do
  const words = side === null ? "Only when all four corners moan will the middle show the way." : `Only when the ${({ N: "north", E: "east", S: "south", W: "west" } as const)[side]} moans will the middle show the way.`;
  const entry = edgeSpots(env, rng).filter((a) => a.roomId === env.anchors.entranceRoom);
  placeOnFirst(env, entry, (s) => ({ uid: env.uid("hint"), kind: "lore", x: s.x, y: s.y, params: { pool: "dungeon", line: 0, item: statue, text: words } }));
  return {};
}

// ---------------------------------------------------------------- quest 2: the faces

const DIRECTIONS = ["N", "E", "S", "W"] as const;
const ORDINAL_HINTS = [
  "I was the first king of this realm.",
  "I was the second to discover Sha'an Island.",
  "I was the third of the brothers who built this hall.",
  "I was the fourth to hold the sword of the old kings.",
  "I was the fifth and last of the guardians.",
];

function facesAndChalices(env: QuestEnv, rng: Rng): QuestResult {
  const hall = env.map.dungeon?.hall;
  if (!hall) return {};
  const place = placeOf(env.map);
  // every number from 1 to 5 once, each with a direction; at least three of the heads start the wrong way (they all look into the room)
  const conditions = env.tier <= 2 ? "Poisoned,Diseased,Crazy,Cursed" : "Petrified,Dead,Paralyzed,Rotten";

  // five heads in a row along a long wall of the hall that no passage leaves through, number 1 on the left of whoever faces the wall
  const solid = (x: number, y: number) => env.map.cells[y * env.map.width + x] !== 1;
  // (a hall whose long walls both have a passage in them gets the row one cell in from a wall)
  const walls = [
    ...rng.shuffle([
      { y: hall.y, wall: hall.y - 1, away: 2, ascending: true },
      { y: hall.y + hall.h - 1, wall: hall.y + hall.h, away: 0, ascending: false },
    ]),
    { y: hall.y + 1, wall: -1, away: 2, ascending: true },
    { y: hall.y + hall.h - 2, wall: -1, away: 0, ascending: false },
  ];
  // (and the seal of the end room may be in the same wall: the way to it must stay clear)
  const front = approach(env);
  const row = walls.find((w) => [0, 1, 2, 3, 4].every((i) => (w.wall < 0 || solid(hall.x + 1 + i * 2, w.wall)) && env.free(hall.x + 1 + i * 2, w.y) && !(front && front.x === hall.x + 1 + i * 2 && front.y === w.y)));
  if (!row) return {};
  let code = [0, 1, 2, 3, 4].map(() => rng.int(4));
  while (code.filter((d) => d !== row.away).length < 3) code = [0, 1, 2, 3, 4].map(() => rng.int(4));
  const head = statueOf(rng, place, [95, 29]);
  for (let dy = 0; dy < hall.h; dy++) for (let dx = 0; dx < hall.w; dx++) env.reserve(hall.x + dx, hall.y + dy);
  code.forEach((want, i) => {
    const column = row.ascending ? i : 4 - i;
    env.actions.push({ uid: env.uid("head"), kind: "head", x: hall.x + 1 + column * 2, y: row.y, params: { mode: "rotate", item: head, order: i + 1, start: row.away, want, hint: ORDINAL_HINTS[i]! } });
  });
  // five chalices in the rest of the place, each tells a number and a direction
  const spots = edgeSpots(env, rng, hall);
  const order = rng.shuffle([0, 1, 2, 3, 4]);
  let next = 0;
  for (const n of order) {
    while (next < spots.length) {
      const s = spots[next++]!;
      if (env.place({ uid: env.uid("chalice"), kind: "chalice", x: s.x, y: s.y, params: { item: 86, number: n + 1, dir: DIRECTIONS[code[n]!]!, conditions } })) break;
    }
  }
  return {};
}

// ---------------------------------------------------------------- quest 3: the gongs

function gongs(env: QuestEnv, rng: Rng): QuestResult {
  const map = env.map;
  const five = rng.chance(250);
  const wanted = five ? 5 : 4;
  const monsters = themeMonsters(env.theme, env.tier).join(",");
  // one gong in each of the corners of the place: the rooms nearest to the corners of the box the rooms span, the fifth in the middle
  const rooms = map.rooms.filter((r) => r.size >= 6);
  const box = rooms.reduce((b, r) => ({ x0: Math.min(b.x0, r.cx), y0: Math.min(b.y0, r.cy), x1: Math.max(b.x1, r.cx), y1: Math.max(b.y1, r.cy) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const targets = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x0, y: box.y1 },
    { x: box.x1, y: box.y1 },
    { x: (box.x0 + box.x1) >> 1, y: (box.y0 + box.y1) >> 1 },
  ].slice(0, wanted);
  const used = new Set<number>();
  const group = scaled(rng.range(5, 7), env.scale, 2);
  const placed: ActionInstance[] = [];
  for (const t of targets) {
    const order = rooms.filter((r) => !used.has(r.id)).sort((a, b) => Math.abs(a.cx - t.x) + Math.abs(a.cy - t.y) - (Math.abs(b.cx - t.x) + Math.abs(b.cy - t.y)) || a.id - b.id);
    for (const room of order) {
      const spots = rng.shuffle(env.anchors.byKind.roomEdge.filter((a) => a.roomId === room.id && env.free(a.x, a.y)));
      const spot = spots.find((s) => env.place({ uid: env.uid("gong"), kind: "gong", x: s.x, y: s.y, params: { item: 118, group, monsters, xp: Math.round(100 / env.scale) } }));
      if (spot) {
        used.add(room.id);
        placed.push(env.actions[env.actions.length - 1]!);
        break;
      }
    }
  }
  // the runes appear in the middle of the place when the last gong has sounded: the floor cell nearest to the middle of the floor
  const floor: { x: number; y: number }[] = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (env.free(x, y)) floor.push({ x, y });
  const mid = floor.length > 0 ? { x: Math.round(floor.reduce((s, c) => s + c.x, 0) / floor.length), y: Math.round(floor.reduce((s, c) => s + c.y, 0) / floor.length) } : { x: map.width >> 1, y: map.height >> 1 };
  const rune = [...floor].sort((a, b) => Math.abs(a.x - mid.x) + Math.abs(a.y - mid.y) - (Math.abs(b.x - mid.x) + Math.abs(b.y - mid.y)) || a.y - b.y || a.x - b.x).find((c) => env.place({ uid: env.uid("rune"), kind: "rune", x: c.x, y: c.y, params: { need: "gongs", item: 73 } }));
  void rune;
  return {};
}

// ---------------------------------------------------------------- quest 4: calculations

const HEROES = ["Gordak", "Waldemar the Bold", "Thorgrim", "Eadric", "Sir Halvard", "Brenna Ironhand"];
const UNITS = ["Bluefinger Garrison", "Ironhelm Company", "Raven Guard", "Pikemen of Eldermoor", "Free Archers of the Marsh"];
const FIELDS = ["Lumpuz", "Castle Elfenstone", "the Black Ford", "Dunmere", "the Salt Pass", "Greywater"];
const TWO_THREE = ["two", "three"] as const;

/** One statue: what its plaque says and how many warriors it adds to the count of the fallen. */
function plaque(rng: Rng): { text: string; fallen: number } {
  const hero = HEROES[rng.int(HEROES.length)]!;
  const unit = UNITS[rng.int(UNITS.length)]!;
  const field = FIELDS[rng.int(FIELDS.length)]!;
  const n = rng.range(4, 45);
  const kind = rng.int(6);
  if (kind === 0) return { text: `'In honour of the hero ${hero}, who fell with his ${n} warriors in the battle of ${field}.'`, fallen: n + 1 };
  if (kind === 1 || kind === 5) return { text: `'In honour of the ${unit}, who lost ${n} of their warriors in the defence of ${field}.'`, fallen: n };
  if (kind === 2) return { text: `'In honour of General ${hero.split(" ")[0]}, whose foresight saved ${n} warriors from certain death.'`, fallen: 0 };
  if (kind === 3) {
    const back = rng.range(1, Math.max(1, n - 2));
    return { text: `'In honour of the ${unit}, who lost ${n} warriors at ${field}. ${back} of them were found alive in the end.'`, fallen: n - back };
  }
  const times = rng.chance(500) ? 0 : 1;
  const per = rng.range(3, 25);
  return { text: `'In honour of the ${TWO_THREE[times]} brothers of ${field}, who each brought ${per} warriors to the field. All of them fell.'`, fallen: (times + 2) * per };
}

function calculations(env: QuestEnv, rng: Rng): QuestResult {
  const place = placeOf(env.map);
  const count = clamp(5 + Math.floor((env.map.rooms.length - 8) / 3), 5, 8);
  const statue = statueOf(rng, place, [28, 34, 95]);
  let sum = 0;
  const spots = edgeSpots(env, rng);
  for (let i = 0; i < count; i++) {
    const p = plaque(rng);
    if (!placeOnFirst(env, spots, (s) => ({ uid: env.uid("statue"), kind: "lore", x: s.x, y: s.y, params: { pool: "dungeon", line: 0, item: statue, text: `The plaque on the statue reads: ${p.text}`, fallen: p.fallen } }))) continue;
    sum += p.fallen;
  }
  const endStatue = statueOf(rng, place, [27, 61]);
  placeNearEnd(env, (x, y) => ({ uid: env.uid("riddle"), kind: "riddle", x, y, params: { item: endStatue, question: "A dull voice speaks: 'How many warriors have fallen with honour?'", answer: String(sum), opens: "end" } }));
  return {};
}

// ---------------------------------------------------------------- quest 5: the end boss

function endBoss(env: QuestEnv, rng: Rng): QuestResult {
  const front = approach(env);
  let spot: { x: number; y: number } | null = front && env.free(front.x, front.y) ? front : null;
  if (!spot) {
    const pool = [...env.anchors.byKind.roomEdge, ...env.anchors.byKind.deadEnd, ...env.anchors.byKind.corridor].filter((a) => env.free(a.x, a.y));
    const dist = (a: Anchor) => (front ? Math.abs(a.x - front.x) + Math.abs(a.y - front.y) : -a.depth);
    spot = pool.sort((p, q) => dist(p) - dist(q) || p.y - q.y || p.x - q.x)[0] ?? null;
  }
  if (spot) {
    env.reserve(spot.x, spot.y);
    env.spawns.push({ uid: env.uid("endboss"), x: spot.x, y: spot.y, monsterIds: [env.theme.boss], boss: true });
  }
  void rng;
  return {};
}

// ---------------------------------------------------------------- quest 6: the riddle word

/** The riddle whose answer the statues spell: a word of 3 to 8 letters (a castle: exactly 4). */
export function pickWord(rng: Rng, length?: number): { id: number; word: string; aliases: string[] } {
  const pool = WORD_RIDDLES.filter((n) => length === undefined || RIDDLES_WORLD[String(n)]!.answer.length === length);
  const id = pool[rng.int(pool.length)]!;
  const r = RIDDLES_WORLD[String(id)]!;
  return { id, word: r.answer, aliases: r.aliases };
}

/** The word, answer and aliases of a riddle of the list of the world. */
export function wordById(id: number): { id: number; word: string; aliases: string[] } {
  const r = RIDDLES_WORLD[String(id)]!;
  return { id, word: r.answer, aliases: r.aliases };
}

function riddleWord(env: QuestEnv, rng: Rng): QuestResult {
  const place = placeOf(env.map);
  const statue = statueOf(rng, place, [95, 61, 34, 29, 28, 27]);
  // as many hint statues as the word has letters, in the rooms; a word longer than the place has spots for is not chosen
  const spots = edgeSpots(env, rng);
  const longest = Math.min(8, Math.max(3, spots.length - 2));
  // the plan chose the riddle (so that a tavern can let the word slip); a place short of room takes a three-letter word instead
  const pick = env.map.dungeon?.word !== undefined ? wordById(env.map.dungeon.word) : pickWord(rng);
  const chosen = pick.word.length <= longest ? pick : pickWord(rng, 3);
  const { hints, ask } = letterHints(rng, chosen.word);
  hints.forEach((text, i) => placeOnFirst(env, spots, (s) => ({ uid: env.uid("statue"), kind: "lore", x: s.x, y: s.y, params: { pool: "dungeon", line: 0, item: statue, text, letter: chosen.word[i]!.toUpperCase(), order: i + 1 } })));
  placeNearEnd(env, (x, y) => ({
    uid: env.uid("riddle"),
    kind: "riddle",
    x,
    y,
    params: { item: statue, question: ask, answer: chosen.word, aliases: chosen.aliases.join(","), opens: "end", riddle: chosen.id },
  }));
  return {};
}

/** Fills the end room once the ordinary rules are done (the loot depends on nothing else, but the room must not have been touched). */
export function finishQuest(env: QuestEnv): void {
  fillEndRoom(env);
}
