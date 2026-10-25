/**
 * The symbols of the map (the old game's `tex_mm_*`, 38 small pictures) as ONE sheet, `public/assets/ui/minimap.webp`, plus the register
 * `minimap.json` that says where each symbol is and by what a neutral ground tile has to be multiplied to become meadow, desert, dirt, ...
 *
 * The old tiles for grass, desert, dirt, floor, snow, swamp, lava and cobblestone are one picture in eight colours, and the tiles with
 * mountains, trees and palms are the same pictures with a black drawing on them. So the sheet keeps one neutral ground tile and three
 * transparent drawings (mountains, trees, palms); the game paints them in any ground colour (`src/game/minimapIcons.ts`). The symbols (inn,
 * bank, door, ...) stay as they are: they carry their own floor colour.
 *
 * The places (town, castle, dungeon or cave, pyramid), the question mark of events and the way out are painted tiles instead: one hand-made
 * picture (`tools/assets/sources/minimap/mm_tiles.png`) with the six symbols in five grounds, cut into 48 px tiles; meadow and swamp, which
 * the picture lacks, are made from its desert row (`placeTiles`).
 */
import { writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { OLD, OUT, ROOT, ensureDir, upToDate } from "./lib";

const TEX = join(OLD, "textures");
/** The painted tiles of the places (town, castle, ...) in five grounds: six symbols in a row, one row per ground. Hand-made, not from `old_code`. */
const PLACE_SHEET = join(ROOT, "tools", "assets", "sources", "minimap", "mm_tiles.png");
/** Size of one symbol on the sheet; the map draws them at 6 to 40 pixels, so 48 is plenty and keeps the sheet small. */
const CELL = 48;
const COLUMNS = 6;

const src = (base: string): string => ["png", "jpg"].map((e) => join(TEX, `${base}.${e}`)).find((p) => statSync(p, { throwIfNoEntry: false }))!;

/** Symbols copied as they are, in sheet order. */
const SYMBOLS = ["wall", "floor", "water", "door", "door_open", "info", "persona", "trap", "inn", "training", "tavern", "smith", "temple", "bank", "guild", "unknown", "pos1", "pos2", "teleporter_city"];

/** The six symbols of the painted sheet, left to right (the dungeon's is the cave's too), and its five grounds, top to bottom. */
const PLACE_KINDS = ["town", "castle", "dungeon", "pyramid", "event", "exit"] as const;
const SHEET_GROUNDS = ["desert", "dirt", "snow", "forest", "lava"] as const;
/**
 * Grounds the sheet lacks are made from a painted one: the colour of the desert tile (the plain one, no drawing on it) is multiplied
 * by `target / its mean`, so the grain of the paint stays. Meadow is the forest's green made lighter and fresher, swamp its green made
 * darker and muddier. Black (frame, symbol) stays black.
 */
const MADE_GROUNDS: Record<string, [number, number, number]> = { swamp: [84, 94, 40] };
/** The grounds of the sheet in the register, as the game names them (`PlaceGround` in `minimapIcons.ts`). */
const PLACE_GROUNDS = ["desert", "forest", "snow", "lava", "meadow", "swamp"] as const;
/**
 * Single tiles painted later to correct the colours of the sheet (the user's `tex_mm_<ground>_<symbol>.png`, 100 px, frame included). `grass`
 * is the meadow, which was the desert row tinted green and came out too dull; `town` is the ground inside towns, castles and dungeons, where
 * only the question mark and the way out are shown (`INTERIOR_GROUND`). The meadow has no way out (nothing draws one on the overworld), so
 * that tile is the interior's one moved to the meadow's colour.
 */
const PAINTED_DIR = join(ROOT, "tools", "assets", "sources", "minimap", "tiles");
const PAINTED: [string, string][] = [
  ["town:meadow", "tex_mm_grass_town"], ["castle:meadow", "tex_mm_grass_castle"], ["dungeon:meadow", "tex_mm_grass_dungeon"],
  ["pyramid:meadow", "tex_mm_grass_pyramid"], ["event:meadow", "tex_mm_grass_event"], ["event:town", "tex_mm_town_event"], ["exit:town", "tex_mm_town_exit"],
];
const paintedFile = (base: string): string => join(PAINTED_DIR, `${base}.png`);
/** The tiles that exist only on the interior ground. */
const INTERIOR_TILES = ["event:town", "exit:town"];

/** The tiles that are the neutral ground in another colour: `name` in the register, source file. */
const GROUNDS: [string, string][] = [
  ["grass", "tex_mm_grass"],
  ["desert", "tex_mm_desert"],
  ["dirt", "tex_mm_dirt"],
  ["floor", "tex_mm_floor"],
  ["lava", "tex_mm_lava"],
  ["swamp", "tex_mm_swamp"],
  ["cobble", "tex_mm_cobblestone"],
];

/** The tiles that carry a drawing on the neutral ground: the drawing is the part that differs from the plain tile of the same ground. */
const DRAWINGS: [string, string, string][] = [
  ["mountain", "tex_mm_snow_mountain", "tex_mm_snow"],
  ["trees", "tex_mm_snow_forest", "tex_mm_snow"],
  ["palms", "tex_mm_desert_palms", "tex_mm_desert"],
];

async function raw(file: string, size = CELL): Promise<{ data: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(file).ensureAlpha().resize(size, size, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

const luma = (d: Buffer, i: number): number => 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;

/** Mean colour of the middle of a tile (the border is the dark frame), per channel 0..255. */
function mean(d: Buffer, w: number, h: number): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.8); y++) {
    for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x++) {
      const i = (y * w + x) * 4;
      r += d[i]!;
      g += d[i + 1]!;
      b += d[i + 2]!;
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

/** Mean colour of the bright inner part of a painted tile: its ground, without the black of the symbol and the frame. */
function paintMean(d: Buffer): [number, number, number] {
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = Math.floor(CELL * 0.12); y < Math.floor(CELL * 0.88); y++) {
    for (let x = Math.floor(CELL * 0.12); x < Math.floor(CELL * 0.88); x++) {
      const i = (y * CELL + x) * 4;
      if (d[i + 3]! < 200 || luma(d, i) < 70) continue;
      for (let c = 0; c < 3; c++) sum[c]! += d[i + c]!;
      n++;
    }
  }
  return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
}

/**
 * The old water symbol (blue with light waves) turns into a restless pattern when eleven by eleven of them fill the small map. The frame stays, the
 * inside becomes two quiet blues that keep only a fifth of the waves' contrast (the same colours as the painted ground tiles of the water,
 * `build-flat-terrain.ts`).
 */
function calmWaterSymbol(rgba: Buffer): void {
  const dark = [58, 118, 184];
  const light = [100, 164, 216];
  const frame = Math.round(CELL * 0.07);
  for (let y = frame; y < CELL - frame; y++) {
    for (let x = frame; x < CELL - frame; x++) {
      const p = (y * CELL + x) * 4;
      if (rgba[p + 3]! < 128) continue;
      const wave = Math.max(0, Math.min(1, (luma(rgba, p) - 85) / 105));
      const t = 0.5 + (wave - 0.5) * 0.12;
      for (let c = 0; c < 3; c++) rgba[p + c] = Math.round(dark[c]! + (light[c]! - dark[c]!) * t);
    }
  }
}

/** Runs of consecutive indices whose count exceeds `min` (the specks between the painted tiles have a few solid pixels per row, the tiles a hundred). */
function runs(count: number[], min: number): [number, number][] {
  const out: [number, number][] = [];
  let from = -1;
  count.forEach((n, i) => {
    if (n > min && from < 0) from = i;
    if (n <= min && from >= 0) {
      out.push([from, i - 1]);
      from = -1;
    }
  });
  if (from >= 0) out.push([from, count.length - 1]);
  return out;
}

/**
 * The 36 tiles of the places as 48 x 48 pictures, keyed `<symbol>:<ground>`. The painted sheet has six symbols in five grounds on transparent
 * ground; the tiles differ by a few pixels in size and carry specks of stray paint around them, so each is cut by its own bounding box and
 * everything not joined to the tile is wiped. Meadow and swamp are made from the desert row (`MADE_GROUNDS`).
 */
async function placeTiles(): Promise<Map<string, Buffer>> {
  const { data, info } = await sharp(PLACE_SHEET).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const solid = (x: number, y: number): boolean => data[(y * W + x) * 4 + 3]! > 200;
  const colCount = new Array<number>(W).fill(0);
  const rowCount = new Array<number>(H).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!solid(x, y)) continue;
      colCount[x]!++;
      rowCount[y]!++;
    }
  }
  const colRuns = runs(colCount, 40);
  const rowRuns = runs(rowCount, 40);
  if (colRuns.length !== PLACE_KINDS.length || rowRuns.length !== SHEET_GROUNDS.length) throw new Error(`mm_tiles.png: expected ${PLACE_KINDS.length} x ${SHEET_GROUNDS.length} tiles, found ${colRuns.length} x ${rowRuns.length}`);

  const tiles = new Map<string, Buffer>();
  for (const [r, ground] of SHEET_GROUNDS.entries()) {
    for (const [c, kind] of PLACE_KINDS.entries()) {
      const [wx0, wx1] = colRuns[c]!;
      const [wy0, wy1] = rowRuns[r]!;
      // the window is the widest tile of its column and row: this tile's own box is found inside it
      const cc = new Array<number>(wx1 + 1).fill(0);
      const rc = new Array<number>(wy1 + 1).fill(0);
      for (let y = wy0; y <= wy1; y++) {
        for (let x = wx0; x <= wx1; x++) {
          if (!solid(x, y)) continue;
          cc[x]!++;
          rc[y]!++;
        }
      }
      const bx = runs(cc, 20);
      const by = runs(rc, 20);
      const x0 = bx[0]![0];
      const x1 = bx[bx.length - 1]![1];
      const y0 = by[0]![0];
      const y1 = by[by.length - 1]![1];
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      const crop = Buffer.alloc(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) crop[(y * w + x) * 4 + k] = data[((y0 + y) * W + x0 + x) * 4 + k]!;
      // flood from the middle over the opaque pixels: that is the tile; its soft edge (2 pixels) stays, the specks go
      const inside = new Uint8Array(w * h);
      const stack = [Math.floor(h / 2) * w + Math.floor(w / 2)];
      while (stack.length) {
        const p = stack.pop()!;
        if (inside[p] || crop[p * 4 + 3]! <= 128) continue;
        inside[p] = 1;
        const x = p % w;
        const y = (p - x) / w;
        if (x > 0) stack.push(p - 1);
        if (x < w - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - w);
        if (y < h - 1) stack.push(p + w);
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let near = false;
          for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) near = !!inside[(y + dy) * w + x + dx] && y + dy >= 0 && y + dy < h && x + dx >= 0 && x + dx < w;
          if (!near) crop[(y * w + x) * 4 + 3] = 0;
        }
      }
      const { data: small } = await sharp(crop, { raw: { width: w, height: h, channels: 4 } }).resize(CELL, CELL, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
      tiles.set(`${kind}:${ground}`, small);
    }
  }

  // the swamp: the plain desert tiles with the colour of the ground moved to the wanted one
  const sand = tiles.get("event:desert")!;
  const base = paintMean(sand);
  for (const [ground, target] of Object.entries(MADE_GROUNDS)) {
    const factor = target.map((t, c) => t / base[c]!);
    for (const kind of PLACE_KINDS) {
      const made = Buffer.from(tiles.get(`${kind}:desert`)!);
      for (let p = 0; p < made.length; p += 4) for (let c = 0; c < 3; c++) made[p + c] = Math.min(255, Math.round(made[p + c]! * factor[c]!));
      tiles.set(`${kind}:${ground}`, made);
    }
  }

  // the painted corrections replace what was made; the meadow's way out follows the interior's by the colour the question marks differ by
  for (const [name, file] of PAINTED) tiles.set(name, (await raw(paintedFile(file))).data);
  const from = paintMean(tiles.get("event:town")!);
  const to = paintMean(tiles.get("event:meadow")!);
  const exit = Buffer.from(tiles.get("exit:town")!);
  for (let p = 0; p < exit.length; p += 4) for (let c = 0; c < 3; c++) exit[p + c] = Math.min(255, Math.round(exit[p + c]! * (to[c]! / from[c]!)));
  tiles.set("exit:meadow", exit);
  return tiles;
}

