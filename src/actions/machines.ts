import { Rng, derive, type SeedState } from "../core/rng";
import { allowedIn } from "../data/item-rules";
import { placeOf } from "../interiors/place";
import type { InteriorMap } from "../interiors/types";
import type { QuestEnv } from "./questGen";
import type { ActionInstance, ParamValue } from "./types";

/**
 * The machines of the Quatloo coins (ue_quest_1) and the quest items hidden in the ordinary chests (ue_quest_1 and ue_quest_2). Seth Squirm stands in a
 * room behind a door in one dungeon of level 2; in the room seven statues, one for every attribute, take a coin for three points. The statues are all
 * of one kind in a world: the same item (29, 33 or 34) wherever the world is played.
 */

const MACHINES = [
  { attr: "str", name: "Deu'us", title: "the master of power", word: "strength" },
  { attr: "int", name: "Ananke", title: "the keeper of knowledge", word: "intellect" },
  { attr: "per", name: "Mirelle", title: "the voice of charm", word: "personality" },
  { attr: "end", name: "Brokk", title: "the unbreakable", word: "endurance" },
  { attr: "spd", name: "Zephyra", title: "the mistress of swiftness", word: "speed" },
  { attr: "acc", name: "Orrin", title: "the unerring eye", word: "accuracy" },
  { attr: "lck", name: "Fortuna", title: "the hand of fate", word: "luck" },
] as const;

/** The persona of Seth Squirm and the lines he speaks. */
export const SETH = 90;
const SETH_TEXT = "Seth Squirm grins at you. \"Psst! The statues in this room are machines. Put a Quatloo coin in the slot of one and it makes you stronger, in whatever it is the master of: one coin buys three points. The coins lie hidden in the chests of the dungeons, caves and castles of the first three levels. Read what each statue says.\"";

/** The statue that stands for the machines in a world: one of three, by the seed of the world. */
export const machineItem = (rootSeed: SeedState): number => [29, 33, 34][new Rng(derive(rootSeed, "machine-statue")).int(3)]!;

/** Seth, the door and the seven statues of the machine room. */
export function placeMachines(env: QuestEnv): void {
  const ref = env.map.dungeon;
  const room = ref?.machines;
  if (!ref || !room) return;
  const place = placeOf(env.map);
  const wanted = machineItem(env.rootSeed);
  const item = allowedIn(wanted, place) ? wanted : 29;
  const wallAt = (x: number, y: number) => env.map.cells[y * env.map.width + x] !== 1;
  env.placeEnd({ uid: env.uid("machines-door"), kind: "door", x: room.door.x, y: room.door.y, params: { locked: false, axis: wallAt(room.door.x, room.door.y - 1) && wallAt(room.door.x, room.door.y + 1) ? "x" : "y" } });
  // Seth beside the way in, on the inside, the statues along the walls
  const inside = { x: Math.min(room.x + room.w - 1, Math.max(room.x, room.door.x)), y: Math.min(room.y + room.h - 1, Math.max(room.y, room.door.y)) };
  const border: { x: number; y: number }[] = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const edge = x === room.x || y === room.y || x === room.x + room.w - 1 || y === room.y + room.h - 1;
      if (edge && !(x === inside.x && y === inside.y) && Math.abs(x - inside.x) + Math.abs(y - inside.y) > 0) border.push({ x, y });
    }
  }
  const taken = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;
  const keeps = (c: { x: number; y: number }): boolean => {
    const blocked = new Set([...taken, key(c.x, c.y)]);
    const inRoom = (x: number, y: number) => x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h;
    const seen = new Set<string>([key(inside.x, inside.y)]);
    const queue = [inside];
    for (let head = 0; head < queue.length; head++) {
      const q = queue[head]!;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
        const n = { x: q.x + dx, y: q.y + dy };
        if (!inRoom(n.x, n.y) || blocked.has(key(n.x, n.y)) || seen.has(key(n.x, n.y))) continue;
        seen.add(key(n.x, n.y));
        queue.push(n);
      }
    }
    if (seen.size !== room.w * room.h - blocked.size) return false;
    return [...blocked].every((b) => {
      const [bx, by] = b.split(",").map(Number) as [number, number];
      return ([[0, 1], [1, 0], [0, -1], [-1, 0]] as const).some(([dx, dy]) => seen.has(key(bx + dx, by + dy)));
    });
  };
  const rng = new Rng(env.derive("machines"));
  const spots = rng.shuffle(border);
  const put = (make: (x: number, y: number) => ActionInstance): void => {
    const at = spots.findIndex(keeps);
    if (at < 0) return;
    const c = spots.splice(at, 1)[0]!;
    taken.add(key(c.x, c.y));
    env.placeEnd(make(c.x, c.y));
  };
  put((x, y) => ({ uid: env.uid("seth"), kind: "lore", x, y, params: { pool: "dungeon", line: 0, persona: SETH, text: SETH_TEXT } }));
  for (const m of MACHINES) {
    put((x, y) => ({ uid: env.uid("machine"), kind: "machine", x, y, params: { item, attr: m.attr, text: `The plaque at the statue reads: 'I am ${m.name}, ${m.title}. For a coin I will improve your ${m.word}.'` } }));
  }
}

/**
 * Hides the Quatloo coins and silver skulls of a place in its ordinary chests: the ones that are no part of a quest (a chest with a quest item, a lock or an
 * alarm of the castle's king stays as it is). One item to a chest, as many chests as there are items; a place with fewer chests than items keeps the rest
 * in the chests that are there (a chest takes several).
 */
export function hideInChests(map: InteriorMap, actions: ActionInstance[], coins: number, skulls: number, seed: SeedState, onlyAlarm = false): void {
  const items: string[] = [...Array.from({ length: coins }, () => "quest_quatloo_coin"), ...Array.from({ length: skulls }, () => "quest_silver_skull")];
  if (items.length === 0) return;
  const end = map.dungeon?.endRoom;
  const machines = map.dungeon?.machines;
  const inRoom = (a: ActionInstance, r?: { x: number; y: number; w: number; h: number }) => !!r && a.x >= r.x && a.y >= r.y && a.x < r.x + r.w && a.y < r.y + r.h;
  // (nor in a treasure chamber behind a brittle wall: a coin or a skull that only a party with the Perceptive talent can reach would be lost to the others)
  const vaults = map.dungeon?.vaults ?? [];
  const chests = actions.filter((a) => a.kind === "treasure" && typeof a.params.quest !== "string" && a.params.lock === undefined && !inRoom(a, end) && !inRoom(a, machines) && !vaults.some((v) => inRoom(a, v)) && (!onlyAlarm || a.params.warn === "alarm"));
  if (chests.length === 0) return;
  const rng = new Rng(derive(seed, "hide-in-chests"));
  const order = rng.shuffle(chests);
  items.forEach((type, i) => {
    const chest = order[i % order.length]!;
    const have = typeof chest.params.extra === "string" && chest.params.extra !== "" ? `${String(chest.params.extra)},` : "";
    (chest.params as Record<string, ParamValue>).extra = `${have}${type}`;
  });
}
