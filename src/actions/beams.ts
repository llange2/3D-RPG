import type { Rng } from "../core/rng";
import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";

/**
 * The wooden support beams of the dungeons and towers (48th playtest, point 6; item 99, `SUPPORT_BEAM` in `registry.ts`). A beam is a truss that stands on the EDGE between two cells: the
 * action sits on one of them (`x`, `y`) and names the side (`side`, E or S) where the other one lies; both cells stay walkable, the step across the edge is blocked (`beamBetween`). It
 * is a plain decoration. NOTE for a later free movement: the beam itself is solid, it blocks the way through its own plane wherever the party stands.
 *
 * They come in regular patterns, never scattered: one room gets one pattern, all its beams face the same way (their planes across one axis of the room) and a room holds at most ten:
 *  - `single`: one beam,
 *  - `row`: one beam every `gap` cells along the axis they block (like the arches of a hall),
 *  - `column`: one beam every `gap` cells across it (a line of trusses side by side, with a gap to walk through),
 *  - `grid`: both, a row and a column together.
 * A beam never splits a place: the party still reaches every cell with all the beams taken together (`reachable`).
 */

export type BeamPattern = "single" | "row" | "column" | "grid";
export const BEAM_PATTERNS: readonly [BeamPattern, number][] = [["single", 2], ["row", 3], ["column", 2], ["grid", 2]];
/** The most beams in one room. */
export const BEAMS_PER_ROOM = 10;
/** A room must have this many cells to get beams (a big room), and a chance of this many thousandths to get them. */
export const BEAM_ROOM_CELLS = 24;
export const BEAM_ROOM_CHANCE = 600;

export interface BeamSpec {
  x: number;
  y: number;
  /** The side of the cell the beam stands on: E or S (the other cell is its neighbour there). */
  side: "E" | "S";
}

/** Is the step between two neighbouring cells blocked by a beam? `beams` maps a cell index to the side its beam stands on. */
export function beamBetween(beams: ReadonlyMap<number, Facing> | undefined, width: number, ax: number, ay: number, bx: number, by: number): boolean {
  if (!beams || beams.size === 0) return false;
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  // the beam of a cell stands on its E or S side; seen from the other cell it is the W or N side
  const side: Facing = dx === 1 ? "E" : dx === -1 ? "W" : dy === 1 ? "S" : "N";
  if (beams.get(ay * width + ax) === side) return true;
  const back: Facing = side === "E" ? "W" : side === "W" ? "E" : side === "S" ? "N" : "S";
  return beams.get(by * width + bx) === back;
}

