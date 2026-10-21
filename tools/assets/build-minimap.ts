/**
 * The symbols of the map (the old game's `tex_mm_*`, 38 small pictures) as ONE sheet, `public/assets/ui/minimap.webp`, plus the register
 * `minimap.json` that says where each symbol is and by what a neutral ground tile has to be multiplied to become meadow, desert, dirt, ...
 *
 * The old tiles for grass, desert, dirt, floor, snow, swamp, lava and cobblestone are one picture in eight colours, and the tiles with
 * mountains, trees and palms are the same pictures with a black drawing on them. So the sheet keeps one neutral ground tile and three
 * transparent drawings (mountains, trees, palms); the game paints them in any ground colour (`src/game/minimapIcons.ts`). The symbols (inn,
 * bank, door, ...) stay as they are: they carry their own floor colour.
 */
import { writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { OLD, OUT, ensureDir, upToDate } from "./lib";

const TEX = join(OLD, "textures");
/** Size of one symbol on the sheet; the map draws them at 6 to 40 pixels, so 48 is plenty and keeps the sheet small. */
const CELL = 48;
const COLUMNS = 6;

const src = (base: string): string => ["png", "jpg"].map((e) => join(TEX, `${base}.${e}`)).find((p) => statSync(p, { throwIfNoEntry: false }))!;

/** Symbols copied as they are, in sheet order. */
const SYMBOLS = ["wall", "floor", "water", "door", "door_open", "event", "info", "persona", "trap", "maptransfer", "inn", "training", "tavern", "smith", "temple", "bank", "guild", "unknown", "pos1", "pos2", "teleporter_city"];

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

export async function buildMinimap(): Promise<{ bytes: number }> {
  const out = join(OUT, "ui", "minimap.webp");
  const registerFile = join(OUT, "ui", "minimap.json");
  const sources = [...SYMBOLS.map((s) => src(`tex_mm_${s}`)), ...GROUNDS.map(([, f]) => src(f)), ...DRAWINGS.flatMap(([, a, b]) => [src(a), src(b)]), src("tex_mm_snow"), join(import.meta.filename)];
  if (upToDate(out, ...sources) && upToDate(registerFile, ...sources)) return { bytes: statSync(out).size + statSync(registerFile).size };
  ensureDir(out);

  // the sheet: neutral ground, three drawings, then the symbols
  const names = ["ground", "mountain", "trees", "palms", ...SYMBOLS];
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
  writeFileSync(registerFile, JSON.stringify({ version: 1, cell: CELL, width: sheetW, height: sheetH, icons, tints }, null, 1));
  return { bytes: info.size + statSync(registerFile).size };
}

if (process.argv[1]?.endsWith("build-minimap.ts")) {
  const r = await buildMinimap();
  console.log(`minimap sheet: ${(r.bytes / 1024).toFixed(1)} KB`);
}
