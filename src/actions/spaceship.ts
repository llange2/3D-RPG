import { LAYER, Rng, derive, type SeedState } from "../core/rng";
import {
  BRIDGE,
  BROKEN_CRYSTAL_ITEM,
  COMPUTER_ITEM,
  CONSOLE_CLEAR,
  CONSOLE_ITEM,
  CONTROL_ROOM,
  CRATE_ITEM,
  ENGINE_ROOM,
  LIFE_SUPPORT,
  ORB,
  ORBS_PER_SECTION,
  POWER_CRYSTAL,
  POWER_CRYSTAL_ITEM,
  SECTIONS,
  STORAGE_BAY,
} from "../data/quest-table";
import { CODE_LINES_PER_PAGE, CODE_TITLE } from "../data/ship-texts";
import { MONSTERS, monsterGroup } from "../data/tables";
import { CELL, type InteriorMap } from "../interiors/types";
import { stillOpen } from "../interiors/castle";
import { Builder } from "../interiors/builder";
import { blocksPassage } from "../interiors/passage";
import type { ActionInstance, MapContent, SpawnPoint } from "./types";

/**
 * The objects of the spaceship (quest document 1.5, quest_7): the transporter tubes, the four airlocks with their levers, robots (terminators guard the bridge, in the others
 * they are rare), two orbs of ultimate power in every section but the bridge, ten crates in the storage bay (eight with pills and serum, two with a spare power crystal), four
 * power crystals and a broken one in the engine room and in life support, in the control room the status computer and the computers with the code words of the mini quests, and
 * the console of the bridge that ends the game for a party with working engines, life support and the black key card (`shipTerminal` in `handlers.ts`).
 */

const TUBE = 40;
const LEVER = 39;
const ORB_OBJECT = 109;
/** The terminator (monster 69), the robot of the bridge. */
const TERMINATOR = 69;
/** How rare a terminator is among the robots of the other sections: about one in twelve (percent). */
const RARE_TERMINATOR_PERCENT = 8;

const COMPUTER_LINES = [
  "The computer hums. Columns of green symbols run down its screen. You cannot read them.",
  "A voice from the terminal: \"Simulation cycle running. All sections nominal. Visitors detected.\"",
  "The screen shows a map of the world, small and blue. A red mark blinks over a pyramid.",
  "\"Warning: the airlocks between the sections are sealed. Manual override needs both levers.\"",
  "The terminal displays the words: THE WORLD IS A GAME. THE GAME IS ALMOST OVER.",
];

const ATTRIBUTES = ["str", "int", "per", "end", "spd", "acc", "lck"] as const;
const ELEMENTS = ["fire", "ice", "acid", "magic"] as const;
/** The ten crates of the storage bay: eight with pills and serum, two with a power crystal. */
const CRATES = ["xp", "xp", "attr", "attr", "attr", "res", "res", "res", "crystal", "crystal"] as const;

