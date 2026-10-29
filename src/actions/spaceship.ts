import { LAYER, Rng, derive, type SeedState } from "../core/rng";
import { letterHints } from "../data/letter-hints";
import { ORBS_PER_SECTION, ORB, SECTIONS } from "../data/quest-table";
import { CELL, type InteriorMap } from "../interiors/types";
import { stillOpen } from "../interiors/castle";
import { Builder } from "../interiors/builder";
import { pickWord } from "./questGen";
import type { ActionInstance, MapContent, SpawnPoint } from "./types";

/**
 * The objects of the spaceship (quest document 1.2, spaceship_1): the transporter tubes, the airlocks with their levers, the robots, two orbs of ultimate
 * power in every section, power source crystals that bless or hurt, computers that give hints and one that wants the word of quest 6 (it frees the chalices
 * of the control deck, 1 to 2 million experience each). The tube in the middle of the control deck ends the game for a party with the black key card.
 */

const COMPUTER = 68;
const CRYSTAL = 67;
const TUBE = 40;
const LEVER = 39;
const CHALICE = 86;
const ORB_OBJECT = 109;

const COMPUTER_LINES = [
  "The computer hums. Columns of green symbols run down its screen. You cannot read them.",
  "A voice from the terminal: \"Simulation cycle running. All sections nominal. Visitors detected.\"",
  "The screen shows a map of the world, small and blue. A red mark blinks over a pyramid.",
  "\"Warning: the airlocks between the sections are sealed. Manual override needs both levers.\"",
  "The terminal displays the words: THE WORLD IS A GAME. THE GAME IS ALMOST OVER.",
];

