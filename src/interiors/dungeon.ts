import type { Rng } from "../core/rng";
import { Builder, extraEdges, primEdges, rectsOverlap, type BuildContext, type Rect } from "./builder";
import { carveEndRoomFor, carveMachineRoom } from "./endRoom";
import { longestCorridor } from "./topology";
import { CELL, type DungeonRef, type InteriorMap } from "./types";

const SIZE = 96;

/**
 * The four layouts of the dungeons (quest document 1.2, "Layouts"): a long tube that leads through rooms (dungeon_1), a hall at the entrance with ways
 * to different rooms (dungeon_2), a maze of corridors with a few small rooms and runes as barriers (dungeon_3) and the classic branching dungeon of
 * rooms and corridors (dungeon_4). The layouts are styles: what a quest needs (the 5 x 5 field at the entrance of quest 1, the hall of quest 2) is
 * built into every one of them. The doors, gates, traps and lanterns are set by the rules (`actions/rules.ts`), not by the layout.
 */
export function generateDungeon(rng: Rng, ctx: BuildContext): InteriorMap {
  switch (ctx.dungeon?.layout) {
    case "dungeon_1":
      return tube(rng, ctx);
    case "dungeon_2":
      return hub(rng, ctx);
    case "dungeon_3":
      return maze(rng, ctx);
    default:
      return classic(rng, ctx);
  }
}

/** The room the party enters: 5 x 4 to 7 x 7, and 9 x 9 for quest 1, which stands its field of statues in it. */
function entranceRect(rng: Rng, ctx: BuildContext, cx: number, cy: number): Rect {
  if (ctx.dungeon?.quest === "quest_1") return { x: cx - 4, y: cy - 4, w: 9, h: 9 };
  const w = rng.range(5, 7);
  const h = rng.range(5, 7);
  return { x: cx - (w >> 1), y: cy - (h >> 1), w, h };
}

/** The hall of quest 2 (a row of five heads with room to walk before them), or nothing for the other quests. */
const hallRect = (ctx: BuildContext, cx: number, cy: number): Rect | undefined => (ctx.dungeon?.quest === "quest_2" ? { x: cx - 5, y: cy - 3, w: 11, h: 7 } : undefined);

interface Plan {
  b: Builder;
  rooms: Rect[][];
  /** The room the party enters is room 0. */
  hall?: Rect;
  /** Where a sealed end room is wanted next to: the hall of quest 2, the last room of the tube. */
  endNear?: Rect;
  /** Cells of the maze that block a loop (runes, see `ref.barriers`). */
  barriers?: { x: number; y: number }[];
}

/** Columns in the big rooms (kept away from the centre row and column where corridors leave), then the exit, the end room and the reference. */
function finishDungeon(rng: Rng, ctx: BuildContext, plan: Plan): InteriorMap {
  const { b, rooms, hall } = plan;
  const quest = ctx.dungeon?.quest;
  // the maze has its walls one cell thick and keeps its straights short while it is grown (`maze`); every other layout is bent here
  if (ctx.dungeon?.layout !== "dungeon_3") bendLongCorridors(b);
  rooms.forEach((rects, id) => {
    const r = rects[0]!;
    if (id === 0 || r === hall || r.w < 7 || r.h < 7 || !rng.chance(350)) return;
    // a column has no wall within a cell of it: two cells in from the walls
    for (const [px, py] of [
      [r.x + 2, r.y + 2],
      [r.x + r.w - 3, r.y + 2],
      [r.x + 2, r.y + r.h - 3],
      [r.x + r.w - 3, r.y + r.h - 3],
    ] as const) {
      if (b.roomOf[b.idx(px, py)] === id) b.addPillar(px, py);
    }
  });
  const r0 = rooms[0]![0]!;
  const { exit, spawn } = b.pickExit(r0.x + Math.floor(r0.w / 2), r0.y + r0.h - 1, (x, y) => b.roomOf[b.idx(x, y)] === 0 && b.isFloor(x - 1, y) && b.isFloor(x + 1, y));
  // the end room: the quests that teleport the party into it (quest 1 and 3) leave it in the rock on its own, the others seal it
  const wantsRoom = !!ctx.dungeon && quest !== "spaceship";
  const endRoom = wantsRoom ? carveEndRoomFor(b, rng, spawn, quest === "quest_1" || quest === "quest_3", plan.endNear, ctx.dungeon?.orbs) : null;
  // Seth Squirm and the machines of the Quatloo coins: a room behind a door
  const machines = ctx.dungeon?.seth ? carveMachineRoom(b, rng, spawn) : null;
  const entrance = quest === "quest_1" ? { hall: { ...r0 } } : hall ? { hall: { ...hall } } : {};
  const dungeon: DungeonRef | undefined = ctx.dungeon ? { ...ctx.dungeon, ...entrance, ...(endRoom ? { endRoom } : {}), ...(machines ? { machines } : {}), ...(plan.barriers ? { barriers: plan.barriers } : {}) } : undefined;
  return b.finish("dungeon", { ...ctx, dungeon }, exit, spawn);
}

