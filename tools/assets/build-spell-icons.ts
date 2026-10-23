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
    const { data } = await sharp(sources[id - 1]!, { failOn: "none" }).resize(CELL.w, CELL.h, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