export function buildSpaceshipContent(map: InteriorMap, rootSeed: SeedState): MapContent {
  const layout = map.spaceship!;
  const ref = map.dungeon!;
  const seed = derive(rootSeed, LAYER.ACTION, map.key);
  const rng = new Rng(derive(seed, "spaceship"));
  const actions: ActionInstance[] = [];
  const spawns: SpawnPoint[] = [];
  const counts = new Map<string, number>();
  const uid = (name: string): string => {
    const n = counts.get(name) ?? 0;
    counts.set(name, n + 1);
    return `${map.key}#${name}:${n}`;
  };
  const w = map.width;
  const tier = 5;

  // a throw-away builder for the passage rule: the objects that block a cell must not shut a corridor
  const b = new Builder(w, map.height);
  b.cells.set(map.cells);
  const blocked = new Set<number>();
  const canBlock = (x: number, y: number): boolean => {
    const i = y * w + x;
    if (map.cells[i] !== CELL.FLOOR || blocked.has(i)) return false;
    blocked.add(i);
    // (from the same cell for all five pyramids: the objects of the level do not depend on where the party appears)
    if (stillOpen(b, layout.final.front, blocked)) return true;
    blocked.delete(i);
    return false;
  };
  const taken = new Set<number>();
  const put = (a: ActionInstance, blocks: boolean): boolean => {
    const i = a.y * w + a.x;
    if (taken.has(i) || map.cells[i] !== CELL.FLOOR) return false;
    if (blocks && !canBlock(a.x, a.y)) return false;
    taken.add(i);
    actions.push(a);
    return true;
  };

  // the tubes: the way in from a pyramid and out again; the one in the middle of the control deck is the end
  layout.tubes.forEach((t, s) => put({ uid: uid("tube"), kind: "tube", x: t.x, y: t.y, params: { item: TUBE, section: s } }, false));
  put({ uid: uid("final-tube"), kind: "tube", x: layout.final.x, y: layout.final.y, params: { item: TUBE, final: true } }, false);
  // the airlocks, each with a lever in a niche on both sides
  for (const lock of layout.locks) {
    const door = uid("airlock");
    actions.push({ uid: door, kind: "door", x: lock.door.x, y: lock.door.y, params: { locked: false, axis: "x", airlock: true } });
    taken.add(lock.door.y * w + lock.door.x);
    put({ uid: uid("lever"), kind: "lever", x: lock.a.x, y: lock.a.y, params: { item: LEVER, airlock: door, side: "a", target: "" } }, true);
    put({ uid: uid("lever"), kind: "lever", x: lock.b.x, y: lock.b.y, params: { item: LEVER, airlock: door, side: "b", target: "" } }, true);
  }

  const edgeCells = (room: { x: number; y: number; w: number; h: number }): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const edge = x === room.x || y === room.y || x === room.x + room.w - 1 || y === room.y + room.h - 1;
        const nearTube = [...layout.tubes, layout.final].some((t) => Math.abs(t.x - x) <= 1 && Math.abs(t.front.y - y) <= 1 + 1 && Math.abs(t.front.x - x) <= 1);
        const nearLock = layout.locks.some((l) => Math.abs(l.door.x - x) <= 3 && Math.abs(l.door.y - y) <= 3);
        if (edge && !nearTube && !nearLock) out.push({ x, y });
      }
    }
    return rng.shuffle(out);
  };
  const place = (room: { x: number; y: number; w: number; h: number }, make: (x: number, y: number) => ActionInstance, blocks = true): boolean => {
    for (const c of edgeCells(room)) if (put(make(c.x, c.y), blocks)) return true;
    return false;
  };

  // the word of quest 6: the hints are computers in the sections behind the control deck, the answer is asked in the control deck
  const word = pickWord(rng);
  const { hints, ask } = letterHints(rng, word.word);
  const hintRooms = layout.rooms.slice(1).flat();
  hints.forEach((text, i) => {
    const rooms = rng.shuffle([...hintRooms]);
    for (const room of rooms) if (place(room, (x, y) => ({ uid: uid("computer"), kind: "lore", x, y, params: { pool: "dungeon", line: 0, item: COMPUTER, text, letter: word.word[i]!.toUpperCase(), order: i + 1 } }))) break;
  });
  const answerUid = uid("computer-answer");
  place(layout.deck, (x, y) => ({ uid: answerUid, kind: "riddle", x, y, params: { item: COMPUTER, question: ask, answer: word.word, aliases: word.aliases.join(","), opens: "chalices", riddle: word.id } }));
  // the chalices of the control deck, 1 to 2 million experience each, freed by the word
  for (let i = 0; i < 2; i++) {
    place(layout.deck, (x, y) => ({ uid: uid("chalice"), kind: "chalice", x, y, params: { item: CHALICE, bonus: "xp", amount: rng.range(1, 2) * 1_000_000, lock: "code", requires: answerUid } }));
  }

  // every section: robots, two orbs of ultimate power in a chest, crystals and computers
  for (let s = 0; s < SECTIONS; s++) {
    const rooms = layout.rooms[s]!.filter((r, i) => !(s === 0 && i === 0));
    const robots = ref.look.monsters;
    rooms.forEach((room, i) => {
      const entry = layout.tubes[s]!;
      const holdsTube = entry.x >= room.x && entry.x < room.x + room.w && entry.y >= room.y && entry.y < room.y + room.h;
      if (holdsTube) return;
      const cx = room.x + (room.w >> 1);
      const cy = room.y + (room.h >> 1);
      if (map.cells[cy * w + cx] === CELL.FLOOR && !taken.has(cy * w + cx)) {
        const group = 1 + rng.int(3);
        spawns.push({ uid: uid("spawn"), x: cx, y: cy, monsterIds: Array.from({ length: group }, () => robots[rng.int(robots.length)]!), boss: i === 0 });
        taken.add(cy * w + cx);
      }
    });
    const far = rooms[rooms.length - 1] ?? layout.rooms[s]![0]!;
    place(far, (x, y) => ({ uid: uid("orbs"), kind: "treasure", x, y, params: { level: tier, gold: 0, items: 0, quest: ORB, count: ORBS_PER_SECTION, chest: ORB_OBJECT } }));
    for (let k = 0; k < 2; k++) {
      const room = rooms[rng.int(rooms.length)] ?? layout.rooms[s]![0]!;
      if (rng.chance(500)) place(room, (x, y) => ({ uid: uid("crystal"), kind: "shrine", x, y, params: { item: CRYSTAL, effect: rng.chance(600) ? "attribute" : "hurt", amount: rng.chance(500) ? 1 : 2 } }));
      else place(room, (x, y) => ({ uid: uid("computer"), kind: "lore", x, y, params: { pool: "dungeon", line: 0, item: COMPUTER, text: COMPUTER_LINES[rng.int(COMPUTER_LINES.length)]! } }));
    }
  }
  return { mapKey: map.key, tier, actions, spawns };
}
