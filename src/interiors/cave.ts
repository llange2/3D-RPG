import type { Rng } from "../core/rng";
import { Builder, neighbours4, type BuildContext } from "./builder";
import { carveEndRoomFor } from "./endRoom";
import { CELL, type InteriorMap, type Room } from "./types";

// Halved in both directions on the user's request (fifteenth playtest: the caves were 80 x 80 and took too long to cross); the walkable area and the chamber count follow
const SIZE = 40;
const MIN_FLOOR = 275;
const CHAMBERS = 5;
/** No cave is smaller than this (the tests of the fifteenth playtest ask for more than 200). */
const MIN_CAVE_FLOOR = 230;

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

/**
 * The three layouts of the caves (quest document 1.2): a ring with bulges and small chambers in the middle (cave_1), the classic organic cave of
 * chambers and passages (cave_2) and a big cave of chambers that each have one way in (cave_3). A cave of a quest also needs rock for its end
 * room: one that has none is drawn again (the cave is a pure function of the stream, so the next try is as deterministic as the first).
 */
export function generateCave(rng: Rng, ctx: BuildContext): InteriorMap {
  let map = generateCaveOnce(rng, ctx);
  // a cave has at least 220 cells of floor (a ring that the smoothing made thin is drawn again), and the cave of a quest an end room
  const small = (m: InteriorMap) => m.cells.reduce((n, c) => n + (c === CELL.FLOOR ? 1 : 0), 0) < MIN_CAVE_FLOOR;
  for (let again = 0; again < 12 && (small(map) || (ctx.dungeon && !map.dungeon?.endRoom)); again++) map = generateCaveOnce(rng, ctx);
  return map;
}

function generateCaveOnce(rng: Rng, ctx: BuildContext): InteriorMap {
  const layout = ctx.dungeon?.layout;
  const b = layout === "cave_1" ? ring(rng) : layout === "cave_3" ? bigCave(rng) : classicCave(rng);
  addIslands(b, rng);
  const floors: number[] = [];
  for (let i = 0; i < b.cells.length; i++) if (b.cells[i] === CELL.FLOOR) floors.push(i);

  // Exit: bottom-most wall-backed floor cell near the horizontal middle, then chambers measured from the spawn.
  const { exit, spawn } = b.pickExit(SIZE / 2, SIZE - 4);
  const chambers = assignChambers(b, floors, spawn, rng);
  const rooms: Room[] = chambers;
  // the end room: quest 3 teleports the party into it, the others seal it (a cave without room for a sealed one gets a pocket that a teleport reaches)
  const quest = ctx.dungeon?.quest;
  const endRoom = ctx.dungeon ? carveEndRoomFor(b, rng, spawn, quest === "quest_3", undefined, ctx.dungeon.orbs) : null;
  const dungeon = ctx.dungeon ? { ...ctx.dungeon, ...(endRoom ? { endRoom } : {}) } : undefined;
  return { ...b.finish("cave", { ...ctx, dungeon }, exit, spawn), rooms, roomOf: b.roomOf };
}

/** The classic cave: a cellular automaton, the largest connected area of it. */
function classicCave(rng: Rng): Builder {
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
  return best!;
}

/**
 * Grows an organic blob of about `size` cells from a start cell: a random frontier growth over the cells that `allowed` lets through. Returns the
 * cells (indices) it made floor.
 */
function growBlob(b: Builder, rng: Rng, sx: number, sy: number, size: number, allowed: (x: number, y: number) => boolean): number[] {
  const cells: number[] = [];
  const frontier: [number, number][] = [[sx, sy]];
  const taken = new Set<number>();
  while (cells.length < size && frontier.length > 0) {
    const at = rng.int(frontier.length);
    const [x, y] = frontier.splice(at, 1)[0]!;
    const i = b.idx(x, y);
    if (taken.has(i) || !allowed(x, y)) continue;
    taken.add(i);
    cells.push(i);
    for (const [nx, ny] of neighbours4(x, y)) if (!taken.has(b.idx(nx, ny))) frontier.push([nx, ny]);
  }
  for (const i of cells) b.cells[i] = CELL.FLOOR;
  return cells;
}

/** Is the cell inside the border of three cells, and has no floor within `m` cells of it (solid ground to carve into)? */
function rockAround(b: Builder, x: number, y: number, m = 1): boolean {
  if (x < 3 || y < 3 || x >= SIZE - 3 || y >= SIZE - 3) return false;
  for (let dy = -m; dy <= m; dy++) for (let dx = -m; dx <= m; dx++) if (b.isFloor(x + dx, y + dy)) return false;
  return true;
}

