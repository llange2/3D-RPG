import type { Rng } from "../core/rng";
import { towerTheme } from "../data/interior-themes";
import { Builder, type BuildContext, type Rect } from "./builder";
import { finishDungeon } from "./dungeon";
import { FACING_DELTA, type Facing, type InteriorMap, type TowerLayout } from "./types";

/**
 * dungeon_5, the tower (quest document 1.7, "dungeon_6 (Tower)" there). A round plan divided into rooms, 2 or 3 floors that are joined by stairs: a small tower (15 cells across, the
 * levels 1 and 2) or a big one (23, the others and every tower of quest 2, which needs its hall). The floors are laid side by side on ONE map with rock between them: climbing a
 * staircase is a jump to the other floor without a loading screen (`stairs` actions, no sound), and the floors are at least `FLOOR_GAP` cells apart, so that no teleport spell
 * hops from one to the next. The staircase of a floor and the Fort door that leads down again on the floor above it are at the same place of the round plan.
 */

export const TOWER_SMALL = 15;
export const TOWER_BIG = 23;
/** Cells of rock between two floors: more than the ten the document asks for. */
export const FLOOR_GAP = 12;
const MARGIN = 4;

/** Is `(x, y)` (relative to the floor's bounding square) on the round floor? */
export function inDisk(size: number, x: number, y: number): boolean {
  const c = (size - 1) / 2;
  const r = size / 2 - 0.3;
  return (x - c) ** 2 + (y - c) ** 2 <= r * r;
}

interface Line {
  vertical: boolean;
  /** The column (vertical) or row (horizontal) of the wall. */
  at: number;
  from: number;
  to: number;
}

const overlap = (a0: number, a1: number, b0: number, b1: number): boolean => a0 <= b1 && b0 <= a1;

/** The cells of a floor that no wall may cross: the way in, the stairs and the cells in front of them. */
function zoneCrossed(zones: readonly Rect[], l: Line): boolean {
  return zones.some((z) => (l.vertical ? l.at >= z.x - 1 && l.at <= z.x + z.w && overlap(l.from, l.to, z.y - 1, z.y + z.h) : l.at >= z.y - 1 && l.at <= z.y + z.h && overlap(l.from, l.to, z.x - 1, z.x + z.w)));
}

/**
 * Cuts the square of one floor into rooms with straight walls one cell thick (a binary partition, the cells outside the disk are rock anyway). Returns the wall lines and the
 * leaves (the rectangles between them). The hall of quest 2 is cut out first and not cut again.
 */
