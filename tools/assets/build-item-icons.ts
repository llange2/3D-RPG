/**
 * The item pictures (`item_*.png`, about 300 of them: weapons, armour, rings, quest items, scrolls) become ONE sheet, `ui/items.webp`, with a
 * register, `ui/items.json`, like the spell pictures (`build-spell-icons.ts`): an inventory shows up to 50 of them at once, and every slot that
 * was drawn again made the browser look up, decode and paint a small file of its own, so pictures popped in one after the other. One sheet is
 * fetched and decoded once at start-up (`ui/itemIcons.ts`) and every slot is a window onto it.
 *
 * The cells are 64 px square: the slots show them at 54 CSS pixels at most (about 1.2 times that on a sharp screen), where the 96 px files were
 * shrunk by the browser at every draw.
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { OLD, OUT, ensureDir, upToDate } from "./lib";

const TEX = join(OLD, "textures");
const CELL = 64;
const COLUMNS = 20;

export interface ItemSheet {
  /** Side of a cell, pixels. */
  cell: number;
  columns: number;
  /** Cells in the sheet, left to right, top to bottom. */
  cells: number;
  /** Cell of each picture by the name of its texture (`item.texture`, without extension). */
  cellOf: Record<string, number>;
}

export async function buildItemIcons(): Promise<{ files: number; bytes: number }> {
  const sheetOut = join(OUT, "ui", "items.webp");
  const registerOut = join(OUT, "ui", "items.json");
  const names = readdirSync(TEX)
    .filter((n) => n.startsWith("item_") && /\.(png|jpg)$/.test(n))
    .sort();
  const sources = names.map((n) => join(TEX, n));
  if (upToDate(sheetOut, ...sources, import.meta.filename) && upToDate(registerOut, ...sources, import.meta.filename)) return { files: 2, bytes: statSync(sheetOut).size + statSync(registerOut).size };

  const cellOf: Record<string, number> = {};
  const composite: OverlayOptions[] = [];
  for (const [i, n] of names.entries()) {
    // a picture that is not square (a few are 88 x 96) keeps its shape inside the cell, as `object-fit: contain` showed it
    const data = await sharp(join(TEX, n), { failOn: "none" })
      .resize(CELL, CELL, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer();
    cellOf[n.replace(/\.(png|jpg)$/, "")] = i;
    composite.push({ input: data, raw: { width: CELL, height: CELL, channels: 4 as const }, left: (i % COLUMNS) * CELL, top: Math.floor(i / COLUMNS) * CELL });
  }
  const rows = Math.ceil(names.length / COLUMNS);
  ensureDir(sheetOut);
  const info = await sharp({ create: { width: COLUMNS * CELL, height: rows * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composite)
    .webp({ quality: 86, effort: 5 })
    .toFile(sheetOut);
  const register: ItemSheet = { cell: CELL, columns: COLUMNS, cells: names.length, cellOf };
  writeFileSync(registerOut, JSON.stringify(register));
  return { files: 2, bytes: info.size + statSync(registerOut).size };
}

if (import.meta.filename === process.argv[1]) {
  const r = await buildItemIcons();
  console.log(`item sheet: ${r.files} files, ${Math.round(r.bytes / 1024)} KB`);
}