/** cave_1: a ring two to three cells wide, two to five bulges of 20 to 25 cells outwards and small organic chambers inside, each reached by a short opening. */
function ring(rng: Rng): Builder {
  const b = new Builder(SIZE, SIZE);
  const outer = 15 + rng.int(2);
  const width = rng.range(2, 3);
  const cx = SIZE >> 1;
  const cy = SIZE >> 1;
  const distance = (x: number, y: number): number => {
    const dx = Math.abs(x - cx);
    const dy = Math.abs(y - cy);
    // a rounded square: the chebyshev distance with the corners taken off by the manhattan distance, so the ring is round without trigonometry
    return Math.max(dx, dy) + ((dx + dy) >> 2);
  };
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (distance(x, y) <= outer && distance(x, y) > outer - width - 1) b.set(x, y, CELL.FLOOR);
  // the edge of the ring is not a ruler's line: a few cells of rock and floor swap places, then it is smoothed
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(b.cells);
    for (let y = 2; y < SIZE - 2; y++) {
      for (let x = 2; x < SIZE - 2; x++) {
        const d = distance(x, y);
        if (d < outer - width - 1 || d > outer + 1) continue;
        if (pass === 0 && rng.chance(120)) next[b.idx(x, y)] = b.isFloor(x, y) ? CELL.SOLID : CELL.FLOOR;
        else if (pass === 1) next[b.idx(x, y)] = countSolid8(b, x, y) < 5 ? CELL.FLOOR : CELL.SOLID;
      }
    }
    b.cells.set(next);
  }
  keepLargest(b);
  // bulges outwards: a blob grows from a cell of the outer edge into the rock
  const edge: [number, number][] = [];
  for (let y = 3; y < SIZE - 3; y++) for (let x = 3; x < SIZE - 3; x++) if (b.isFloor(x, y) && distance(x, y) >= outer - 1) edge.push([x, y]);
  const wanted = rng.range(2, 5);
  let bulges = 0;
  for (const [x, y] of rng.shuffle(edge)) {
    if (bulges >= wanted) break;
    const before = b.cells.slice();
    const cells = growBlob(b, rng, x, y, rng.range(20, 25), (px, py) => (px === x && py === y) || (!b.isFloor(px, py) && distance(px, py) > outer - 1 && rockAround(b, px, py, 1)));
    if (cells.length < 14) b.cells.set(before);
    else bulges++;
  }
  // chambers inside, each with a short opening into the ring
  let inner = 0;
  for (let tries = 0; tries < 80 && inner < 3; tries++) {
    const x = cx + rng.range(-5, 5);
    const y = cy + rng.range(-5, 5);
    if (distance(x, y) > outer - width - 4 || !rockAround(b, x, y, 2)) continue;
    const before = b.cells.slice();
    const cells = growBlob(b, rng, x, y, rng.range(12, 18), (px, py) => distance(px, py) <= outer - width - 3 && !b.isFloor(px, py) && rockAround(b, px, py, 1));
    if (cells.length < 8) {
      b.cells.set(before);
      continue;
    }
    // the opening: from the cell of the chamber farthest from the middle, straight outwards through rock to the ring
    const far = cells.map((i) => [i % SIZE, Math.floor(i / SIZE)] as const).sort(([ax, ay], [bx, by]) => distance(bx, by) - distance(ax, ay))[0]!;
    const dir = Math.abs(far[0] - cx) > Math.abs(far[1] - cy) ? ([Math.sign(far[0] - cx), 0] as const) : ([0, Math.sign(far[1] - cy)] as const);
    let px: number = far[0];
    let py: number = far[1];
    let reached = false;
    for (let k = 0; k < 8 && !reached; k++) {
      px += dir[0];
      py += dir[1];
      if (b.isFloor(px, py) && !cells.includes(b.idx(px, py))) reached = true;
      else b.carveCorridorCell(px, py);
    }
    if (!reached) {
      b.cells.set(before);
      continue;
    }
    inner++;
  }
  keepLargest(b);
  return b;
}

