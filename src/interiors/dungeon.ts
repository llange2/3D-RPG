import type { Rng } from "../core/rng";
import { Builder, extraEdges, primEdges, rectsOverlap, type BuildContext, type Rect } from "./builder";
import { carveEndRoomFor } from "./endRoom";
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
  const endRoom = wantsRoom ? carveEndRoomFor(b, rng, spawn, quest === "quest_1" || quest === "quest_3", plan.endNear) : null;
  const entrance = quest === "quest_1" ? { hall: { ...r0 } } : hall ? { hall: { ...hall } } : {};
  const dungeon: DungeonRef | undefined = ctx.dungeon ? { ...ctx.dungeon, ...entrance, ...(endRoom ? { endRoom } : {}), ...(plan.barriers ? { barriers: plan.barriers } : {}) } : undefined;
  return b.finish("dungeon", { ...ctx, dungeon }, exit, spawn);
}

const inBounds = (r: Rect, m = 3) => r.x >= m && r.y >= m && r.x + r.w <= SIZE - m && r.y + r.h <= SIZE - m;

/** A random room of 5 to 7 cells (or 3 to 7 in the classic layout), centred on a point. */
function roomAround(rng: Rng, cx: number, cy: number, min = 5, max = 7): Rect {
  const w = rng.range(min, max);
  const h = rng.range(min, max);
  return { x: cx - (w >> 1), y: cy - (h >> 1), w, h };
}

// ---------------------------------------------------------------- dungeon_1: the tube

/** A long tube that leads from room to room along a snake over the map; small niches in its walls hold statues and decoration. */
function tube(rng: Rng, ctx: BuildContext): InteriorMap {
  const b = new Builder(SIZE, SIZE);
  const xs = [20, 48, 76];
  const ys = [76, 48, 20];
  const slots: { x: number; y: number }[] = [];
  ys.forEach((y, row) => (row % 2 === 0 ? xs : [...xs].reverse()).forEach((x) => slots.push({ x, y })));
  const count = rng.range(8, 9);
  const rooms: Rect[][] = [];
  slots.slice(0, count).forEach((s, i) => {
    const jitter = { x: s.x + rng.range(-4, 4), y: s.y + rng.range(-4, 4) };
    const hall = i === count - 1 ? hallRect(ctx, jitter.x, jitter.y) : undefined;
    rooms.push([i === 0 ? entranceRect(rng, ctx, 48, 80) : (hall ?? roomAround(rng, jitter.x, jitter.y))]);
  });
  const hall = rooms[count - 1]![0]!;
  const isHall = ctx.dungeon?.quest === "quest_2";
  for (const r of rooms) b.carveRoom(r);
  const centre = (r: Rect[]) => ({ x: r[0]!.x + (r[0]!.w >> 1), y: r[0]!.y + (r[0]!.h >> 1) });
  for (let i = 1; i < rooms.length; i++) b.carveL(centre(rooms[i - 1]!).x, centre(rooms[i - 1]!).y, centre(rooms[i]!).x, centre(rooms[i]!).y, rng.chance(500));
  carveSpurs(b, rng, rng.range(5, 8), 1, 2);
  return finishDungeon(rng, ctx, { b, rooms, ...(isHall ? { hall } : {}), endNear: hall });
}

// ---------------------------------------------------------------- dungeon_2: the hall with ways to rooms