const inBounds = (r: Rect, m = 3, size = SIZE) => r.x >= m && r.y >= m && r.x + r.w <= size - m && r.y + r.h <= size - m;

/** A random room of 5 to 7 cells (or 3 to 7 in the classic layout), centred on a point. */
function roomAround(rng: Rng, cx: number, cy: number, min = 5, max = 7): Rect {
  const w = rng.range(min, max);
  const h = rng.range(min, max);
  return { x: cx - (w >> 1), y: cy - (h >> 1), w, h };
}

// ---------------------------------------------------------------- dungeon_1: the tube

/**
 * Joins two rooms with a short corridor. Rooms that face each other (their rows or columns overlap) get a straight corridor through the middle of
 * the overlap; rooms that lie diagonally get an L with its bend in the rock between them. A corridor from centre to centre ran along the wall of a
 * third room when the rooms were shifted against each other, which left that wall open for a dozen cells.
 */
function joinRooms(b: Builder, rng: Rng, a: Rect, c: Rect): void {
  const rows = [Math.max(a.y, c.y), Math.min(a.y + a.h, c.y + c.h) - 1];
  const cols = [Math.max(a.x, c.x), Math.min(a.x + a.w, c.x + c.w) - 1];
  if (rows[0]! <= rows[1]!) {
    const y = (rows[0]! + rows[1]!) >> 1;
    b.carveL(a.x < c.x ? a.x + a.w - 1 : a.x, y, a.x < c.x ? c.x : c.x + c.w - 1, y, true);
  } else if (cols[0]! <= cols[1]!) {
    const x = (cols[0]! + cols[1]!) >> 1;
    b.carveL(x, a.y < c.y ? a.y + a.h - 1 : a.y, x, a.y < c.y ? c.y : c.y + c.h - 1, false);
  } else {
    // two ways to bend; the one that does not line up with a corridor already there (two L's on one column made a straight of 17 cells) wins
    const [ax, ay, cx, cy] = [a.x + (a.w >> 1), a.y + (a.h >> 1), c.x + (c.w >> 1), c.y + (c.h >> 1)];
    const first = rng.chance(500);
    const saved = b.cells.slice();
    const straight = [first, !first].map((horizontalFirst) => {
      b.carveL(ax, ay, cx, cy, horizontalFirst);
      const longest = longestCorridor(b);
      b.cells.set(saved);
      return longest;
    });
    b.carveL(ax, ay, cx, cy, straight[1]! < straight[0]! ? !first : first);
  }
}

const TUBE_SIZE = 72;

/** Grid cells (column, row; row 0 is the bottom one, where the party enters) in the order of the way: a snake along the rows or the columns, or a spiral inwards. */
function tubeWay(kind: "rows" | "columns" | "spiral", cols: number, rows: number): [number, number][] {
  const way: [number, number][] = [];
  if (kind === "rows") {
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) way.push([r % 2 === 0 ? k : cols - 1 - k, r]);
  } else if (kind === "columns") {
    for (let c = 0; c < cols; c++) for (let k = 0; k < rows; k++) way.push([c, c % 2 === 0 ? k : rows - 1 - k]);
  } else {
    let [x0, y0, x1, y1] = [0, 0, cols - 1, rows - 1];
    while (x0 <= x1 && y0 <= y1) {
      for (let x = x0; x <= x1; x++) way.push([x, y0]);
      for (let y = y0 + 1; y <= y1; y++) way.push([x1, y]);
      if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) way.push([x, y1]);
      if (x0 < x1) for (let y = y1 - 1; y > y0; y--) way.push([x0, y]);
      [x0, y0, x1, y1] = [x0 + 1, y0 + 1, x1 - 1, y1 - 1];
    }
  }
  return way;
}

/**
 * A tube of 8 to 15 rooms wound up on itself: the rooms sit on a grid ten cells apart (12 with the hall of quest 2) and follow each other along a snake
 * or a spiral, so the rows of the way lie side by side with about three wall cells between them and no corridor is longer than 8 or 9 cells. The rooms
 * are shifted off their grid cells, which gives the short corridors their bends. Small niches in the walls hold statues and decoration.
 */