/** The cells of the map that the party reaches from the spawn cell, when the beams (and the jumps of a tower's stairs, `links`) are taken together. */
export function reachableWithBeams(map: InteriorMap, beams: ReadonlyMap<number, Facing>, links: ReadonlyMap<number, number>): number {
  const w = map.width;
  const seen = new Uint8Array(map.cells.length);
  const start = map.spawn.y * w + map.spawn.x;
  const queue = [start];
  seen[start] = 1;
  let count = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    count++;
    const x = i % w;
    const y = (i - x) / w;
    const next: number[] = [];
    for (const f of Object.values(FACING_DELTA)) {
      const nx = x + f.dx;
      const ny = y + f.dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= map.height || map.cells[ny * w + nx] !== CELL.FLOOR) continue;
      if (beamBetween(beams, w, x, y, nx, ny)) continue;
      next.push(ny * w + nx);
    }
    const jump = links.get(i);
    if (jump !== undefined) next.push(jump);
    for (const n of next) {
      if (!seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return count;
}

/** The floor cells of the rooms the map keeps, by room id. */
function roomsOf(map: InteriorMap): Map<number, number[]> {
  const rooms = new Map<number, number[]>();
  for (let i = 0; i < map.roomOf.length; i++) {
    const id = map.roomOf[i]!;
    if (id < 0 || map.cells[i] !== CELL.FLOOR) continue;
    const list = rooms.get(id);
    if (list) list.push(i);
    else rooms.set(id, [i]);
  }
  return rooms;
}

/**
 * The beams of a place: for every big room a chance of one pattern. `usable(x, y)` says whether a cell may take a beam (it holds nothing, it is no doorway, no landing and no middle of a room).
 * The order of the rooms and of the draws is fixed, so the same place always gets the same beams.
 */
export function planBeams(map: InteriorMap, rng: Rng, usable: (x: number, y: number) => boolean, links: ReadonlyMap<number, number> = new Map()): BeamSpec[] {
  const w = map.width;
  const out: BeamSpec[] = [];
  const beams = new Map<number, Facing>();
  const baseline = reachableWithBeams(map, beams, links);
  const roomList = [...roomsOf(map)].sort((a, b) => a[0] - b[0]);
  // 53rd playtest, point 15: a room with stone columns has no wooden beams (the two together crowd the room); the draw below is made as before, so the other rooms keep their beams
  const withPillars = new Set((map.pillars ?? []).map((p) => map.roomOf[p.y * w + p.x]));
  for (const [id, cells] of roomList) {
    if (cells.length < BEAM_ROOM_CELLS || !rng.chance(BEAM_ROOM_CHANCE)) continue;
    if (withPillars.has(id)) continue;
    const inRoom = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < map.height && map.roomOf[y * w + x] === id && map.cells[y * w + x] === CELL.FLOOR;
    // the cells of the room that a beam may take, with the cell beside it (on the E or the S side) also in the room and usable
    const axis: "x" | "y" = rng.chance(500) ? "x" : "y";
    const side = axis === "x" ? "E" : "S";
    const d = FACING_DELTA[side];
    const fits = (x: number, y: number): boolean => inRoom(x, y) && inRoom(x + d.dx, y + d.dy) && usable(x, y) && usable(x + d.dx, y + d.dy);
    const xs = cells.map((i) => i % w);
    const ys = cells.map((i) => Math.floor(i / w));
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // the free cells of the room's inner part (not against a wall, so that a beam stands free in the room), in the order of the map
    const inner = cells.filter((i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      return fits(x, y) && inRoom(x - 1, y) && inRoom(x + 1, y) && inRoom(x, y - 1) && inRoom(x, y + 1);
    });
    if (inner.length === 0) continue;
    const kind = BEAM_PATTERNS[rng.weightedIndex(BEAM_PATTERNS.map(([, n]) => n))]![0];
    const gap = rng.range(2, 4);
    const origin = inner[rng.int(inner.length)]!;
    const ox = origin % w;
    const oy = Math.floor(origin / w);
    // `u` runs along the axis the beams block, `v` across it
    const at = (u: number, v: number): [number, number] => (axis === "x" ? [ox + u, oy + v] : [ox + v, oy + u]);
    const offsets: [number, number][] = [];
    const reach = Math.max(x1 - x0, y1 - y0);
    if (kind === "single") offsets.push([0, 0]);
    const ks = Array.from({ length: Math.floor(reach / gap) + 1 }, (_, k) => k);
    if (kind === "row" || kind === "grid") for (const k of ks) for (const sign of k === 0 ? [1] : [1, -1]) offsets.push([sign * k * gap, 0]);
    if (kind === "column" || kind === "grid") for (const k of ks) for (const sign of k === 0 ? [1] : [1, -1]) if (kind === "column" || k > 0) offsets.push([0, sign * k * gap]);
    if (kind === "grid") for (const a of ks.slice(1)) for (const b of ks.slice(1)) for (const sa of [1, -1]) for (const sb of [1, -1]) offsets.push([sa * a * gap, sb * b * gap]);
    // the nearest to the origin first: a pattern that is cut off at ten stays even round its middle
    offsets.sort((p, q) => p[0] ** 2 + p[1] ** 2 - (q[0] ** 2 + q[1] ** 2));
    const picked: BeamSpec[] = [];
    for (const [u, v] of offsets) {
      if (picked.length >= BEAMS_PER_ROOM) break;
      const [x, y] = at(u, v);
      if (!fits(x, y)) continue;
      // two beams are never next to each other
      if (picked.some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) < 2)) continue;
      picked.push({ x, y, side });
    }
    if (picked.length === 0) continue;
    // the beams of the room are in only if the whole place stays whole with them
    const trial = new Map(beams);
    for (const p of picked) trial.set(p.y * w + p.x, p.side);
    if (reachableWithBeams(map, trial, links) !== baseline) continue;
    for (const [k, v] of trial) beams.set(k, v);
    out.push(...picked);
  }
  return out;
}
