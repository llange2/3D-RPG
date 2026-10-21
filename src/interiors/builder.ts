import type { Rng } from "../core/rng";
import { CELL, FACING_DELTA, type DungeonRef, type Facing, type InteriorKind, type InteriorMap, type InteriorTheme, type Lot, type Room } from "./types";
import { openSquare } from "./passage";
import { makeRoom } from "./topology";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BuildContext {
  key: string;
  tier: number;
  theme: InteriorTheme;
  dungeon?: DungeonRef;
}

/** Mutable grid used while a generator works. */
export class Builder {
  readonly cells: Uint8Array;
  readonly roomOf: Int16Array;
  readonly roomRects: Rect[][] = [];
  /** Cells that hold a group of four pillars (the old game's "4 pillars"); they stay floor and can be walked on. */
  readonly pillars: { x: number; y: number }[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = new Uint8Array(width * height); // all SOLID
    this.roomOf = new Int16Array(width * height).fill(-1);
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): number {
    return this.inside(x, y) ? this.cells[this.idx(x, y)]! : CELL.SOLID;
  }

  set(x: number, y: number, value: number): void {
    if (this.inside(x, y)) this.cells[this.idx(x, y)] = value;
  }

  isFloor(x: number, y: number): boolean {
    return this.get(x, y) === CELL.FLOOR;
  }

  /**
   * Raises a column (the old "4 pillars") on a floor cell: no wall may be within a cell of it (the 3 x 3 square round it is all floor) and no column
   * stands next to it. Columns may stand one cell apart, which makes a colonnade. Returns whether the column was raised.
   */
  addPillar(x: number, y: number): boolean {
    if (!openSquare((cx, cy) => this.isFloor(cx, cy), x, y)) return false;
    if (this.pillars.some((q) => Math.max(Math.abs(q.x - x), Math.abs(q.y - y)) < 2)) return false;
    this.pillars.push({ x, y });
    return true;
  }

  /** Carves one room made of one or more rectangles. Returns its id. */
  carveRoom(rects: Rect[]): number {
    const id = this.roomRects.length;
    this.roomRects.push(rects);
    for (const r of rects) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          this.set(x, y, CELL.FLOOR);
          this.roomOf[this.idx(x, y)] = id;
        }
      }
    }
    return id;
  }

  /** Carves a one-cell wide corridor cell; keeps room membership of cells that already belong to a room. */
  carveCorridorCell(x: number, y: number): void {
    if (!this.inside(x, y)) return;
    if (this.cells[this.idx(x, y)] === CELL.SOLID) this.cells[this.idx(x, y)] = CELL.FLOOR;
  }

  /** L-shaped corridor between two cells. */
  carveL(ax: number, ay: number, bx: number, by: number, horizontalFirst: boolean): void {
    const step = (a: number, b: number) => (b > a ? 1 : -1);
    if (horizontalFirst) {
      for (let x = ax; x !== bx; x += step(ax, bx)) this.carveCorridorCell(x, ay);
      for (let y = ay; y !== by; y += step(ay, by)) this.carveCorridorCell(bx, y);
    } else {
      for (let y = ay; y !== by; y += step(ay, by)) this.carveCorridorCell(ax, y);
      for (let x = ax; x !== bx; x += step(ax, bx)) this.carveCorridorCell(x, by);
    }
    this.carveCorridorCell(bx, by);
  }

  /** Rooms as bounding boxes with their floor cell count. Pillar cells and cut cells do not count. */
  buildRooms(): Room[] {
    return this.roomRects.map((rects, id) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const r of rects) {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w - 1);
        maxY = Math.max(maxY, r.y + r.h - 1);
      }
      const room = makeRoom(id, minX, minY, maxX - minX + 1, maxY - minY + 1);
      // centre: the floor cell of the main rectangle closest to the box centre
      const main = rects[0]!;
      room.cx = main.x + Math.floor(main.w / 2);
      room.cy = main.y + Math.floor(main.h / 2);
      let size = 0;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (this.roomOf[this.idx(x, y)] === id && this.isFloor(x, y)) size++;
      room.size = size;
      return room;
    });
  }

  /**
   * Chooses the exit: a floor cell that has a wall to its south and a floor cell to its north,
   * as close as possible to the preferred cell. The party spawns on the north neighbour. The exit door stands in that wall cell,
   * so the wall must go on to both sides of it: a door never sits at a corner where a corridor or opening starts next to it.
   */
  pickExit(preferX: number, preferY: number, filter?: (x: number, y: number) => boolean): { exit: { x: number; y: number }; spawn: { x: number; y: number; facing: Facing } } {
    const wallLike = (x: number, y: number) => {
      const c = this.get(x, y);
      return c === CELL.SOLID || c === CELL.BUILDING;
    };
    // First the generator's filter (for example "inside the entrance room") with a flanked door, then without the filter, and only if
    // the map offers no such wall at all, a door at a wall end.
    for (const [active, flanked] of [[filter, true], [undefined, true], [filter, false], [undefined, false]] as const) {
      let best: { x: number; y: number } | null = null;
      let bestScore = Infinity;
      for (let y = 1; y < this.height - 1; y++) {
        for (let x = 1; x < this.width - 1; x++) {
          if (!this.isFloor(x, y) || this.isFloor(x, y + 1) || !this.isFloor(x, y - 1)) continue;
          if (!wallLike(x, y + 1)) continue;
          if (flanked && !(wallLike(x - 1, y + 1) && wallLike(x + 1, y + 1))) continue;
          if (active && !active(x, y)) continue;
          const score = Math.abs(x - preferX) + Math.abs(y - preferY) * 2;
          if (score < bestScore) {
            bestScore = score;
            best = { x, y };
          }
        }
      }
      if (best) return { exit: best, spawn: { x: best.x, y: best.y - 1, facing: "N" } };
    }
    throw new Error("pickExit: no wall-backed floor cell found");
  }

  finish(kind: InteriorKind, ctx: BuildContext, exit: { x: number; y: number }, spawn: { x: number; y: number; facing: Facing }, lots: Lot[] = []): InteriorMap {
    // whatever was carved after a column was raised (a vault, a glyph) may have put a wall next to it: such a column goes
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const q = this.pillars[i]!;
      if (!openSquare((cx, cy) => this.isFloor(cx, cy), q.x, q.y)) this.pillars.splice(i, 1);
    }
    return {
      kind,
      key: ctx.key,
      width: this.width,
      height: this.height,
      cells: this.cells,
      rooms: this.buildRooms(),
      roomOf: this.roomOf,
      exit,
      spawn,
      lots,
      theme: ctx.theme,
      tier: ctx.tier,
      ...(ctx.dungeon ? { dungeon: ctx.dungeon } : {}),
      ...(this.pillars.length > 0 ? { pillars: this.pillars } : {}),
    };
  }
}