function partition(rng: Rng, size: number, zones: readonly Rect[], rooms: number, hall: Rect | null): { lines: Line[]; leaves: Rect[] } {
  let leaves: Rect[] = [{ x: 0, y: 0, w: size, h: size }];
  const lines: Line[] = [];
  const disk = (r: Rect): number => {
    let n = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (inDisk(size, x, y)) n++;
    return n;
  };
  const cut = (index: number, vertical: boolean, at: number): void => {
    const r = leaves[index]!;
    const a: Rect = vertical ? { x: r.x, y: r.y, w: at - r.x, h: r.h } : { x: r.x, y: r.y, w: r.w, h: at - r.y };
    const b: Rect = vertical ? { x: at + 1, y: r.y, w: r.x + r.w - at - 1, h: r.h } : { x: r.x, y: at + 1, w: r.w, h: r.y + r.h - at - 1 };
    lines.push(vertical ? { vertical, at, from: r.y, to: r.y + r.h - 1 } : { vertical, at, from: r.x, to: r.x + r.w - 1 });
    leaves.splice(index, 1, a, b);
  };
  // the hall of quest 2: two walls on both sides of the middle strip, then two across it
  const frozen = new Set<Rect>();
  if (hall) {
    const c = (size - 1) / 2;
    cut(0, true, c - 6);
    cut(1, true, c + 6);
    // leaves: [left, middle, right]
    cut(1, false, hall.y - 1);
    // leaves: [left, top, rest, right]; the rest is [x, hall.y .. size)
    cut(2, false, hall.y + hall.h);
    // leaves: [left, top, hall, bottom, right]
    frozen.add(leaves[2]!);
  }
  for (let attempt = 0; leaves.length < rooms && attempt < 60; attempt++) {
    // the leaf with the most floor in it that may still be cut
    const order = leaves.map((r, i) => ({ r, i, n: disk(r) })).filter((e) => !frozen.has(e.r) && e.n >= 24).sort((p, q) => q.n - p.n);
    if (order.length === 0) break;
    const { r, i } = order[Math.min(order.length - 1, rng.int(2))]!;
    const orientations = r.w >= r.h ? [true, false] : [false, true];
    let done = false;
    for (const vertical of orientations) {
      const lo = (vertical ? r.x : r.y) + 3;
      const hi = (vertical ? r.x + r.w : r.y + r.h) - 4;
      if (hi < lo) continue;
      for (let tries = 0; tries < 30 && !done; tries++) {
        const at = rng.range(lo, hi);
        const line: Line = vertical ? { vertical, at, from: r.y, to: r.y + r.h - 1 } : { vertical, at, from: r.x, to: r.x + r.w - 1 };
        if (zoneCrossed(zones, line)) continue;
        const a: Rect = vertical ? { x: r.x, y: r.y, w: at - r.x, h: r.h } : { x: r.x, y: r.y, w: r.w, h: at - r.y };
        const b: Rect = vertical ? { x: at + 1, y: r.y, w: r.x + r.w - at - 1, h: r.h } : { x: r.x, y: at + 1, w: r.w, h: r.y + r.h - at - 1 };
        // no sliver of a room at the rim
        if (disk(a) < 9 || disk(b) < 9) continue;
        cut(i, vertical, at);
        done = true;
      }
      if (done) break;
    }
    if (!done) frozen.add(r);
  }
  return { lines, leaves };
}

/** Where a staircase or a Fort door stands: the cell against the wall, the cell in front of it and the way into the room. */
interface Spot {
  p: { x: number; y: number };
  f: { x: number; y: number };
  facing: Facing;
}

/** The spot of a transition at the rim of the disk on one side, `offset` cells along the rim from the middle, or null if the rim there is too narrow for it. */
function rimSpot(size: number, side: Facing, offset: number): Spot | null {
  const c = (size - 1) / 2;
  const alongRow = side === "N" || side === "S";
  const m = Math.round(c) + offset;
  // the outermost cell of the disk in that column (row)
  let edge = -1;
  for (let k = 0; k < size; k++) {
    const k2 = side === "N" || side === "W" ? k : size - 1 - k;
    if (alongRow ? inDisk(size, m, k2) : inDisk(size, k2, m)) {
      edge = k2;
      break;
    }
  }
  if (edge < 0) return null;
  const inward = FACING_DELTA[side === "N" ? "S" : side === "S" ? "N" : side === "W" ? "E" : "W"];
  const p = alongRow ? { x: m, y: edge } : { x: edge, y: m };
  const f = { x: p.x + inward.dx, y: p.y + inward.dy };
  // the arrival must have room: the cell in front, its two sides and the cell beyond are all floor
  const side1 = { x: f.x + inward.dy, y: f.y + inward.dx };
  const side2 = { x: f.x - inward.dy, y: f.y - inward.dx };
  const beyond = { x: f.x + inward.dx, y: f.y + inward.dy };
  if (![f, side1, side2, beyond].every((q) => inDisk(size, q.x, q.y))) return null;
  return { p, f, facing: side === "N" ? "S" : side === "S" ? "N" : side === "W" ? "E" : "W" };
}

/** The cells no wall may cross round a spot: two cells either side, from the wall to three cells inward of the cell in front. */
function spotZone(s: Spot): Rect {
  const dx = s.f.x - s.p.x;
  const dy = s.f.y - s.p.y;
  // along the direction in (dx, dy) 5 cells deep (the spot, the cell in front and three beyond), across it 5 wide
  const x0 = Math.min(s.p.x, s.p.x + 3 * dx) - (dx === 0 ? 1 : 0);
  const x1 = Math.max(s.p.x, s.p.x + 3 * dx) + (dx === 0 ? 1 : 0);
  const y0 = Math.min(s.p.y, s.p.y + 3 * dy) - (dy === 0 ? 1 : 0);
  const y1 = Math.max(s.p.y, s.p.y + 3 * dy) + (dy === 0 ? 1 : 0);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Does a rectangle of floor lie wholly in the disk? */
function holds(size: number, r: Rect): boolean {
  return [[r.x, r.y], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]].every(([x, y]) => inDisk(size, x!, y!));
}