/** cave_3: a big cave of chambers that each have one way in (a tree of passages), with single rocks standing in the chambers. */
function bigCave(rng: Rng): Builder {
  const b = new Builder(SIZE, SIZE);
  const grid = [8, 20, 32];
  const centres: { x: number; y: number }[] = [];
  for (const gy of grid) for (const gx of grid) centres.push({ x: gx + rng.range(-3, 3), y: gy + rng.range(-3, 3) });
  const chosen = rng.shuffle(centres).slice(0, rng.range(6, 8));
  // the first chamber is at the bottom: the way in
  chosen.sort((p, q) => q.y - p.y || p.x - q.x);
  const blobs: number[][] = [];
  for (const c of chosen) blobs.push(growBlob(b, rng, c.x, c.y, rng.range(55, 90), (x, y) => x >= 3 && y >= 3 && x < SIZE - 3 && y < SIZE - 3 && !b.isFloor(x, y)));
  // a tree of passages: every chamber joins the nearest one that is already joined, with a passage one cell wide
  const joined = [0];
  for (let i = 1; i < chosen.length; i++) {
    let best = 0;
    for (const j of joined) if (Math.abs(chosen[j]!.x - chosen[i]!.x) + Math.abs(chosen[j]!.y - chosen[i]!.y) < Math.abs(chosen[best]!.x - chosen[i]!.x) + Math.abs(chosen[best]!.y - chosen[i]!.y)) best = j;
    b.carveL(chosen[best]!.x, chosen[best]!.y, chosen[i]!.x, chosen[i]!.y, rng.chance(500));
    joined.push(i);
  }
  keepLargest(b);
  // single rocks inside the chambers: a cell with floor on all sides, and no other rock within two cells
  const rocks: number[] = [];
  for (const cells of blobs) {
    for (const i of rng.shuffle([...cells])) {
      const x = i % SIZE;
      const y = Math.floor(i / SIZE);
      if (!b.isFloor(x, y) || countSolid8(b, x, y) > 0) continue;
      if (rocks.some((r) => Math.abs((r % SIZE) - x) < 3 && Math.abs(Math.floor(r / SIZE) - y) < 3)) continue;
      if (rng.chance(80)) {
        b.set(x, y, CELL.SOLID);
        rocks.push(i);
      }
    }
  }
  return b;
}

/** Is every cell within `r` cells (a square) of the given one floor? */
function openSquare(b: Builder, x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!b.isFloor(x + dx, y + dy)) return false;
  return true;
}

/** How far from the middle of a hall an island may reach, and how much open floor the hall needs round the middle (so that a way of two cells is left on every side). */
const ISLAND_REACH = 1;
const ISLAND_ROOM = 3;
/** One island for every this many cells where an island could stand, and the most a cave gets; two islands are never closer than `ISLAND_GAP` cells (chebyshev). */
const ISLAND_PER_SPOTS = 15;
const ISLAND_MAX = 9;
const ISLAND_GAP = 8;

/**
 * Islands of rock in the big halls (31st playtest, point 10): where the floor is open for three cells on every side, a few cells of rock (two to five,
 * one blob) stand in the hall with a way of two cells round them. The halls of the caves are 20 cells and more across, and there the party saw nothing
 * but a bare floor. A hall that is not wide enough gets none.
 */
function addIslands(b: Builder, rng: Rng): void {
  const spots: [number, number][] = [];
  for (let y = 3; y < SIZE - 3; y++) for (let x = 3; x < SIZE - 3; x++) if (openSquare(b, x, y, ISLAND_ROOM)) spots.push([x, y]);
  const wanted = Math.min(ISLAND_MAX, Math.floor(spots.length / ISLAND_PER_SPOTS));
  const placed: [number, number][] = [];
  for (const [x, y] of rng.shuffle(spots)) {
    if (placed.length >= wanted) break;
    // an earlier island may have taken the room, and two islands are not twins side by side
    if (!openSquare(b, x, y, ISLAND_ROOM) || placed.some(([px, py]) => Math.max(Math.abs(px - x), Math.abs(py - y)) < ISLAND_GAP)) continue;
    const rock: [number, number][] = [[x, y]];
    const size = rng.range(2, 5);
    while (rock.length < size) {
      const next = rock
        .flatMap(([rx, ry]) => neighbours4(rx, ry))
        .filter(([nx, ny]) => Math.abs(nx - x) <= ISLAND_REACH && Math.abs(ny - y) <= ISLAND_REACH && !rock.some(([ox, oy]) => ox === nx && oy === ny));
      if (next.length === 0) break;
      rock.push(next[rng.int(next.length)]!);
    }
    for (const [rx, ry] of rock) b.set(rx, ry, CELL.SOLID);
    placed.push([x, y]);
  }
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