function tube(rng: Rng, ctx: BuildContext): InteriorMap {
  const b = new Builder(TUBE_SIZE, TUBE_SIZE);
  const count = rng.range(8, 15);
  const hallWanted = ctx.dungeon?.quest === "quest_2";
  const pitch = hallWanted ? 12 : 10;
  const cols = count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);
  // the hall needs the end of the way on the rim of the rock, where its sealed end room has room: a snake ends there, a spiral in the middle
  const kind = hallWanted ? "rows" : rng.pick(["rows", "columns", "spiral"] as const);
  const way = kind === "columns" ? tubeWay(kind, rows, cols) : tubeWay(kind, cols, rows);
  const gridCols = kind === "columns" ? rows : cols;
  const gridRows = kind === "columns" ? cols : rows;
  const flip = rng.chance(500);
  const ox = (TUBE_SIZE - gridCols * pitch) >> 1;
  const oy = (TUBE_SIZE - gridRows * pitch) >> 1;
  const rects: Rect[] = [];
  way.slice(0, count).forEach(([c, r], i) => {
    const sx = ox + ((flip ? gridCols - 1 - c : c) + 0.5) * pitch;
    const sy = oy + (gridRows - 1 - r + 0.5) * pitch;
    let room: Rect | undefined;
    // shifted off the grid cell as far as the neighbours allow; the last try keeps the grid cell
    for (let attempt = 0; attempt < 10 && !room; attempt++) {
      const shift = attempt < 8 ? 2 : 0;
      const cx = Math.round(sx) + rng.range(-shift, shift);
      const cy = Math.round(sy) + rng.range(-shift, shift);
      const hall = i === count - 1 ? hallRect(ctx, cx, cy) : undefined;
      const candidate = i === 0 ? entranceRect(rng, ctx, cx, cy) : (hall ?? roomAround(rng, cx, cy));
      // the wall to the room before it stays thin (4 cells), so no corridor of the tube is long
      if (attempt === 9 || (inBounds(candidate, 3, TUBE_SIZE) && !rects.some((o) => rectsOverlap(candidate, o, 2)) && (i === 0 || wallGap(candidate, rects[i - 1]!) <= 4))) room = candidate;
    }
    rects.push(room!);
  });
  const rooms = rects.map((r) => [r]);
  const hall = rects[rects.length - 1]!;
  for (const r of rooms) b.carveRoom(r);
  for (let i = 1; i < rects.length; i++) joinRooms(b, rng, rects[i - 1]!, rects[i]!);
  carveSpurs(b, rng, rng.range(4, 7), 1, 2);
  return finishDungeon(rng, ctx, { b, rooms, ...(hallWanted ? { hall } : {}), ...(kind === "spiral" ? {} : { endNear: hall }) });
}

// ---------------------------------------------------------------- dungeon_2: the hall with ways to rooms

const HUB_SIZE = 72;

/** Where the rooms of the hub may stand, as offsets from the middle of the entrance hall: the first ring hangs on the hall, the second on the nearest room of the first. */
const HUB_RING_1: readonly (readonly [number, number])[] = [[-11, -2], [11, -2], [-9, -11], [9, -11], [0, -12]];
const HUB_RING_2: readonly (readonly [number, number])[] = [[-22, -4], [22, -4], [-20, -15], [20, -15], [-9, -22], [9, -22], [0, -23], [-22, 8], [22, 8]];

/** The wall between two rooms, in cells: the larger of the gaps along the two axes (0 when they touch). */
const wallGap = (a: Rect, b: Rect): number => Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));

/**
 * A hall at the entrance (5 x 4), ways to different rooms, each way shut by a door at its beginning and at its end (the rules set them on every mouth).
 * 8 to 15 rooms in two rings round the hall, close together: the ways are short and the rooms of the second ring hang on those of the first.
 */
