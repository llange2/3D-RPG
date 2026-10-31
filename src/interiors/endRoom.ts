import type { Rng } from "../core/rng";
import { Builder, neighbours4 } from "./builder";
import { CELL, FACING_DELTA, type DungeonRef, type Facing } from "./types";

/**
 * The end room of a quest (quest document 1.2, "End-Räume"): the room with the loot, out of reach until the quest is solved. It is carved into
 * solid rock after the rest of the place is done, as far from the way in as the place allows, and it belongs to no room of the map, so the
 * ordinary rules put nothing in it (the quest fills it, `actions/endRoom.ts`).
 *  - `sealed`: a pocket whose only way in is one wall cell next to a floor cell (the `seal`); the quest makes that wall give way.
 *  - `isolated`: a pocket in the rock without any way in; the party is teleported there by the quest and brought back by a portal.
 */

export type EndRoom = NonNullable<DungeonRef["endRoom"]>;

/** Floor cells and their distance from the start, -1 for the rest. */
function depthFrom(b: Builder, sx: number, sy: number): Int16Array {
  const depth = new Int16Array(b.width * b.height).fill(-1);
  const queue = [b.idx(sx, sy)];
  depth[queue[0]!] = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % b.width;
    const y = (i - x) / b.width;
    for (const [nx, ny] of neighbours4(x, y)) {
      if (!b.inside(nx, ny) || !b.isFloor(nx, ny)) continue;
      const ni = b.idx(nx, ny);
      if (depth[ni]! < 0) {
        depth[ni] = depth[i]! + 1;
        queue.push(ni);
      }
    }
  }
  return depth;
}

/** Is every cell of the rectangle, with a margin of `m` cells round it, solid rock inside the map and away from its border? */
function solidBlock(b: Builder, x: number, y: number, w: number, h: number, m: number): boolean {
  for (let cy = y - m; cy < y + h + m; cy++) {
    for (let cx = x - m; cx < x + w + m; cx++) {
      if (cx < 2 || cy < 2 || cx >= b.width - 2 || cy >= b.height - 2) return false;
      if (b.get(cx, cy) !== CELL.SOLID) return false;
    }
  }
  return true;
}

function carve(b: Builder, x: number, y: number, w: number, h: number): void {
  for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) b.set(cx, cy, CELL.FLOOR);
}

/**
 * Carves the end room of `w` x `h` cells (a sealed one lies with its short side along the way in). Returns null if the rock has no room for it, which
 * the caller treats as a generator failure (it retries or enlarges the map).
 */
export function carveEndRoom(b: Builder, rng: Rng, spawn: { x: number; y: number }, isolated: boolean, w = 5, h = 4, within?: { x: number; y: number; w: number; h: number }, scatter = false, avoid?: (x: number, y: number) => boolean): EndRoom | null {
  const depth = depthFrom(b, spawn.x, spawn.y);
  let best: { room: EndRoom; score: number } | null = null;
  const take = (room: EndRoom, score: number) => {
    // (a treasure chamber goes anywhere there is rock, the end room as far from the way in as it can)
    const jittered = scatter ? rng.int(100000) : score * 8 + rng.int(8);
    if (!best || jittered > best.score) best = { room, score: jittered };
  };

  if (isolated) {
    for (let y = 4; y < b.height - 4 - h; y += 1) {
      for (let x = 4; x < b.width - 4 - w; x += 1) {
        if (!solidBlock(b, x, y, w, h, 2)) continue;
        const cx = x + (w >> 1);
        const cy = y + (h >> 1);
        take({ x, y, w, h, cx, cy, isolated: true }, Math.abs(cx - spawn.x) + Math.abs(cy - spawn.y));
      }
    }
  } else {
    // a treasure chamber takes the first place that fits in a random order of the floor (the end room looks at all of them for the farthest)
    const cells = Array.from({ length: b.cells.length }, (_, i) => i);
    const order = scatter ? rng.shuffle(cells.filter((i) => depth[i]! >= 3)) : cells;
    search: for (const i of order) {
      if (depth[i]! < 3) continue;
      const fx = i % b.width;
      const fy = (i - fx) / b.width;
      // a quest whose wall is the one of a hall (the row of heads) asks for a seal in that hall
      if (within && (fx < within.x || fy < within.y || fx >= within.x + within.w || fy >= within.y + within.h)) continue;
      if (avoid?.(fx, fy)) continue;
      for (const f of Object.keys(FACING_DELTA) as Facing[]) {
        const { dx, dy } = FACING_DELTA[f];
        const sx = fx + dx;
        const sy = fy + dy;
        // the seal is a plain wall cell: wall on both sides of it too
        if (b.get(sx, sy) !== CELL.SOLID || b.get(sx + dy, sy + dx) !== CELL.SOLID || b.get(sx - dy, sy - dx) !== CELL.SOLID) continue;
        // the room lies beyond the seal, its long side along the way in
        const rw = dx !== 0 ? h : w;
        const rh = dx !== 0 ? w : h;
        const rx = dx > 0 ? sx + 1 : dx < 0 ? sx - rw : fx - (rw >> 1);
        const ry = dy > 0 ? sy + 1 : dy < 0 ? sy - rh : fy - (rh >> 1);
        // the rock round the room, with the seal as the one cell of it that touches the way in
        if (!solidBlock(b, rx, ry, rw, rh, 1)) continue;
        take({ x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1), seal: { x: sx, y: sy }, isolated: false }, depth[i]!);
        if (scatter) break search;
      }
    }
  }
  const found = best as { room: EndRoom; score: number } | null;
  if (!found) return null;
  carve(b, found.room.x, found.room.y, found.room.w, found.room.h);
  return found.room;
}