export function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return a.x - gap < b.x + b.w && a.x + a.w + gap > b.x && a.y - gap < b.y + b.h && a.y + a.h + gap > b.y;
}

export function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/** Minimum spanning tree (Prim) over room centres. Returns index pairs. */
export function primEdges(centres: { x: number; y: number }[]): [number, number][] {
  const n = centres.length;
  if (n < 2) return [];
  const inTree = new Array<boolean>(n).fill(false);
  const bestDist = new Array<number>(n).fill(Infinity);
  const bestFrom = new Array<number>(n).fill(-1);
  const edges: [number, number][] = [];
  inTree[0] = true;
  for (let j = 1; j < n; j++) {
    bestDist[j] = manhattan(centres[0]!.x, centres[0]!.y, centres[j]!.x, centres[j]!.y);
    bestFrom[j] = 0;
  }
  for (let step = 1; step < n; step++) {
    let pick = -1;
    for (let j = 0; j < n; j++) if (!inTree[j] && (pick === -1 || bestDist[j]! < bestDist[pick]!)) pick = j;
    inTree[pick] = true;
    edges.push([bestFrom[pick]!, pick]);
    for (let j = 0; j < n; j++) {
      if (inTree[j]) continue;
      const d = manhattan(centres[pick]!.x, centres[pick]!.y, centres[j]!.x, centres[j]!.y);
      if (d < bestDist[j]!) {
        bestDist[j] = d;
        bestFrom[j] = pick;
      }
    }
  }
  return edges;
}

/** Adds about n/3 extra edges between close rooms so the dungeon has loops. */
export function extraEdges(centres: { x: number; y: number }[], existing: [number, number][], rng: Rng, count: number): [number, number][] {
  const has = new Set(existing.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)));
  const extra: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = rng.int(centres.length);
    const near = centres
      .map((c, idx) => ({ idx, d: manhattan(centres[a]!.x, centres[a]!.y, c.x, c.y) }))
      .filter((o) => o.idx !== a)
      .sort((p, q) => p.d - q.d || p.idx - q.idx)
      .slice(0, 3);
    const b = rng.pick(near).idx;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (has.has(key)) continue;
    has.add(key);
    extra.push([a, b]);
  }
  return extra;
}

export function neighbours4(x: number, y: number): [number, number][] {
  return (Object.keys(FACING_DELTA) as Facing[]).map((f) => [x + FACING_DELTA[f].dx, y + FACING_DELTA[f].dy] as [number, number]);
}
