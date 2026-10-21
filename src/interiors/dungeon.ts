import type { Rng } from "../core/rng";
import { HALL_QUESTS, HALL_SIZE, THEMES_BY_ID } from "../data/dungeon-themes";
import { Builder, extraEdges, primEdges, rectsOverlap, type BuildContext, type Rect } from "./builder";
import { GLYPH_DIGITS, glyphCells, glyphWidth } from "./glyphs";
import { CELL, type DungeonRef, type InteriorMap } from "./types";

const SIZE = 96;

/**
 * Room-and-corridor dungeon: 15-25 rooms of 3-7 cells (some L-shaped), joined by a Prim spanning tree plus
 * extra loops with L-shaped corridors. Same idea as the old seed_generation.py, but driven by one Rng stream
 * and with theme, tier and pillars as parameters instead of hardcoded block ids.
 */
export function generateDungeon(rng: Rng, ctx: BuildContext): InteriorMap {
  const b = new Builder(SIZE, SIZE);
  const target = rng.range(15, 20 + Math.min(ctx.tier, 5));
  const placed: Rect[][] = [];

  const first: Rect = { x: SIZE / 2 - 3, y: SIZE / 2 - 3, w: rng.range(5, 7), h: rng.range(5, 7) };
  placed.push([first]);

  // a quest that needs a hall (the picture, the field of runes, the ring of heads) gets it before any other room, next to the first
  const quest = ctx.dungeon ? THEMES_BY_ID[ctx.dungeon.id]?.quest : undefined;
  const hall: Rect | undefined = quest && HALL_QUESTS.includes(quest) ? { x: SIZE / 2 + 14, y: SIZE / 2 - 7, ...HALL_SIZE } : undefined;
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
    const inBounds = rects.every((r) => r.x >= 3 && r.y >= 3 && r.x + r.w <= SIZE - 3 && r.y + r.h <= SIZE - 3);
    if (!inBounds) continue;
    if (placed.some((other) => other.some((o) => rects.some((r) => rectsOverlap(r, o, 2))))) continue;
    placed.push(rects);
  }

  for (const rects of placed) b.carveRoom(rects);

  const centres = placed.map((rects) => ({ x: rects[0]!.x + Math.floor(rects[0]!.w / 2), y: rects[0]!.y + Math.floor(rects[0]!.h / 2) }));
  const edges = primEdges(centres);
  const loops = extraEdges(centres, edges, rng, Math.floor(centres.length / 3));
  for (const [i, j] of [...edges, ...loops]) {
    b.carveL(centres[i]!.x, centres[i]!.y, centres[j]!.x, centres[j]!.y, rng.chance(500));
  }

  carveSpurs(b, rng, rng.range(3, 6));

  // pillars in large rooms, kept away from the centre row and column where corridors leave
  placed.forEach((rects, id) => {
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

  // the picture riddle: two digits drawn as islands of wall inside the hall, with a free ring of floor around them and a free gap between them
  let glyph: string | undefined;
  if (hall && quest === "map_picture") {
    glyph = GLYPH_DIGITS[rng.int(GLYPH_DIGITS.length)]! + GLYPH_DIGITS[rng.int(GLYPH_DIGITS.length)]!;
    const x0 = hall.x + Math.floor((hall.w - glyphWidth(glyph)) / 2);
    const y0 = hall.y + Math.floor((hall.h - 5) / 2);
    for (const [dx, dy] of glyphCells(glyph)) {
      b.set(x0 + dx, y0 + dy, CELL.SOLID);
      b.roomOf[b.idx(x0 + dx, y0 + dy)] = -1;
    }
  }

  const r0 = placed[0]![0]!;
  const { exit, spawn } = b.pickExit(r0.x + Math.floor(r0.w / 2), r0.y + r0.h - 1, (x, y) => b.roomOf[b.idx(x, y)] === 0 && b.isFloor(x - 1, y) && b.isFloor(x + 1, y));
  const dungeon: DungeonRef | undefined = ctx.dungeon && hall ? { ...ctx.dungeon, hall: { ...hall }, ...(glyph ? { glyph } : {}) } : ctx.dungeon;
  return b.finish("dungeon", { ...ctx, dungeon }, exit, spawn);
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
function carveSpurs(b: Builder, rng: Rng, count: number): void {
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
    const len = rng.range(3, 6);
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