interface FloorPlan {
  /** Floor cells (true) of the floor, relative to its square, doorways included. */
  floor: boolean[];
  /** Doorway cells: floor between two rooms (they belong to no room). */
  doors: Set<number>;
  /** The rooms as runs of cells: every room's first rectangle is a run through its middle. */
  rooms: Rect[][];
  hall: boolean;
}

/** Builds the floor from its walls: the cells of the disk that no wall holds, doors cut into the walls, and the rooms (the pieces the walls leave). */
function buildFloor(rng: Rng, size: number, lines: readonly Line[], hallRect: Rect | null, entranceCol: number): FloorPlan {
  const at = (x: number, y: number) => y * size + x;
  const floor = new Array<boolean>(size * size).fill(false);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (inDisk(size, x, y)) floor[at(x, y)] = true;
  const wall = new Set<number>();
  for (const l of lines) {
    for (let k = l.from; k <= l.to; k++) {
      const [x, y] = l.vertical ? [l.at, k] : [k, l.at];
      if (x >= 0 && y >= 0 && x < size && y < size && floor[at(x, y)]) {
        floor[at(x, y)] = false;
        wall.add(at(x, y));
      }
    }
  }
  const doors = new Set<number>();
  const isFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && floor[at(x, y)];
  // one to three doors in every wall, where there is floor on both sides (and not where a door would sit in a corner of another wall)
  for (const l of lines) {
    const cells: number[] = [];
    for (let k = l.from; k <= l.to; k++) {
      const [x, y] = l.vertical ? [l.at, k] : [k, l.at];
      if (!wall.has(at(x, y))) continue;
      const [ax, ay, bx, by] = l.vertical ? [x - 1, y, x + 1, y] : [x, y - 1, x, y + 1];
      if (isFloor(ax, ay) && isFloor(bx, by)) cells.push(at(x, y));
    }
    if (cells.length === 0) continue;
    const wanted = Math.min(cells.length >= 9 ? rng.range(1, 3) : rng.range(1, 2), cells.length);
    const pool = rng.shuffle([...cells]);
    const chosen: number[] = [];
    for (const c of pool) {
      if (chosen.length >= wanted) break;
      if (chosen.some((o) => Math.abs((o % size) - (c % size)) + Math.abs(Math.floor(o / size) - Math.floor(c / size)) < 3)) continue;
      chosen.push(c);
    }
    for (const c of chosen) {
      floor[c] = true;
      wall.delete(c);
      doors.add(c);
    }
  }
  // every part of the floor must be reachable: where two parts meet across a wall, a door joins them
  for (let guard = 0; guard < 40; guard++) {
    const comp = new Int16Array(size * size).fill(-1);
    let n = 0;
    for (let s = 0; s < size * size; s++) {
      if (!floor[s] || comp[s]! >= 0) continue;
      const stack = [s];
      comp[s] = n;
      while (stack.length > 0) {
        const i = stack.pop()!;
        const x = i % size;
        const y = (i - x) / size;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
          if (!isFloor(nx, ny) || comp[at(nx, ny)]! >= 0) continue;
          comp[at(nx, ny)] = n;
          stack.push(at(nx, ny));
        }
      }
      n++;
    }
    if (n <= 1) break;
    let joined = false;
    for (const w of wall) {
      const x = w % size;
      const y = (w - x) / size;
      const pairs = [[[x - 1, y], [x + 1, y]], [[x, y - 1], [x, y + 1]]] as const;
      for (const [a, b] of pairs) {
        if (isFloor(a[0], a[1]) && isFloor(b[0], b[1]) && comp[at(a[0], a[1])] !== comp[at(b[0], b[1])]) {
          floor[w] = true;
          wall.delete(w);
          doors.add(w);
          joined = true;
          break;
        }
      }
      if (joined) break;
    }
    if (!joined) break;
  }
  // the rooms: the pieces of floor the doors leave (a doorway belongs to none)
  const room = new Int16Array(size * size).fill(-1);
  const pieces: number[][] = [];
  for (let s = 0; s < size * size; s++) {
    if (!floor[s] || doors.has(s) || room[s]! >= 0) continue;
    const id = pieces.length;
    const cells = [s];
    room[s] = id;
    for (let head = 0; head < cells.length; head++) {
      const i = cells[head]!;
      const x = i % size;
      const y = (i - x) / size;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (!isFloor(nx, ny) || doors.has(at(nx, ny)) || room[at(nx, ny)]! >= 0) continue;
        room[at(nx, ny)] = id;
        cells.push(at(nx, ny));
      }
    }
    pieces.push(cells);
  }
  const rooms: Rect[][] = pieces.map((cells, id) => {
    // runs of cells along the rows; the first is the one through the middle of the room (its cell is where the room's centre is)
    const runs: Rect[] = [];
    const rows = new Map<number, number[]>();
    for (const i of cells) {
      const y = Math.floor(i / size);
      const row = rows.get(y);
      if (row) row.push(i % size);
      else rows.set(y, [i % size]);
    }
    for (const [y, xs] of [...rows].sort((p, q) => p[0] - q[0])) {
      xs.sort((p, q) => p - q);
      let start = xs[0]!;
      for (let k = 1; k <= xs.length; k++) {
        if (k < xs.length && xs[k] === xs[k - 1]! + 1) continue;
        runs.push({ x: start, y, w: xs[k - 1]! - start + 1, h: 1 });
        start = xs[k] ?? 0;
      }
    }
    // (the room of the hall is the rectangle itself)
    if (hallRect && cells.length === hallRect.w * hallRect.h && cells.every((i) => i % size >= hallRect.x && i % size < hallRect.x + hallRect.w && Math.floor(i / size) >= hallRect.y && Math.floor(i / size) < hallRect.y + hallRect.h)) return [{ ...hallRect }];
    const midY = runs.reduce((s, r) => s + r.y, 0) / runs.length;
    const middle = runs.reduce((best, r) => (Math.abs(r.y - midY) < Math.abs(best.y - midY) || (Math.abs(r.y - midY) === Math.abs(best.y - midY) && r.w > best.w) ? r : best), runs[0]!);
    void id;
    return [middle, ...runs.filter((r) => r !== middle)];
  });
  // the room at the foot of the floor (the way in) is the first one
  const foot = pieces.findIndex((cells) => cells.some((i) => i % size === entranceCol && floor[i] && !isFloor(entranceCol, Math.floor(i / size) + 1)));
  if (foot > 0) [rooms[0], rooms[foot]] = [rooms[foot]!, rooms[0]!];
  return { floor, doors, rooms, hall: !!hallRect };
}