function hub(rng: Rng, ctx: BuildContext): InteriorMap {
  const b = new Builder(HUB_SIZE, HUB_SIZE);
  const quest = ctx.dungeon?.quest;
  const mid = HUB_SIZE >> 1;
  const base = { x: mid, y: 60 };
  const first: Rect = quest === "quest_1" ? entranceRect(rng, ctx, base.x, base.y) : { x: base.x - 2, y: base.y - 2, w: 5, h: 4 };
  const target = rng.range(8, 15);
  const centre = (r: Rect) => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) });
  const rects: Rect[] = [first];
  /** The links of the star, as pairs of indices into `rects`. */
  const links: [number, number][] = [];
  const free = (r: Rect) => inBounds(r, 3, HUB_SIZE) && !rects.some((o) => rectsOverlap(r, o, 2));
  // the hall of quest 2 takes the way straight ahead; the rooms beside it would touch it, so it has fewer neighbours in the first ring
  let hall: Rect | undefined;
  const first1: (readonly [number, number])[] = quest === "quest_2" ? [[0, -12], ...rng.shuffle<readonly [number, number]>([[-11, -2], [11, -2]])] : rng.shuffle([...HUB_RING_1]).slice(0, rng.range(4, 5));
  const ring1: number[] = [0];
  const distance = (a: Rect, b: Rect) => Math.abs(centre(a).x - centre(b).x) + Math.abs(centre(a).y - centre(b).y);
  /** The room of the ring before it that is nearest to `r` (the hall for the first ring). */
  const parentOf = (r: Rect, from: number[]) => from.reduce((best, o) => (distance(rects[o]!, r) < distance(rects[best]!, r) ? o : best), from[0]!);
  /** Puts a room near the offset from the hall, shifted off it as far as the room it hangs on allows (a way of at most 6 cells of wall). Returns its index or -1. */
  const place = (offset: readonly [number, number], room: (x: number, y: number) => Rect, from: number[]): number => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const shift = attempt < 6 ? 2 : 0;
      const r = room(base.x + offset[0] + rng.range(-shift, shift), base.y + offset[1] + rng.range(-shift, shift));
      if (free(r) && wallGap(r, rects[parentOf(r, from)]!) <= 6) {
        rects.push(r);
        return rects.length - 1;
      }
    }
    return -1;
  };
  const hallRing = [0];
  first1.forEach((offset, i) => {
    const at = place(offset, (x, y) => (i === 0 && quest === "quest_2" ? (hallRect(ctx, x, y) ?? roomAround(rng, x, y)) : roomAround(rng, x, y)), hallRing);
    if (at < 0) return;
    if (i === 0 && quest === "quest_2") hall = rects[at];
    ring1.push(at);
    links.push([0, at]);
  });
  for (const offset of rng.shuffle([...HUB_RING_2])) {
    if (rects.length >= target) break;
    const from = ring1.slice(1);
    if (from.length === 0) break;
    const at = place(offset, (x, y) => roomAround(rng, x, y), from);
    if (at < 0) continue;
    links.push([parentOf(rects[at]!, from), at]);
  }
  const rooms = rects.map((r) => [r]);
  for (const r of rects) b.carveRoom([r]);
  for (const [from, to] of links) joinRooms(b, rng, rects[from]!, rects[to]!);
  carveSpurs(b, rng, rng.range(2, 4), 2, 4);
  return finishDungeon(rng, ctx, { b, rooms, ...(hall ? { hall, endNear: hall } : {}) });
}

// ---------------------------------------------------------------- dungeon_3: the maze

/**
 * A maze of corridors one cell wide between walls one cell wide, with a few small rooms (3 x 3 to 4 x 4). Runes stand in the place of some walls
 * that were taken out to make loops: they throw the party to another place, but the maze is whole without them, so every part is reachable. There
 * are no doors or gates.
 */