/**
 * The room of the machines of the Quatloo coins (ue_quest_1): a sealed room whose wall cell is a doorway with a door in it, where Seth Squirm stands
 * beside the way in. Carved after the end room, anywhere in the rock; null if the place has no room for it.
 */
export function carveMachineRoom(b: Builder, rng: Rng, spawn: { x: number; y: number }): NonNullable<DungeonRef["machines"]> | null {
  const room = carveEndRoom(b, rng, spawn, false, 5, 4);
  if (!room?.seal) return null;
  // the cell of the room next to the doorway, and the cell in front of the doorway outside it
  const inside = { x: Math.min(room.x + room.w - 1, Math.max(room.x, room.seal.x)), y: Math.min(room.y + room.h - 1, Math.max(room.y, room.seal.y)) };
  const front = { x: room.seal.x + (room.seal.x - inside.x), y: room.seal.y + (room.seal.y - inside.y) };
  b.set(room.seal.x, room.seal.y, CELL.FLOOR);
  return { x: room.x, y: room.y, w: room.w, h: room.h, cx: room.cx, cy: room.cy, door: room.seal, front };
}

/** The middle of every room the builder has marked (`makeRoom` takes the cell at half the width and height of the room's rectangle). */
function roomCentres(b: Builder): { x: number; y: number }[] {
  const box = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
  for (let i = 0; i < b.roomOf.length; i++) {
    const id = b.roomOf[i]!;
    if (id < 0) continue;
    const x = i % b.width;
    const y = (i - x) / b.width;
    const r = box.get(id);
    if (!r) box.set(id, { x0: x, y0: y, x1: x, y1: y });
    else {
      r.x0 = Math.min(r.x0, x);
      r.y0 = Math.min(r.y0, y);
      r.x1 = Math.max(r.x1, x);
      r.y1 = Math.max(r.y1, y);
    }
  }
  return [...box.values()].map((r) => ({ x: r.x0 + Math.floor((r.x1 - r.x0 + 1) / 2), y: r.y0 + Math.floor((r.y1 - r.y0 + 1) / 2) }));
}

/** The sizes of a treasure chamber behind a brittle wall (the long side along the way in), tried in this order. */
const VAULT_SIZES: readonly (readonly [number, number])[] = [[3, 2], [2, 2], [3, 1]];

/**
 * Carves up to `count` small treasure chambers behind brittle walls (35th playtest) into the rock that is left, anywhere in it: a pocket whose only way in is one wall cell next to
 * a floor cell, like a sealed end room but small. A place without rock for one gets fewer (a maze, whose walls are one cell thick, gets none).
 */
export function carveVaults(b: Builder, rng: Rng, spawn: { x: number; y: number }, count: number, keepClear: readonly { x: number; y: number; w: number; h: number }[] = [], roomMiddles?: readonly { x: number; y: number }[]): NonNullable<DungeonRef["vaults"]> {
  const out: NonNullable<DungeonRef["vaults"]> = [];
  if (count <= 0) return out;
  // the cell in front of the brittle wall is where the party stands: not in the middle of a room (the monsters of the room stand there), not in the hall or the entrance field of a quest
  // (a cave's chambers are no rectangles: the caller names their middles)
  const centres = roomMiddles ?? roomCentres(b);
  const avoid = (x: number, y: number): boolean =>
    centres.some((c) => Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1) || keepClear.some((r) => x >= r.x - 1 && y >= r.y - 1 && x <= r.x + r.w && y <= r.y + r.h);
  for (let n = 0; n < count; n++) {
    let room: EndRoom | null = null;
    for (const [w, h] of VAULT_SIZES) {
      room = carveEndRoom(b, rng, spawn, false, w, h, undefined, true, avoid);
      if (room?.seal) break;
    }
    if (!room?.seal) break;
    out.push({ x: room.x, y: room.y, w: room.w, h: room.h, cx: room.cx, cy: room.cy, seal: room.seal });
  }
  return out;
}

const SIZES: readonly (readonly [number, number])[] = [[5, 4], [4, 4], [4, 3], [3, 3]];
/** The rooms tried first for a place that holds three orbs or more. */
const CROWDED: readonly (readonly [number, number])[] = [[7, 5], [6, 5]];

/**
 * The end room of a place, as the quest wants it: a pocket for the quests that teleport, a sealed room otherwise (in the wall of `within` if the
 * quest says so). A place without rock for the first choice takes the other kind, then a smaller room, so a place always has one.
 */
export function carveEndRoomFor(b: Builder, rng: Rng, spawn: { x: number; y: number }, teleported: boolean, within?: { x: number; y: number; w: number; h: number }, orbs = 0): EndRoom | null {
  // every orb is a chest of its own (31st playtest): a small world puts up to seven orbs into one room, which then needs room for them
  for (const [w, h] of orbs >= 3 ? [...CROWDED, ...SIZES] : SIZES) {
    const order = teleported ? [true, false] : [false, true];
    for (const isolated of order) {
      const room = (!isolated && within ? carveEndRoom(b, rng, spawn, false, w, h, within) : null) ?? carveEndRoom(b, rng, spawn, isolated, w, h);
      if (room) return room;
    }
  }
  return null;
}

/** Is the cell part of the end room, or its seal? */
export function inEndRoom(room: EndRoom | undefined, x: number, y: number): boolean {
  if (!room) return false;
  return (x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h) || (room.seal?.x === x && room.seal.y === y);
}