/** The tower of a place: its floors, stairs, rooms and the way in, made ready for the common end of the dungeon layouts (`finishDungeon`). */
export function generateTower(rng: Rng, ctx: BuildContext): InteriorMap {
  const quest = ctx.dungeon?.quest;
  // quest 2 needs its hall (11 x 7): always the big tower
  const size = ctx.tier >= 3 || quest === "quest_2" ? TOWER_BIG : TOWER_SMALL;
  const floorsN = rng.range(2, 3);
  const width = MARGIN * 2 + floorsN * size + (floorsN - 1) * FLOOR_GAP;
  const height = MARGIN * 2 + size;
  const b = new Builder(width, height);
  const origin = (k: number) => ({ x: MARGIN + k * (size + FLOOR_GAP), y: MARGIN });
  const c = (size - 1) / 2;

  // the stairs: one transition between every two floors, on a side of its own (the way in is at the foot of the ground floor)
  const sides = rng.shuffle<Facing>(["N", "E", "W"]);
  const spots: Spot[] = [];
  for (let t = 0; t < floorsN - 1; t++) {
    let spot: Spot | null = null;
    for (let tries = 0; tries < 30 && !spot; tries++) {
      const side = sides[t % sides.length]!;
      const reach = Math.floor(size / 5);
      const candidate = rimSpot(size, side, rng.range(-reach, reach));
      if (candidate) spot = candidate;
    }
    if (!spot) spot = rimSpot(size, sides[t % sides.length]!, 0) ?? rimSpot(size, "N", 0)!;
    spots.push(spot);
  }

  // the hall of quest 2 is on the top floor: 11 x 7 in the middle
  const hallLocal: Rect | null = quest === "quest_2" ? { x: c - 5, y: c - 3, w: 11, h: 7 } : null;
  const entranceCol = Math.round(c);
  let footY = size - 1;
  while (footY > 0 && !inDisk(size, entranceCol, footY)) footY--;

  const lists: FloorPlan[] = [];
  for (let k = 0; k < floorsN; k++) {
    const zones: Rect[] = [];
    // the staircase going up and the door coming down (the transitions on either side of this floor)
    if (k < floorsN - 1) zones.push(spotZone(spots[k]!));
    if (k > 0) zones.push(spotZone(spots[k - 1]!));
    // the way in: a floor with room on both sides of the door, at the foot of the ground floor
    if (k === 0) zones.push({ x: entranceCol - 1, y: footY - 2, w: 3, h: 3 });
    const top = k === floorsN - 1;
    const rooms = size === TOWER_BIG ? rng.range(7, 10) : rng.range(4, 6);
    const hall = top && hallLocal && holds(size, hallLocal) ? hallLocal : null;
    const { lines } = partition(rng, size, zones, rooms, hall);
    lists.push(buildFloor(rng, size, lines, hall, entranceCol));
  }

  // carve every floor into the builder: the rooms (first the ground floor's, whose first room is the room of the way in), then the doorways
  const rooms: Rect[][] = [];
  const hallRoom: { rect: Rect | null } = { rect: null };
  lists.forEach((plan, k) => {
    const o = origin(k);
    for (const rects of plan.rooms) {
      const moved = rects.map((r) => ({ x: r.x + o.x, y: r.y + o.y, w: r.w, h: r.h }));
      rooms.push(moved);
      if (plan.hall && k === floorsN - 1 && hallLocal && rects.length === 1 && rects[0]!.x === hallLocal.x && rects[0]!.y === hallLocal.y && rects[0]!.w === hallLocal.w && rects[0]!.h === hallLocal.h) hallRoom.rect = moved[0]!;
    }
  });
  for (const rects of rooms) b.carveRoom(rects);
  lists.forEach((plan, k) => {
    const o = origin(k);
    for (const d of plan.doors) b.carveCorridorCell(o.x + (d % size), o.y + Math.floor(d / size));
  });

  // the stairs
  const stairs: TowerLayout["stairs"] = [];
  spots.forEach((s, t) => {
    const lo = origin(t);
    const hi = origin(t + 1);
    const at = (o: { x: number; y: number }, p: { x: number; y: number }) => ({ x: o.x + p.x, y: o.y + p.y });
    const entry = { up: at(lo, s.p), front: at(lo, s.f), down: at(hi, s.p), land: at(hi, s.f), facing: s.facing };
    stairs.push(entry);
    b.links.set(b.idx(entry.up.x, entry.up.y), b.idx(entry.land.x, entry.land.y));
    b.links.set(b.idx(entry.down.x, entry.down.y), b.idx(entry.front.x, entry.front.y));
    for (const p of [entry.up, entry.front, entry.down, entry.land]) b.reserved.add(b.idx(p.x, p.y));
  });
  const floors = Array.from({ length: floorsN }, (_, k) => ({ ...origin(k), size }));
  const tower: TowerLayout = { floors, stairs };

  // the way in: the foot of the ground floor, a door in the wall south of it
  const o0 = origin(0);
  const exit = { x: o0.x + entranceCol, y: o0.y + footY };
  const spawn = { x: exit.x, y: exit.y - 1, facing: "N" as const };
  const hall = hallRoom.rect ?? undefined;
  return finishDungeon(rng, { ...ctx, theme: towerTheme(ctx.theme), dungeon: ctx.dungeon ? { ...ctx.dungeon, tower } : undefined }, { b, rooms, exit: { exit, spawn }, ...(hall ? { hall, endNear: hall } : {}) });
}