function maze(rng: Rng, ctx: BuildContext): InteriorMap {
  const b = new Builder(SIZE, SIZE);
  const N = 29; // logical cells across and down; the map region is 2N + 1
  const R = 2 * N + 1;
  const ox = (SIZE - R) >> 1;
  const oy = (SIZE - R) >> 1;
  const visited = new Uint8Array(N * N);
  const stack: number[] = [rng.int(N * N)];
  visited[stack[0]!] = 1;
  const carve = (cx: number, cy: number) => b.set(ox + 2 * cx + 1, oy + 2 * cy + 1, CELL.FLOOR);
  carve(stack[0]! % N, Math.floor(stack[0]! / N));
  while (stack.length > 0) {
    const cur = stack[stack.length - 1]!;
    const cx = cur % N;
    const cy = (cur - cx) / N;
    const opts = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).filter(([dx, dy]) => cx + dx >= 0 && cy + dy >= 0 && cx + dx < N && cy + dy < N && !visited[(cy + dy) * N + cx + dx]);
    if (opts.length === 0) {
      stack.pop();
      continue;
    }
    const [dx, dy] = opts[rng.int(opts.length)]!;
    visited[(cy + dy) * N + cx + dx] = 1;
    b.set(ox + 2 * cx + 1 + dx, oy + 2 * cy + 1 + dy, CELL.FLOOR);
    carve(cx + dx, cy + dy);
    stack.push((cy + dy) * N + cx + dx);
  }
  shortenMazeStraights(b, ox, oy, R);
  // the rooms: the entrance at the bottom, the hall of quest 2 at the top, a few small ones between; each lies on the cells of the maze
  const quest = ctx.dungeon?.quest;
  const entrance = entranceRect(rng, ctx, ox + (R >> 1), oy + R - 8);
  const rooms: Rect[][] = [[entrance]];
  let hall: Rect | undefined;
  const hallR = quest === "quest_2" ? hallRect(ctx, ox + (R >> 1), oy + 8) : undefined;
  if (hallR) {
    rooms.push([hallR]);
    hall = hallR;
  }
  for (let tries = 0; tries < 200 && rooms.length < (hallR ? 7 : 6); tries++) {
    const w = rng.range(3, 4);
    const h = rng.range(3, 4);
    const room: Rect = { x: ox + 2 * rng.int(N - 2) + 1, y: oy + 2 * rng.int(N - 2) + 1, w, h };
    if (room.x + w >= ox + R - 1 || room.y + h >= oy + R - 1) continue;
    if (rooms.some((o) => rectsOverlap(room, o[0]!, 2))) continue;
    rooms.push([room]);
  }
  // the rooms clear the walls inside them; the entrance and the hall are bigger than the maze cells they replace
  for (const r of rooms) b.carveRoom(r);
  // loops: take out some walls between two corridors; the rune barriers stand on a few of them (never within the entrance room's reach)
  const barriers: { x: number; y: number }[] = [];
  const spawnZone = (x: number, y: number) => Math.abs(x - (entrance.x + (entrance.w >> 1))) + Math.abs(y - (entrance.y + entrance.h)) < 14;
  const candidates: { x: number; y: number }[] = [];
  /** The straight the wall cell would belong to once it is open: the corridor cells on both sides of it along the way it opens. */
  const joinedStraight = (x: number, y: number): number => straightThrough(b, x, y, b.isFloor(x - 1, y));
  for (let y = oy + 1; y < oy + R - 1; y++) {
    for (let x = ox + 1; x < ox + R - 1; x++) {
      if (b.get(x, y) !== CELL.SOLID) continue;
      const straight = (b.isFloor(x - 1, y) && b.isFloor(x + 1, y) && !b.isFloor(x, y - 1) && !b.isFloor(x, y + 1)) || (b.isFloor(x, y - 1) && b.isFloor(x, y + 1) && !b.isFloor(x - 1, y) && !b.isFloor(x + 1, y));
      // an even-even cell is a post between four walls; only the cells between two corridors count, and not where the opening would join two straights into a long one
      if (straight && (x - ox) % 2 !== (y - oy) % 2 && joinedStraight(x, y) <= MAX_STRAIGHT) candidates.push({ x, y });
    }
  }
  const picked = rng.shuffle(candidates).slice(0, Math.floor(candidates.length / 9));
  picked.forEach((c, i) => {
    // two openings on one line may have joined their straights since the candidates were counted
    if (joinedStraight(c.x, c.y) > MAX_STRAIGHT) return;
    b.set(c.x, c.y, CELL.FLOOR);
    // a third of the opened walls become rune barriers, at most eight, none near the entrance; rune cells stay single (no two side by side)
    if (i % 3 === 0 && barriers.length < 8 && !spawnZone(c.x, c.y) && !barriers.some((q) => Math.abs(q.x - c.x) + Math.abs(q.y - c.y) < 4)) barriers.push(c);
  });
  return finishDungeon(rng, ctx, { b, rooms, ...(hall ? { hall, endNear: hall } : {}), barriers });
}

// ---------------------------------------------------------------- dungeon_4: the classic dungeon

/**
 * Room-and-corridor dungeon: 15-25 rooms of 3-7 cells (some L-shaped), joined by a Prim spanning tree plus
 * extra loops with L-shaped corridors, and a few small closets (a 2 x 2 room or a cross) with big treasure. Same idea as the old
 * seed_generation.py, but driven by one Rng stream and with the quest, tier and pillars as parameters instead of hardcoded block ids.
 */
