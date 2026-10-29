import type { Rng } from "../core/rng";
import { Builder, neighbours4, type BuildContext } from "./builder";
import { carveEndRoomFor } from "./endRoom";
import { CELL, type InteriorMap, type Room } from "./types";

// Halved in both directions on the user's request (fifteenth playtest: the caves were 80 x 80 and took too long to cross); the walkable area and the chamber count follow
const SIZE = 40;
const MIN_FLOOR = 275;
const CHAMBERS = 5;

function countSolid8(b: Builder, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (!b.isFloor(x + dx, y + dy)) n++;
    }
  }
  return n;
}

/** Cellular-automaton cave. Keeps the largest connected area; chambers are Voronoi cells of far-apart seed points. */
export function generateCave(rng: Rng, ctx: BuildContext): InteriorMap {
  let b = new Builder(SIZE, SIZE);
  let bestCount = -1;
  let best: Builder | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    b = new Builder(SIZE, SIZE);
    for (let y = 2; y < SIZE - 2; y++) for (let x = 2; x < SIZE - 2; x++) if (!rng.chance(455)) b.set(x, y, CELL.FLOOR);
    for (let pass = 0; pass < 5; pass++) {
      const next = new Uint8Array(b.cells);
      for (let y = 1; y < SIZE - 1; y++) {
        for (let x = 1; x < SIZE - 1; x++) {
          const solid = countSolid8(b, x, y);
          const floor = b.isFloor(x, y);
          next[b.idx(x, y)] = (floor ? solid < 5 : solid < 4) ? CELL.FLOOR : CELL.SOLID;
        }
      }
      b.cells.set(next);
    }
    const count = keepLargest(b);
    if (count > bestCount) {
      bestCount = count;
      best = b;
    }
    if (count >= MIN_FLOOR) break;
  }
  b = best!;

  const floors: number[] = [];
  for (let i = 0; i < b.cells.length; i++) if (b.cells[i] === CELL.FLOOR) floors.push(i);

  // Exit: bottom-most wall-backed floor cell near the horizontal middle, then chambers measured from the spawn.
  const { exit, spawn } = b.pickExit(SIZE / 2, SIZE - 4);
  const chambers = assignChambers(b, floors, spawn, rng);
  const rooms: Room[] = chambers;
  // the end room: quest 3 teleports the party into it, the others seal it (a cave without room for a sealed one gets a pocket that a teleport reaches)
  const quest = ctx.dungeon?.quest;
  const endRoom = ctx.dungeon ? carveEndRoomFor(b, rng, spawn, quest === "quest_3") : null;
  const dungeon = ctx.dungeon ? { ...ctx.dungeon, ...(endRoom ? { endRoom } : {}) } : undefined;
  return { ...b.finish("cave", { ...ctx, dungeon }, exit, spawn), rooms, roomOf: b.roomOf };
}

/** Keeps only the largest 4-connected floor component. Returns its size. */
function keepLargest(b: Builder): number {
  const label = new Int32Array(b.cells.length);
  let next = 0;
  let bestLabel = 0;
  let bestSize = 0;
  const stack: number[] = [];
  for (let start = 0; start < b.cells.length; start++) {
    if (b.cells[start] !== CELL.FLOOR || label[start]) continue;
    next++;
    let size = 0;
    stack.push(start);
    label[start] = next;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % b.width;
      const y = (i - x) / b.width;
      for (const [nx, ny] of neighbours4(x, y)) {
        if (!b.inside(nx, ny)) continue;
        const ni = b.idx(nx, ny);
        if (b.cells[ni] === CELL.FLOOR && !label[ni]) {
          label[ni] = next;
          stack.push(ni);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = next;
    }
  }
  for (let i = 0; i < b.cells.length; i++) if (b.cells[i] === CELL.FLOOR && label[i] !== bestLabel) b.cells[i] = CELL.SOLID;
  return bestSize;
}

function bfsDistance(b: Builder, sources: number[]): Int32Array {
  const dist = new Int32Array(b.cells.length).fill(-1);
  const queue: number[] = [];
  for (const s of sources) {
    dist[s] = 0;
    queue.push(s);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % b.width;
    const y = (i - x) / b.width;
    for (const [nx, ny] of neighbours4(x, y)) {
      if (!b.inside(nx, ny)) continue;
      const ni = b.idx(nx, ny);
      if (b.cells[ni] === CELL.FLOOR && dist[ni]! < 0) {
        dist[ni] = dist[i]! + 1;
        queue.push(ni);
      }
    }
  }
  return dist;
}

/** Farthest-point sampling picks chamber centres; a multi-source BFS assigns every cell to its nearest centre. */
function assignChambers(b: Builder, floors: number[], spawn: { x: number; y: number }, rng: Rng): Room[] {
  const centres: number[] = [b.idx(spawn.x, spawn.y)];
  while (centres.length < CHAMBERS) {
    const dist = bfsDistance(b, centres);
    let far = -1;
    let farDist = -1;
    // tie-break randomly but deterministically among the farthest cells
    const candidates: number[] = [];
    for (const i of floors) {
      if (dist[i]! > farDist) {
        farDist = dist[i]!;
        candidates.length = 0;
      }
      if (dist[i] === farDist) candidates.push(i);
    }
    far = candidates[rng.int(candidates.length)]!;
    if (farDist < 4) break;
    centres.push(far);
  }

  const owner = new Int16Array(b.cells.length).fill(-1);
  const dist = new Int32Array(b.cells.length).fill(-1);
  const queue: number[] = [];
  centres.forEach((c, id) => {
    owner[c] = id;
    dist[c] = 0;
    queue.push(c);
  });
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % b.width;
    const y = (i - x) / b.width;
    for (const [nx, ny] of neighbours4(x, y)) {
      if (!b.inside(nx, ny)) continue;
      const ni = b.idx(nx, ny);
      if (b.cells[ni] === CELL.FLOOR && dist[ni]! < 0) {
        dist[ni] = dist[i]! + 1;
        owner[ni] = owner[i]!;
        queue.push(ni);
      }
    }
  }
  b.roomOf.set(owner);

  return centres.map((c, id) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let size = 0;
    for (const i of floors) {
      if (owner[i] !== id) continue;
      const x = i % b.width;
      const y = (i - x) / b.width;
      size++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const cx = c % b.width;
    return { id, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, cx, cy: (c - cx) / b.width, size };
  });
}