type Room = { x: number; y: number; w: number; h: number };

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
  const taken = new Set<number>();
  const canBlock = (x: number, y: number): boolean => {
    const i = y * w + x;
    if (map.cells[i] !== CELL.FLOOR || blocked.has(i)) return false;
    // the user's rule for objects: never in a passage, and in a wider place so that the party can walk round it (`interiors/passage.ts`; the crates narrowed doorways and corners)
    if (blocksPassage((cx, cy) => b.isFloor(cx, cy) && !blocked.has(cy * w + cx), (cx, cy) => taken.has(cy * w + cx), x, y)) return false;
    blocked.add(i);
    // (from the same cell for all five pyramids: the objects of the level do not depend on where the party appears)
    if (stillOpen(b, layout.console.front, blocked)) return true;
    blocked.delete(i);
    return false;
  };
  /** The cells round the console stay free, so that it can be seen and walked round (it is big and may reach into them). */
  const clear = new Set<number>();
  const put = (a: ActionInstance, blocks: boolean): boolean => {
    const i = a.y * w + a.x;
    if (taken.has(i) || map.cells[i] !== CELL.FLOOR || clear.has(i)) return false;
    if (blocks && !canBlock(a.x, a.y)) return false;
    taken.add(i);
    actions.push(a);
    return true;
  };

  // the tubes: the way in from a pyramid and out again, one in every section
  layout.tubes.forEach((t, s) => put({ uid: uid("tube"), kind: "tube", x: t.x, y: t.y, params: { item: TUBE, section: s } }, false));
  // the console in the middle of the bridge's hall (nothing is built around it: two cells all round stay free)
  put({ uid: uid("console"), kind: "lore", x: layout.console.x, y: layout.console.y, params: { item: CONSOLE_ITEM, terminal: "console", pool: "dungeon", line: 0, bearing: 180 } }, false);
  for (let dy = -CONSOLE_CLEAR; dy <= CONSOLE_CLEAR; dy++) for (let dx = -CONSOLE_CLEAR; dx <= CONSOLE_CLEAR; dx++) clear.add((layout.console.y + dy) * w + layout.console.x + dx);
  // the airlocks, each with a lever in a niche on both sides
  for (const lock of layout.locks) {
    const door = uid("airlock");
    actions.push({ uid: door, kind: "door", x: lock.door.x, y: lock.door.y, params: { locked: false, axis: lock.axis, airlock: true } });
    taken.add(lock.door.y * w + lock.door.x);
    put({ uid: uid("lever"), kind: "lever", x: lock.a.x, y: lock.a.y, params: { item: LEVER, airlock: door, side: "a", target: "" } }, true);
    put({ uid: uid("lever"), kind: "lever", x: lock.b.x, y: lock.b.y, params: { item: LEVER, airlock: door, side: "b", target: "" } }, true);
  }

  // the doors of the sections (6. 11. 2026): sliding doors like the airlocks, but they shut again behind the party. One in each corridor that leaves a room, two to four cells outside it,
  // in a straight piece of the corridor (walls on both sides of it and of the cells before and behind it, so that the frame stands in a wall and no rounded corner reaches into it)
  const isFloor = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < map.height && map.cells[y * w + x] === CELL.FLOOR;
  const keepsOff = (x: number, y: number): boolean =>
    layout.locks.some((l) => Math.abs(l.door.x - x) <= 4 && Math.abs(l.door.y - y) <= 4) || layout.tubes.some((t) => Math.abs(t.x - x) <= 2 && Math.abs(t.y - y) <= 2) || (Math.abs(layout.console.x - x) <= CONSOLE_CLEAR + 1 && Math.abs(layout.console.y - y) <= CONSOLE_CLEAR + 1);
  const straightFor = (x: number, y: number, axis: "x" | "y"): boolean => {
    const along = axis === "x" ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 };
    const side = axis === "x" ? { dx: 0, dy: 1 } : { dx: 1, dy: 0 };
    if (!isFloor(x, y) || !isFloor(x - along.dx, y - along.dy) || !isFloor(x + along.dx, y + along.dy)) return false;
    for (const k of [-1, 0, 1]) for (const s of [-1, 1]) if (isFloor(x + along.dx * k + side.dx * s, y + along.dy * k + side.dy * s)) return false;
    return true;
  };
  const doorCells: { x: number; y: number }[] = [];
  const sides = [
    { dx: -1, dy: 0, axis: "x" as const },
    { dx: 1, dy: 0, axis: "x" as const },
    { dx: 0, dy: -1, axis: "y" as const },
    { dx: 0, dy: 1, axis: "y" as const },
  ];
  for (const rooms of layout.rooms) {
    for (const r of rooms) {
      for (const s of sides) {
        // every cell along the wall that the direction points at: the corridor cell leaves the room from there
        const edge: { x: number; y: number }[] = [];
        if (s.axis === "x") for (let y = r.y; y < r.y + r.h; y++) edge.push({ x: s.dx < 0 ? r.x : r.x + r.w - 1, y });
        else for (let x = r.x; x < r.x + r.w; x++) edge.push({ x, y: s.dy < 0 ? r.y : r.y + r.h - 1 });
        for (const e of edge) {
          for (let dist = 2; dist <= 4; dist++) {
            const x = e.x + s.dx * dist;
            const y = e.y + s.dy * dist;
            // (the cells between the room and the door are floor: the corridor)
            if (!isFloor(e.x + s.dx, e.y + s.dy) || !straightFor(x, y, s.axis) || keepsOff(x, y)) continue;
            if (taken.has(y * w + x) || doorCells.some((d) => Math.abs(d.x - x) + Math.abs(d.y - y) < 4)) continue;
            doorCells.push({ x, y });
            actions.push({ uid: uid("door"), kind: "door", x, y, params: { locked: false, axis: s.axis, slide: true } });
            taken.add(y * w + x);
            break;
          }
        }
      }
    }
  }

  const edgeCells = (room: Room): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const edge = x === room.x || y === room.y || x === room.x + room.w - 1 || y === room.y + room.h - 1;
        const nearTube = layout.tubes.some((t) => Math.abs(t.x - x) <= 1 && Math.abs(t.front.y - y) <= 1 + 1 && Math.abs(t.front.x - x) <= 1);
        const nearLock = layout.locks.some((l) => Math.abs(l.door.x - x) <= 3 && Math.abs(l.door.y - y) <= 3);
        if (edge && !nearTube && !nearLock) out.push({ x, y });
      }
    }
    return rng.shuffle(out);
  };
  const place = (room: Room, make: (x: number, y: number) => ActionInstance, blocks = true): boolean => {
    for (const c of edgeCells(room)) if (put(make(c.x, c.y), blocks)) return true;
    return false;
  };
  /** Puts something in one of the rooms of a section, the ones in the list first (by chance), the others if there is no room left. */
  const placeIn = (rooms: readonly Room[], make: (x: number, y: number) => ActionInstance): boolean => {
    for (const room of rng.shuffle([...rooms])) if (place(room, make)) return true;
    return false;
  };
  /**
   * Puts something in the room of the list that holds the fewest of its kind so far (`tally`; by chance among equals), so that the crystals, the crates and the orbs of a
   * section are spread over its rooms and not heaped in one (user, 6. 11. 2026: all the crystals lay in one room).
   */
  const spread = (rooms: readonly Room[], tally: Map<Room, number>, make: (x: number, y: number) => ActionInstance): boolean => {
    const order = rng.shuffle([...rooms]).sort((p, q) => (tally.get(p) ?? 0) - (tally.get(q) ?? 0));
    for (const room of order) {
      if (!place(room, make)) continue;
      tally.set(room, (tally.get(room) ?? 0) + 1);
      return true;
    }
    return false;
  };
  const holdsTube = (room: Room, s: number): boolean => {
    const t = layout.tubes[s]!;
    return t.x >= room.x && t.x < room.x + room.w && t.y >= room.y && t.y < room.y + room.h;
  };
  /** The rooms of a section that take objects: not the hall of the bridge and not the room with the section's transporter tube (user, 6. 11. 2026), unless nothing else is left. */
  const roomsOf = (s: number): Room[] => {
    const rooms = layout.rooms[s]!.filter((r) => !(s === BRIDGE && r === layout.hall));
    const free = rooms.filter((r) => !holdsTube(r, s));
    return free.length > 0 ? free : rooms;
  };

  // the bridge's guards, the other sections' robots, two orbs in each section but the bridge
  // (the terminators have their own share: the other robots come first in the other sections, a terminator is rare there)
  // (every robot of the game turns up somewhere in the four sections, not only the ones of the place's look (user, 6. 11. 2026: there were only ED-409 and terminators):
  // the robots are dealt from a shuffled deck that is refilled when it is empty, so each of them comes before any is dealt twice)
  const robots = Object.keys(MONSTERS).map(Number).filter((id) => monsterGroup(id) === "robot" && id !== TERMINATOR);
  let deck: number[] = [];
  const pickRobot = (s: number): number => {
    if (s === BRIDGE) return TERMINATOR;
    if (rng.int(100) < RARE_TERMINATOR_PERCENT || robots.length === 0) return TERMINATOR;
    if (deck.length === 0) deck = rng.shuffle([...robots]);
    return deck.pop()!;
  };
  for (let s = 0; s < SECTIONS; s++) {
    const rooms = layout.rooms[s]!;
    rooms.forEach((room, i) => {
      if (holdsTube(room, s)) return;
      const hall = room === layout.hall;
      // the hall of the bridge: a group in each corner, around the console; the other rooms one group in the middle
      const cells = hall
        ? [
            { x: room.x + 2, y: room.y + 2 },
            { x: room.x + room.w - 3, y: room.y + 2 },
            { x: room.x + 2, y: room.y + room.h - 3 },
            { x: room.x + room.w - 3, y: room.y + room.h - 3 },
          ]
        : [{ x: room.x + (room.w >> 1), y: room.y + (room.h >> 1) }];
      for (const c of cells) {
        if (map.cells[c.y * w + c.x] !== CELL.FLOOR || taken.has(c.y * w + c.x)) continue;
        const group = 2 + rng.int(2);
        const ids = Array.from({ length: s === BRIDGE ? group + 1 : 1 + rng.int(3) }, () => pickRobot(s));
        spawns.push({ uid: uid("spawn"), x: c.x, y: c.y, monsterIds: ids, boss: s !== BRIDGE && i === 0 });
        taken.add(c.y * w + c.x);
      }
    });
    if (s === BRIDGE) continue;
    // an orb of its own for every orb, not two in one (31st playtest, point 11), in different rooms
    const orbRooms = new Map<Room, number>();
    for (let k = 0; k < ORBS_PER_SECTION; k++) {
      spread(roomsOf(s), orbRooms, (x, y) => ({ uid: uid("orbs"), kind: "treasure", x, y, params: { level: tier, gold: 0, items: 0, quest: ORB, chest: ORB_OBJECT } }));
    }
  }

  // the storage bay: ten crates
  const storage = roomsOf(STORAGE_BAY);
  const crateRooms = new Map<Room, number>();
  rng.shuffle([...CRATES]).forEach((what, i) => {
    if (what === "crystal") {
      spread(storage, crateRooms, (x, y) => ({ uid: uid("crate"), kind: "treasure", x, y, params: { level: tier, gold: 0, items: 0, quest: POWER_CRYSTAL, chest: CRATE_ITEM } }));
    } else if (what === "xp") {
      spread(storage, crateRooms, (x, y) => ({ uid: uid("crate"), kind: "chalice", x, y, params: { item: CRATE_ITEM, bonus: "xp", amount: 1_000_000, serum: i } }));
    } else if (what === "attr") {
      spread(storage, crateRooms, (x, y) => ({ uid: uid("crate"), kind: "chalice", x, y, params: { item: CRATE_ITEM, bonus: "attr", attr: ATTRIBUTES[rng.int(ATTRIBUTES.length)]!, amount: 15 } }));
    } else {
      spread(storage, crateRooms, (x, y) => ({ uid: uid("crate"), kind: "chalice", x, y, params: { item: CRATE_ITEM, bonus: "res", element: ELEMENTS[rng.int(ELEMENTS.length)]!, amount: 30 } }));
    }
  });

  // the engine room and life support: four power crystals and a broken one, spread over the rooms (none in the room of the tube)
  for (const [section, reactor] of [[ENGINE_ROOM, "engine"], [LIFE_SUPPORT, "life"]] as const) {
    const rooms = roomsOf(section);
    const crystalRooms = new Map<Room, number>();
    spread(rooms, crystalRooms, (x, y) => ({ uid: uid("crystal"), kind: "lore", x, y, params: { item: BROKEN_CRYSTAL_ITEM, terminal: "crystal", reactor, pool: "dungeon", line: 0 } }));
    for (let k = 0; k < 4; k++) spread(rooms, crystalRooms, (x, y) => ({ uid: uid("crystal"), kind: "decor", x, y, params: { item: POWER_CRYSTAL_ITEM, reactor } }));
  }

  // the control room: the status computer and the computers with the code words, one for each level that has mini quests (more if the list does not fit one screen)
  const control = roomsOf(CONTROL_ROOM);
  placeIn(control, (x, y) => ({ uid: uid("computer"), kind: "lore", x, y, params: { item: COMPUTER_ITEM, terminal: "status", pool: "dungeon", line: 0 } }));
  for (let level = 1; level <= 5; level++) {
    const lines = layout.codeWords.filter((c) => c.tier === level).map((c) => `${c.place}: ${c.words.map((word) => `'${word}'`).join(", ")}`);
    const pages = Math.ceil(lines.length / CODE_LINES_PER_PAGE);
    for (let page = 0; page < pages; page++) {
      const text = `${CODE_TITLE}\nLevel ${level}${pages > 1 ? ` (${page + 1}/${pages})` : ""}\n\n${lines.slice(page * CODE_LINES_PER_PAGE, (page + 1) * CODE_LINES_PER_PAGE).join("\n")}`;
      placeIn(control, (x, y) => ({ uid: uid("computer"), kind: "lore", x, y, params: { item: COMPUTER_ITEM, terminal: "codes", pool: "dungeon", line: 0, text } }));
    }
  }
  // a computer with a line of the world's secret in the other sections, for the look of it
  for (const s of [BRIDGE, LIFE_SUPPORT, STORAGE_BAY, ENGINE_ROOM]) {
    const rooms = roomsOf(s);
    if (rooms.length > 0) placeIn(rooms, (x, y) => ({ uid: uid("computer"), kind: "lore", x, y, params: { item: COMPUTER_ITEM, pool: "dungeon", line: 0, text: COMPUTER_LINES[rng.int(COMPUTER_LINES.length)]! } }));
  }
  return { mapKey: map.key, tier, actions, spawns };
}