function classic(rng: Rng, ctx: BuildContext): InteriorMap {
  const b = new Builder(SIZE, SIZE);
  const quest = ctx.dungeon?.quest;
  const target = rng.range(15, 20 + Math.min(ctx.tier, 5));
  const placed: Rect[][] = [];

  const first = entranceRect(rng, ctx, SIZE / 2, SIZE / 2);
  placed.push([first]);

  // a quest that needs a hall of its own gets it before any other room, next to the first
  const hall: Rect | undefined = quest === "quest_2" ? { x: SIZE / 2 + 14, y: SIZE / 2 - 7, w: 11, h: 7 } : undefined;
  if (hall) placed.push([hall]);

  for (let attempt = 0; attempt < 900 && placed.length < target; attempt++) {
    const base = rng.pick(placed)[0]!;
    const bcx = base.x + Math.floor(base.w / 2);
    const bcy = base.y + Math.floor(base.h / 2);
    const dx = rng.range(-14, 14);
    const dy = rng.range(-14, 14);
    if (Math.abs(dx) + Math.abs(dy) < 8) continue;
    const w = rng.range(3, 7);
    const h = rng.range(3, 7);
    const main: Rect = { x: bcx + dx - Math.floor(w / 2), y: bcy + dy - Math.floor(h / 2), w, h };
    const rects: Rect[] = [main];
    if (rng.chance(550)) {
      // L-shaped room: attach a second rectangle on one side
      const aw = rng.range(2, 4);
      const ah = rng.range(2, 4);
      const side = rng.int(4);
      const annex: Rect =
        side === 0
          ? { x: main.x + rng.int(Math.max(1, w - aw + 1)), y: main.y - ah, w: aw, h: ah }
          : side === 1
            ? { x: main.x + w, y: main.y + rng.int(Math.max(1, h - ah + 1)), w: aw, h: ah }
            : side === 2
              ? { x: main.x + rng.int(Math.max(1, w - aw + 1)), y: main.y + h, w: aw, h: ah }
              : { x: main.x - aw, y: main.y + rng.int(Math.max(1, h - ah + 1)), w: aw, h: ah };
      rects.push(annex);
    }
    if (!rects.every((r) => inBounds(r))) continue;
    if (placed.some((other) => other.some((o) => rects.some((r) => rectsOverlap(r, o, 2))))) continue;
    placed.push(rects);
  }

  // closets: a 2 x 2 room or a cross (3 wide plus one cell above and below) that holds a big treasure, off the beaten path
  for (let tries = 0, made = 0; tries < 200 && made < rng.range(1, 2); tries++) {
    const cross = rng.chance(500);
    const rects: Rect[] = cross ? [{ x: 0, y: 1, w: 3, h: 1 }, { x: 1, y: 0, w: 1, h: 3 }] : [{ x: 0, y: 0, w: 2, h: 2 }];
    const at = { x: rng.range(6, SIZE - 12), y: rng.range(6, SIZE - 12) };
    const shifted = rects.map((r) => ({ ...r, x: r.x + at.x, y: r.y + at.y }));
    if (placed.some((other) => other.some((o) => shifted.some((r) => rectsOverlap(r, o, 4))))) continue;
    placed.push(shifted);
    made++;
  }

  for (const rects of placed) b.carveRoom(rects);

  const centres = placed.map((rects) => ({ x: rects[0]!.x + Math.floor(rects[0]!.w / 2), y: rects[0]!.y + Math.floor(rects[0]!.h / 2) }));
  const edges = primEdges(centres);
  const loops = extraEdges(centres, edges, rng, Math.floor(centres.length / 3));
  for (const [i, j] of [...edges, ...loops]) {
    b.carveL(centres[i]!.x, centres[i]!.y, centres[j]!.x, centres[j]!.y, rng.chance(500));
  }

  carveSpurs(b, rng, rng.range(3, 6));
  return finishDungeon(rng, ctx, { b, rooms: placed, ...(hall ? { hall, endNear: hall } : {}) });
}

/** The longest straight stretch of corridor a dungeon keeps (the user's rule: nobody looks down a tube of more than eight cells). */
export const MAX_STRAIGHT = 8;

interface Stretch {
  /** True along a row (x runs), false along a column. */
  row: boolean;
  /** The row (or column) the stretch lies on. */
  line: number;
  from: number;
  to: number;
}

/** The straight stretches of corridor cells (floor outside every room) longer than `max` on one row or column, between `from` and `to`. */
function stretchesOnLine(b: Builder, row: boolean, line: number, from: number, to: number, max: number): Stretch[] {
  const out: Stretch[] = [];
  let start = from;
  for (let i = from; i <= to + 1; i++) {
    if (i <= to) {
      const [x, y] = row ? [i, line] : [line, i];
      if (b.isFloor(x, y) && b.roomOf[b.idx(x, y)]! < 0) continue;
    }
    if (i - start > max) out.push({ row, line, from: start, to: i - 1 });
    start = i + 1;
  }
  return out;
}

/**
 * Cuts every straight stretch of corridor longer than `max` with the way `cut` finds (it returns whether it made one). Stretches that are
 * found by one sweep over the map are worked off one by one, the pieces a cut leaves are looked at again, and a last sweep catches what
 * a cut made on its way (a bend that touched another corridor). A stretch where `cut` finds no way stays.
 */
