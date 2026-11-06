/**
 * The spell pictures (`mm3_spell_<id>.png`, 459 x 214 each, about 190 KB) become ONE sheet, `ui/spells.webp`, with a register,
 * `ui/spells.json`: the spell window shows up to 36 of them at once, and 78 small files meant 78 requests and 78 decodes at the moment
 * the window opened. One sheet is fetched and decoded once, before the first spell is cast (`ui/spellIcons.ts`).
 *
 * 36 of the 78 files are the same placeholder (the hand with the fireball) for spells that had no picture yet; they share one cell.
 * Cells are found by their pixels, so the day the user draws a picture for one of them, it gets a cell of its own without a change here.
 */
import { createHash } from "node:crypto";
import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { OLD, OUT, ensureDir, upToDate } from "./lib";

const TEX = join(OLD, "textures");
const SPELLS = 78;
/** One cell, in pixels: the plate is 2.14 times as wide as high and shows at 112 x 52 CSS pixels at most. */
const CELL = { w: 128, h: 60 };
const COLUMNS = 8;

export interface SpellSheet {
  cell: { w: number; h: number };
  columns: number;
  /** Cells in the sheet, left to right, top to bottom. */
  cells: number;
  /** Cell of each spell id. */
  cellOf: Record<string, number>;
  /** Ids whose picture is the shared placeholder: the window names them, since the picture does not. */
  placeholder: number[];
}

/** Where the picture lies inside a cell: the plate's dark red rim stays as it is, only the paper inside is looked at and tinted. */
const INSET = { x: 12, y: 8 };
/** A picture whose darkest ink is less saturated than this reads as grey on the cream plate (the sepia ones are 0.5 to 0.8). */
const GRAY_INK_SATURATION = 0.46;
/** The sepia of the pictures that were drawn in brown. */
const BROWN: [number, number, number] = [150, 100, 52];

const lumOf = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Some of the pictures are drawn in a grey ink and stand out between the brown ones (6. 11. 2026). Their ink is brought to the brown of the others: every pixel
 * keeps how dark it is (its share of the way from the paper to the darkest ink), and the colour of that way runs from the paper's cream to the brown. The plate itself
 * (its rim, its cream) stays as it is; a picture that is brown already is returned untouched.
 */
export function warmGrayIcon(data: Buffer, width: number, height: number): Buffer {
  const inside = (x: number, y: number): boolean => x >= INSET.x && x < width - INSET.x && y >= INSET.y && y < height - INSET.y;
  const at = (x: number, y: number): number => (y * width + x) * 4;
  const lums: number[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (inside(x, y)) lums.push(lumOf(data[at(x, y)]!, data[at(x, y) + 1]!, data[at(x, y) + 2]!));
  const order = [...lums].sort((a, b) => a - b);
  const darkLimit = order[Math.max(20, Math.floor(order.length * 0.04))]!;
  const paperLimit = order[Math.floor(order.length * 0.7)]!;
  const dark = [0, 0, 0];
  const paper = [0, 0, 0];
  let nDark = 0;
  let nPaper = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      const i = at(x, y);
      const l = lumOf(data[i]!, data[i + 1]!, data[i + 2]!);
      if (l <= darkLimit) {
        for (let c = 0; c < 3; c++) dark[c]! += data[i + c]!;
        nDark++;
      } else if (l >= paperLimit) {
        for (let c = 0; c < 3; c++) paper[c]! += data[i + c]!;
        nPaper++;
      }
    }
  }
  if (nDark === 0 || nPaper === 0) return data;
  const ink = dark.map((v) => v / nDark);
  const cream = paper.map((v) => v / nPaper);
  const peak = Math.max(...ink);
  if (peak <= 0 || (peak - Math.min(...ink)) / peak >= GRAY_INK_SATURATION) return data;
  const inkLum = lumOf(ink[0]!, ink[1]!, ink[2]!);
  const creamLum = lumOf(cream[0]!, cream[1]!, cream[2]!);
  if (creamLum - inkLum < 20) return data;
  // the brown, as dark as the picture's own darkest ink
  const scale = inkLum / lumOf(...BROWN);
  const target = BROWN.map((v) => Math.min(255, v * scale));
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      const i = at(x, y);
      const share = Math.min(1, Math.max(0, (creamLum - lumOf(data[i]!, data[i + 1]!, data[i + 2]!)) / (creamLum - inkLum)));
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(cream[c]! + (target[c]! - cream[c]!) * share);
    }
  }
  return out;
}

export async function buildSpellIcons(): Promise<{ files: number; bytes: number }> {
  const sheetOut = join(OUT, "ui", "spells.webp");
  const registerOut = join(OUT, "ui", "spells.json");
  const sources = Array.from({ length: SPELLS }, (_, i) => join(TEX, `mm3_spell_${i + 1}.png`));
  if (upToDate(sheetOut, ...sources, import.meta.filename) && upToDate(registerOut, ...sources, import.meta.filename)) return { files: 2, bytes: statSync(sheetOut).size + statSync(registerOut).size };

  const cells: Buffer[] = [];
  const byHash = new Map<string, number>();
  const cellOf: Record<string, number> = {};
  const uses = new Map<number, number>();
  for (let id = 1; id <= SPELLS; id++) {
    const resized = await sharp(sources[id - 1]!, { failOn: "none" }).resize(CELL.w, CELL.h, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // the pictures drawn in a grey ink get the brown of the others (the plate itself is untouched)
    const data = warmGrayIcon(resized.data, CELL.w, CELL.h);
    const hash = createHash("sha1").update(data).digest("hex");
    let cell = byHash.get(hash);
    if (cell === undefined) {
      cell = cells.length;
      byHash.set(hash, cell);
      cells.push(data);
    }
    cellOf[String(id)] = cell;
    uses.set(cell, (uses.get(cell) ?? 0) + 1);
  }
  // the placeholder is the picture that more than a few spells share
  const shared = [...uses].filter(([, n]) => n > 3).map(([cell]) => cell);
  const placeholder = Object.entries(cellOf).filter(([, cell]) => shared.includes(cell)).map(([id]) => Number(id));

  const rows = Math.ceil(cells.length / COLUMNS);
  const composite = cells.map((data, i) => ({
    input: data,
    raw: { width: CELL.w, height: CELL.h, channels: 4 as const },
    left: (i % COLUMNS) * CELL.w,
    top: Math.floor(i / COLUMNS) * CELL.h,
  }));
  ensureDir(sheetOut);
  const info = await sharp({ create: { width: COLUMNS * CELL.w, height: rows * CELL.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composite)
    .webp({ quality: 84, effort: 5 })
    .toFile(sheetOut);
  const register: SpellSheet = { cell: CELL, columns: COLUMNS, cells: cells.length, cellOf, placeholder };
  writeFileSync(registerOut, JSON.stringify(register));
  return { files: 2, bytes: info.size + statSync(registerOut).size };
}

if (import.meta.filename === process.argv[1]) {
  const r = await buildSpellIcons();
  console.log(`spell sheet: ${r.files} files, ${Math.round(r.bytes / 1024)} KB`);
}