/** A hall at the entrance (5 x 4), ways to different rooms, each way shut by a door at its beginning and at its end (the rules set them on every mouth). */
function hub(rng: Rng, ctx: BuildContext): InteriorMap {
  const b = new Builder(SIZE, SIZE);
  const quest = ctx.dungeon?.quest;
  const first: Rect = quest === "quest_1" ? entranceRect(rng, ctx, 48, 78) : { x: 46, y: 76, w: 5, h: 4 };
  const rooms: Rect[][] = [[first]];
  const spokes = rng.shuffle([
    { x: 16, y: 56 },
    { x: 80, y: 56 },
    { x: 24, y: 24 },
    { x: 72, y: 24 },
    { x: 48, y: 40 },
    { x: 48, y: 12 },
  ]).slice(0, rng.range(4, 5));
  let hall: Rect | undefined;
  spokes.forEach((s, i) => {
    const place = { x: s.x + rng.range(-3, 3), y: s.y + rng.range(-3, 3) };
    const room = i === 0 ? hallRect(ctx, place.x, place.y) ?? roomAround(rng, place.x, place.y) : roomAround(rng, place.x, place.y);
    if (i === 0 && quest === "quest_2") hall = room;
    rooms.push([room]);
  });
  // some of the rooms have a second one behind them, so that the ways are long
  const behind: Rect[][] = [];
  rooms.slice(1).forEach((r) => {
    if (!rng.chance(550)) return;
    const base = r[0]!;
    const dx = Math.sign(base.x + (base.w >> 1) - 48) * rng.range(10, 14);
    const dy = -rng.range(8, 12);
    const extra = roomAround(rng, base.x + (base.w >> 1) + dx, base.y + (base.h >> 1) + dy);
    if (inBounds(extra) && !rooms.some((o) => rectsOverlap(extra, o[0]!, 2)) && !behind.some((o) => rectsOverlap(extra, o[0]!, 2))) behind.push([extra]);
  });
  const all = rooms.filter((r) => inBounds(r[0]!)).concat(behind);
  for (const r of all) b.carveRoom(r);
  const centre = (r: Rect[]) => ({ x: r[0]!.x + (r[0]!.w >> 1), y: r[0]!.y + (r[0]!.h >> 1) });
  // every spoke runs from the hall; a room behind another hangs on that one
  const hubC = centre(all[0]!);
  rooms.slice(1).forEach((r) => {
    const c = centre(r);
    b.carveL(hubC.x, hubC.y, c.x, c.y, rng.chance(500));
  });
  behind.forEach((r) => {
    const c = centre(r);
    const nearest = rooms.slice(1).reduce((best, o) => (Math.abs(centre(o).x - c.x) + Math.abs(centre(o).y - c.y) < Math.abs(centre(best).x - c.x) + Math.abs(centre(best).y - c.y) ? o : best), rooms[1]!);
    b.carveL(centre(nearest).x, centre(nearest).y, c.x, c.y, rng.chance(500));
  });
  carveSpurs(b, rng, rng.range(2, 4), 3, 5);
  return finishDungeon(rng, ctx, { b, rooms: all, ...(hall ? { hall } : {}), ...(hall ? { endNear: hall } : {}) });
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
  for (let y = oy + 1; y < oy + R - 1; y++) {
    for (let x = ox + 1; x < ox + R - 1; x++) {
      if (b.get(x, y) !== CELL.SOLID) continue;
      const straight = (b.isFloor(x - 1, y) && b.isFloor(x + 1, y) && !b.isFloor(x, y - 1) && !b.isFloor(x, y + 1)) || (b.isFloor(x, y - 1) && b.isFloor(x, y + 1) && !b.isFloor(x - 1, y) && !b.isFloor(x + 1, y));
      // an even-even cell is a post between four walls; only the cells between two corridors count
      if (straight && (x - ox) % 2 !== (y - oy) % 2) candidates.push({ x, y });
    }
  }
  const picked = rng.shuffle(candidates).slice(0, Math.floor(candidates.length / 9));
  picked.forEach((c, i) => {
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
    const x = rng.range(4, SIZE - 5);
    const y = rng.range(4, SIZE - 5);
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
      if (cx < 2 || cy < 2 || cx > SIZE - 3 || cy > SIZE - 3) free = false;
      else if (b.get(cx, cy) !== CELL.SOLID) free = false;
      else if (k >= 2 && (b.get(cx + px, cy + py) !== CELL.SOLID || b.get(cx - px, cy - py) !== CELL.SOLID)) free = false;
    }
    if (!free) continue;
    for (let k = 1; k <= len; k++) b.carveCorridorCell(x + dx * k, y + dy * k);
    made++;
  }
}