function cutLongStretches(b: Builder, max: number, cut: (s: Stretch) => boolean): void {
  const failed = new Set<string>();
  for (let round = 0; round < 4; round++) {
    const work: Stretch[] = [];
    for (const row of [true, false]) for (let line = 0; line < (row ? b.height : b.width); line++) work.push(...stretchesOnLine(b, row, line, 0, (row ? b.width : b.height) - 1, max));
    if (work.length === 0) return;
    let progress = false;
    for (let steps = 0; work.length > 0 && steps < 2000; steps++) {
      const s = work.pop()!;
      // earlier cuts may have split it already
      for (const run of stretchesOnLine(b, s.row, s.line, s.from, s.to, max)) {
        const key = `${run.row}:${run.line}:${run.from}:${run.to}`;
        if (failed.has(key)) continue;
        if (!cut(run)) {
          failed.add(key);
          continue;
        }
        progress = true;
        work.push(...stretchesOnLine(b, run.row, run.line, run.from, run.to, max));
      }
    }
    if (!progress) return;
  }
}

/** The places along a stretch to cut it at, the best first: pieces of at most `max` cells on both sides if the stretch is short enough for that, else `max` cells from its start. */
function cutSpots(s: Stretch, max: number, allowed: (p: number) => boolean = () => true): number[] {
  const length = s.to - s.from + 1;
  const target = length <= 2 * max + 1 ? s.from + (length >> 1) : s.from + max;
  const spots: number[] = [];
  for (let p = s.from + 1; p < s.to; p++) if (allowed(p)) spots.push(p);
  return spots.sort((p, q) => Math.abs(p - target) - Math.abs(q - target) || p - q);
}

/**
 * Breaks up every straight stretch of corridor longer than `max` with a bend: one cell of the stretch is walled up and the corridor goes round it
 * through the rock beside it (three cells, a step to the side and back). The stretch is then two shorter ones and the party sees a wall at its end
 * instead of a tube. A bend needs solid rock on its side, so one that would touch another passage is only made where nothing else fits; a stretch
 * where none fits stays.
 */
function bendLongCorridors(b: Builder, max = MAX_STRAIGHT): void {
  cutLongStretches(b, max, (s) => {
    // along the stretch `u`, across it `v`: the same code serves rows and columns
    const rock = (u: number, v: number) => (s.row ? b.get(u, s.line + v) : b.get(s.line + v, u)) === CELL.SOLID;
    const put = (u: number, v: number, value: number) => (s.row ? b.set(u, s.line + v, value) : b.set(s.line + v, u, value));
    /** Corridor floor: what the stretch is made of. */
    const way = (u: number, v: number) => (s.row ? b.isFloor(u, s.line + v) && b.roomOf[b.idx(u, s.line + v)]! < 0 : b.isFloor(s.line + v, u) && b.roomOf[b.idx(s.line + v, u)]! < 0);
    const spots = cutSpots(s, max);
    // first with rock all round the bend, then also where it touches another passage (the stretch is cut either way)
    for (const strict of [true, false]) {
      for (const p of spots) {
        const first = (p + s.line) & 1 ? 1 : -1;
        for (const d of [first, -first]) {
          // two corridors side by side (two L's laid over each other) are one wide stretch: both are walled up, the bend goes round them on the free side
          for (const wide of [false, true]) {
            if (wide && !([-1, 0, 1].every((k) => way(p + k, -d)))) continue;
            // no passage leaves the stretch at the cell(s) that are walled up
            const clear = [-1, 0, 1].every((k) => rock(p + k, d)) && rock(p, wide ? -2 * d : -d) && (!strict || ([-2, 2].every((k) => rock(p + k, d)) && [-1, 0, 1].every((k) => rock(p + k, 2 * d))));
            if (!clear) continue;
            for (const k of [-1, 0, 1]) put(p + k, d, CELL.FLOOR);
            put(p, 0, CELL.SOLID);
            if (wide) put(p, -d, CELL.SOLID);
            return true;
          }
        }
      }
    }
    return false;
  });
}

/** The length of the straight that a cell would be on along a row or a column: itself and the corridor cells (floor outside every room) in a line on both sides. */
function straightThrough(b: Builder, x: number, y: number, row: boolean): number {
  let n = 1;
  for (const sign of [1, -1]) {
    for (let k = 1; ; k++) {
      const cx = row ? x + sign * k : x;
      const cy = row ? y : y + sign * k;
      if (!b.isFloor(cx, cy) || b.roomOf[b.idx(cx, cy)]! >= 0) break;
      n++;
    }
  }
  return n;
}

/**
 * Takes the long straights out of a fresh maze (a perfect one: a tree of cells). A connector in the middle of a straight is walled up, which cuts
 * the maze in two, and the nearest wall between the two halves that makes no long straight itself is opened instead: the maze stays whole and
 * has the same number of passages, only the line of sight ends at the new wall. A straight where no such wall exists stays.
 */