export async function buildMinimap(): Promise<{ bytes: number }> {
  const out = join(OUT, "ui", "minimap.webp");
  const registerFile = join(OUT, "ui", "minimap.json");
  const sources = [...SYMBOLS.map((s) => src(`tex_mm_${s}`)), ...GROUNDS.map(([, f]) => src(f)), ...DRAWINGS.flatMap(([, a, b]) => [src(a), src(b)]), src("tex_mm_snow"), PLACE_SHEET, ...PAINTED.map(([, f]) => paintedFile(f)), join(import.meta.filename)];
  if (upToDate(out, ...sources) && upToDate(registerFile, ...sources)) return { bytes: statSync(out).size + statSync(registerFile).size };
  ensureDir(out);

  // the sheet: neutral ground, three drawings, then the symbols
  const places = [...PLACE_GROUNDS.flatMap((ground) => PLACE_KINDS.map((kind) => `${kind}:${ground}`)), ...INTERIOR_TILES];
  const names = ["ground", "mountain", "trees", "palms", ...SYMBOLS, ...places];
  const sheetW = COLUMNS * CELL;
  const sheetH = Math.ceil(names.length / COLUMNS) * CELL;
  const sheet = Buffer.alloc(sheetW * sheetH * 4);
  const put = (index: number, d: Buffer, w: number, h: number): void => {
    const ox = (index % COLUMNS) * CELL;
    const oy = Math.floor(index / COLUMNS) * CELL;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) sheet[((oy + y) * sheetW + ox + x) * 4 + c] = d[(y * w + x) * 4 + c]!;
  };

  const snow = await raw(src("tex_mm_snow"));
  put(0, snow.data, snow.w, snow.h);
  const snowMean = mean(snow.data, snow.w, snow.h);

  // drawings: where the tile with the drawing is darker than the plain tile, that is the drawing; its colour is kept, its opacity follows the difference
  for (const [i, [, drawn, plain]] of DRAWINGS.entries()) {
    const a = await raw(src(drawn));
    const b = await raw(src(plain));
    const d = Buffer.alloc(a.data.length);
    for (let p = 0; p < a.data.length; p += 4) {
      const diff = luma(b.data, p) - luma(a.data, p);
      const alpha = Math.max(0, Math.min(1, (diff - 25) / 70));
      d[p] = a.data[p]!;
      d[p + 1] = a.data[p + 1]!;
      d[p + 2] = a.data[p + 2]!;
      d[p + 3] = Math.round(alpha * 255);
    }
    put(1 + i, d, a.w, a.h);
  }

  for (const [i, name] of SYMBOLS.entries()) {
    // the two marks of the party and of monsters are drawn on transparent ground at their own proportions
    const img = sharp(src(`tex_mm_${name}`)).ensureAlpha().resize(CELL, CELL, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" });
    const { data } = await img.raw().toBuffer({ resolveWithObject: true });
    if (name === "water") calmWaterSymbol(data);
    put(4 + i, data, CELL, CELL);
  }

  const tiles = await placeTiles();
  for (const [i, name] of places.entries()) put(4 + SYMBOLS.length + i, tiles.get(name)!, CELL, CELL);

  // what each ground colour needs: the tile's mean colour over the neutral tile's
  const tints: Record<string, [number, number, number]> = { snow: [1, 1, 1] };
  for (const [name, file] of GROUNDS) {
    const t = await raw(src(file));
    const m = mean(t.data, t.w, t.h);
    tints[name] = [0, 1, 2].map((c) => Math.round((m[c]! / snowMean[c]!) * 1000) / 1000) as [number, number, number];
  }

  const info = await sharp(sheet, { raw: { width: sheetW, height: sheetH, channels: 4 } }).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(out);
  const icons: Record<string, { x: number; y: number }> = {};
  names.forEach((n, i) => (icons[n] = { x: (i % COLUMNS) * CELL, y: Math.floor(i / COLUMNS) * CELL }));
  writeFileSync(registerFile, JSON.stringify({ version: 2, cell: CELL, width: sheetW, height: sheetH, icons, tints }, null, 1));
  return { bytes: info.size + statSync(registerFile).size };
}

if (process.argv[1]?.endsWith("build-minimap.ts")) {
  const r = await buildMinimap();
  console.log(`minimap sheet: ${(r.bytes / 1024).toFixed(1)} KB`);
}
