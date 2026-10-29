import { CELL, FACING_DELTA, isFloor, type Facing, type InteriorMap } from "./types";

export interface Mouth {
  /** Corridor cell next to a room. */
  x: number;
  y: number;
  roomId: number;
  /** Direction from the corridor cell into the room. */
  facing: Facing;
  /** True when the passage is exactly one cell wide (door-capable). */
  straight: boolean;
}

export interface Topology {
  /** BFS distance from the spawn cell, -1 for unreachable floor. */
  depth: Int16Array;
  maxDepth: number;
  reachableFloor: number;
  totalFloor: number;
  deadEnds: { x: number; y: number; depth: number }[];
  mouths: Mouth[];
  /** Straight corridor cells (floor, no room, exactly two opposite floor neighbours). */
  straightCorridors: { x: number; y: number; depth: number }[];
  /** Index of the room farthest from the spawn, preferring bigger rooms. */
  bossRoom: number;
}

const DIRS: Facing[] = ["N", "E", "S", "W"];

function floorNeighbours(map: InteriorMap, x: number, y: number): Facing[] {
  return DIRS.filter((d) => isFloor(map, x + FACING_DELTA[d].dx, y + FACING_DELTA[d].dy));
}

function isStraight(n: Facing[]): boolean {
  return n.length === 2 && ((n.includes("N") && n.includes("S")) || (n.includes("E") && n.includes("W")));
}

export function analyzeTopology(map: InteriorMap): Topology {
  const { width: w, height: h, cells } = map;
  const depth = new Int16Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  // the chamber of a castle vault behind a wall that gives way is part of the level: the wall counts as a way through
  const hidden = new Set<number>((map.sites ?? []).filter((s) => s.kind === "vault_way" && s.how === "wall").map((s) => s.y * w + s.x));
  // so is the end room of a quest: behind its seal, or (a pocket in the rock that a teleport reaches) a second place the search starts from
  const end = map.dungeon?.endRoom;
  if (end?.seal) hidden.add(end.seal.y * w + end.seal.x);
  const start = map.spawn.y * w + map.spawn.x;
  depth[start] = 0;
  queue[tail++] = start;
  if (end?.isolated) {
    const pocket = end.cy * w + end.cx;
    depth[pocket] = 0;
    queue[tail++] = pocket;
  }
  let maxDepth = 0;
  let reachable = 0;
  while (head < tail) {
    const i = queue[head++]!;
    if (cells[i] === CELL.FLOOR) reachable++;
    const x = i % w;
    const y = (i - x) / w;
    const d = depth[i]!;
    if (d > maxDepth) maxDepth = d;
    for (const dir of DIRS) {
      const nx = x + FACING_DELTA[dir].dx;
      const ny = y + FACING_DELTA[dir].dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if ((cells[ni] === CELL.FLOOR || hidden.has(ni)) && depth[ni]! < 0) {
        depth[ni] = d + 1;
        queue[tail++] = ni;
      }
    }
  }

  let totalFloor = 0;
  const deadEnds: Topology["deadEnds"] = [];
  const straightCorridors: Topology["straightCorridors"] = [];
  const mouths: Mouth[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cells[i] !== CELL.FLOOR) continue;
      totalFloor++;
      const n = floorNeighbours(map, x, y);
      const isSpecial = (x === map.spawn.x && y === map.spawn.y) || (x === map.exit.x && y === map.exit.y);
      if (n.length === 1 && !isSpecial && depth[i]! >= 0) deadEnds.push({ x, y, depth: depth[i]! });
      if (map.roomOf[i] === -1) {
        if (isStraight(n) && depth[i]! >= 0) straightCorridors.push({ x, y, depth: depth[i]! });
        for (const dir of n) {
          const rid = map.roomOf[(y + FACING_DELTA[dir].dy) * w + (x + FACING_DELTA[dir].dx)]!;
          if (rid >= 0) mouths.push({ x, y, roomId: rid, facing: dir, straight: isStraight(n) });
        }
      }
    }
  }

  let bossRoom = 0;
  let best = -1;
  const endRoom = map.dungeon?.endRoom;
  const hall = map.dungeon?.hall;
  map.rooms.forEach((room, idx) => {
    // the hall belongs to the quest (the field of statues, the row of heads), which needs its middle; the end room is out of reach until the quest is solved; the boss lives elsewhere
    if ((hall && room.x === hall.x && room.y === hall.y) || (endRoom && room.x === endRoom.x && room.y === endRoom.y)) return;
    const d = depth[room.cy * w + room.cx]!;
    const score = d * 100 + Math.min(room.size, 99);
    if (d >= 0 && score > best) {
      best = score;
      bossRoom = idx;
    }
  });

  return { depth, maxDepth, reachableFloor: reachable, totalFloor, deadEnds, mouths, straightCorridors, bossRoom };
}

/** Builds roomOf and the room list from rectangles; used by the generators. */
export function makeRoom(id: number, x: number, y: number, w: number, h: number): { id: number; x: number; y: number; w: number; h: number; cx: number; cy: number; size: number } {
  return { id, x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2), size: w * h };
}