function shortenMazeStraights(b: Builder, ox: number, oy: number, size: number, max = MAX_STRAIGHT): void {
  /** A connector lies between two cells of the maze: one of its two coordinates is even (counted from the corner of the maze), the other odd. */
  const isConnector = (x: number, y: number) => ((x - ox) % 2 === 0) !== ((y - oy) % 2 === 0);
  cutLongStretches(b, max, (s) => {
    for (const p of cutSpots(s, max, (q) => (s.row ? isConnector(q, s.line) : isConnector(s.line, q))).slice(0, 4)) {
      const [cx, cy] = s.row ? [p, s.line] : [s.line, p];
      b.set(cx, cy, CELL.SOLID);
      // flood both sides of the cut at the same pace until one is whole: the smaller half costs the least, and the walls on its edge that have floor on the far side are the ways back
      const label = new Uint8Array(b.width * b.height);
      const sides = [s.row ? b.idx(cx - 1, cy) : b.idx(cx, cy - 1), s.row ? b.idx(cx + 1, cy) : b.idx(cx, cy + 1)].map((start, k) => {
        label[start] = k + 1;
        return { queue: [start], head: 0, edge: [] as { x: number; y: number; far: number }[] };
      });
      let small: (typeof sides)[number] | null = null;
      for (let turn = 0; !small; turn++) {
        const side = sides[turn & 1]!;
        if (side.head >= side.queue.length) {
          small = side;
          break;
        }
        const x = side.queue[side.head]! % b.width;
        const y = Math.floor(side.queue[side.head++]! / b.width);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const [nx, ny] = [x + dx, y + dy];
          if (b.isFloor(nx, ny)) {
            if (!label[b.idx(nx, ny)]) {
              label[b.idx(nx, ny)] = (turn & 1) + 1;
              side.queue.push(b.idx(nx, ny));
            }
          } else if (b.get(nx, ny) === CELL.SOLID && isConnector(nx, ny) && nx > ox && ny > oy && nx < ox + size - 1 && ny < oy + size - 1 && b.isFloor(nx + dx, ny + dy)) side.edge.push({ x: nx, y: ny, far: b.idx(nx + dx, ny + dy) });
        }
      }
      // the nearest wall on its edge that leads out of it (not the connector that was cut) and makes a short straight
      let best: { x: number; y: number; d: number } | null = null;
      for (const e of small.edge) {
        if (label[e.far] === label[small.queue[0]!] || (e.x === cx && e.y === cy)) continue;
        const d = Math.abs(e.x - cx) + Math.abs(e.y - cy);
        if ((!best || d < best.d) && straightThrough(b, e.x, e.y, (e.x - ox) % 2 === 0) <= max) best = { x: e.x, y: e.y, d };
      }
      if (best) {
        b.set(best.x, best.y, CELL.FLOOR);
        return true;
      }
      b.set(cx, cy, CELL.FLOOR);
    }
    return false;
  });
}

const SPUR_DIRS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Blind side passages off straight corridors. Each ends in a dead end, which the rules fill with treasure or lore,
 * so the dungeon rewards leaving the main route.
 */
function carveSpurs(b: Builder, rng: Rng, count: number, minLen = 3, maxLen = 6): void {
  let made = 0;
  for (let attempt = 0; attempt < 400 && made < count; attempt++) {
    const x = rng.range(4, b.width - 5);
    const y = rng.range(4, b.height - 5);
    const [dx, dy] = SPUR_DIRS[rng.int(4)]!;
    const px = dy; // perpendicular axis
    const py = dx;
    if (!b.isFloor(x, y) || b.roomOf[b.idx(x, y)]! >= 0) continue;
    // only off a straight corridor piece that runs across the spur direction
    if (!b.isFloor(x + px, y + py) || !b.isFloor(x - px, y - py) || b.isFloor(x + dx, y + dy) || b.isFloor(x - dx, y - dy)) continue;
    const len = rng.range(minLen, maxLen);
    let free = true;
    for (let k = 1; k <= len + 1 && free; k++) {
      const cx = x + dx * k;
      const cy = y + dy * k;
      if (cx < 2 || cy < 2 || cx > b.width - 3 || cy > b.height - 3) free = false;
      else if (b.get(cx, cy) !== CELL.SOLID) free = false;
      else if (k >= 2 && (b.get(cx + px, cy + py) !== CELL.SOLID || b.get(cx - px, cy - py) !== CELL.SOLID)) free = false;
    }
    if (!free) continue;
    for (let k = 1; k <= len; k++) b.carveCorridorCell(x + dx * k, y + dy * k);
    made++;
  }
}
