/**
 * The pictures of the achievements (`docs/ACHIEVEMENTS.md`, `src/data/achievements.ts`): one WebP of 256 px with transparency for each achievement and one for the lock that stands
 * in the overview for an achievement that has not dropped, `ui/achievements/<id>.webp`.
 *
 * The sources are the user's, in `tools/assets/sources/ui/achievements`:
 *  - `sheet.png`: 5 x 5 pictures in the order of the table, 1536 x 1024, RGB. The transparency is NOT in the file: the grey and white chequerboard of an image viewer is part of the picture,
 *    so the background is taken away here (bright pixels without colour that touch the edge or fill a big area, then a soft edge). Cell 8 (three stars) is not used, the spaceship of
 *    `lock_and_ship.png` stands in its place, and cell 21 (four heroes) is not used, the letters of `word.png` stand in for "Can I buy an E?".
 *  - `lock_and_ship.png`: the lock on the left half, the spaceship on the right half (RGBA).
 *  - `word.png`: "_VIL" (RGBA).
 * One file for each picture (and not a sheet like the items): the scroll needs a picture of its own, the overview shows 26 of them once.
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { ACHIEVEMENTS } from "../../src/data/achievements";
import { OUT, ROOT, ensureDir, upToDate } from "./lib";

const SOURCES = join(ROOT, "tools", "assets", "sources", "ui", "achievements");
const SIZE = 256;
/** The picture fills this much of the file; the rest is air, so that no icon touches the edge. */
const FIT = 244;
const COLUMNS = 5;
const ROWS = 5;
/** A piece of background inside an icon is taken away when it is at least this many pixels (the chequerboard behind the gong); smaller bright patches are part of the icon. */
const ENCLOSED_BACKGROUND = 600;
/** Pieces of an icon smaller than this many pixels (a speck of the background that survived) are dropped. */
const MIN_PIECE = 120;
/** The cells of the sheet that the table does not use, and what takes their place. */
/** Where the lock ends and the spaceship begins in `lock_and_ship.png` (the flame of the spaceship reaches left of the middle of the file). */
const SPLIT_X = 745;
const SPACESHIP_CELL = 7;
const WORD_CELL = 20;

interface Rgba {
  data: Buffer;
  width: number;
  height: number;
}

async function readRgba(path: string): Promise<Rgba> {
  const { data, info } = await sharp(path, { failOn: "none" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Whether a pixel could be the chequerboard: bright and without colour (the squares are white and light grey, a little blurred). */
function isBackground(d: Buffer, i: number): boolean {
  const r = d[i]!;
  const g = d[i + 1]!;
  const b = d[i + 2]!;
  return Math.min(r, g, b) >= 200 && Math.max(r, g, b) - Math.min(r, g, b) <= 9;
}

/**
 * Takes the chequerboard out of the sheet. Every area of bright, colourless pixels is looked at: the ones that touch the edge of the picture are the chequerboard, and so are the big ones
 * inside an icon (the gong's frame holds a piece of it); what is small and inside (a white highlight, the foam) stays. Then a fringe of two pixels of light, colourless pixels next to the
 * background goes too (the blurred rim of a square), and the alpha gets a soft edge.
 */
export function keyOutBackground(img: Rgba): void {
  const { data, width, height } = img;
  const n = width * height;
  const gone = new Uint8Array(n);
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  for (let start = 0; start < n; start++) {
    if (seen[start] || !isBackground(data, start * 4)) continue;
    const area: number[] = [];
    let edge = false;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop()!;
      area.push(p);
      const x = p % width;
      const y = (p - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge = true;
      const around = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of around) {
        if (q >= 0 && !seen[q] && isBackground(data, q * 4)) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (edge || area.length >= ENCLOSED_BACKGROUND) for (const p of area) gone[p] = 1;
  }
  const rim = (d: Buffer, i: number): boolean => Math.min(d[i]!, d[i + 1]!, d[i + 2]!) >= 150 && Math.max(d[i]!, d[i + 1]!, d[i + 2]!) - Math.min(d[i]!, d[i + 1]!, d[i + 2]!) <= 26;
  for (let pass = 0; pass < 2; pass++) {
    const add: number[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const p = y * width + x;
        if (gone[p] || !rim(data, p * 4)) continue;
        if (gone[p - 1] || gone[p + 1] || gone[p - width] || gone[p + width]) add.push(p);
      }
    }
    for (const p of add) gone[p] = 1;
  }
  // soft edge: the alpha of a pixel follows the share of its 3 x 3 neighbours that stay
  const alpha = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let keep = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          count++;
          if (!gone[yy * width + xx]) keep++;
        }
      }
      const p = y * width + x;
      alpha[p] = gone[p] ? Math.round((255 * Math.max(0, keep - 1)) / count / 2) : Math.round((255 * Math.min(count, keep + 1)) / count);
    }
  }
  for (let p = 0; p < n; p++) data[p * 4 + 3] = alpha[p]!;
}

/** Copies a region of a picture. */
function crop(src: Rgba, left: number, top: number, width: number, height: number): Rgba {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) src.data.copy(data, y * width * 4, ((top + y) * src.width + left) * 4, ((top + y) * src.width + left + width) * 4);
  return { data, width, height };
}

interface Pieces {
  label: Int32Array;
  owner: Map<number, number>;
  area: Map<number, number>;
}

/**
 * The pieces of the sheet (areas that are not transparent, touching diagonally too) and the cell of the grid each one belongs to: the one that holds its middle. An icon may reach over the
 * line between two cells (the base of the Capybara hangs into the cell below): the piece is one, so it goes to one cell whole and leaves no sliver in the other.
 */
function piecesOf(sheet: Rgba): Pieces {
  const { data, width, height } = sheet;
  const label = new Int32Array(width * height);
  const owner = new Map<number, number>();
  const area = new Map<number, number>();
  const stack: number[] = [];
  let next = 0;
  for (let start = 0; start < width * height; start++) {
    if (label[start] || data[start * 4 + 3]! < 40) continue;
    const id = ++next;
    let count = 0;
    let sx = 0;
    let sy = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      count++;
      sx += x;
      sy += y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const q = yy * width + xx;
          if (!label[q] && data[q * 4 + 3]! >= 40) {
            label[q] = id;
            stack.push(q);
          }
        }
      }
    }
    area.set(id, count);
    const col = Math.min(COLUMNS - 1, Math.floor((sx / count / width) * COLUMNS));
    const row = Math.min(ROWS - 1, Math.floor((sy / count / height) * ROWS));
    owner.set(id, row * COLUMNS + col);
  }
  return { label, owner, area };
}

/** The picture of one cell: only its own pieces (the specks are dropped), cut to their outline wherever it lies. */
function cellPicture(sheet: Rgba, pieces: Pieces, cell: number): Rgba {
  const { label, owner, area } = pieces;
  const mine = (id: number): boolean => id > 0 && owner.get(id) === cell && (area.get(id) ?? 0) >= MIN_PIECE;
  let x0 = sheet.width;
  let y0 = sheet.height;
  let x1 = -1;
  let y1 = -1;
  for (let p = 0; p < label.length; p++) {
    if (!mine(label[p]!)) continue;
    const x = p % sheet.width;
    const y = (p - x) / sheet.width;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x1 < 0) throw new Error(`achievement sheet: nothing in cell ${cell}`);
  const out = crop(sheet, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) if (!mine(label[(y0 + y) * sheet.width + x0 + x]!)) out.data[(y * out.width + x) * 4 + 3] = 0;
  }
  return out;
}

/** Trims the empty border of a picture and fits the rest into a square file with air around it. */
async function toIcon(src: Rgba, out: string): Promise<number> {
  const png = await sharp(src.data, { raw: { width: src.width, height: src.height, channels: 4 } }).png().toBuffer();
  const trimmed = await sharp(png).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 }).png().toBuffer();
  ensureDir(out);
  const info = await sharp(trimmed)
    .resize(FIT, FIT, { fit: "inside", withoutEnlargement: false })
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88, alphaQuality: 100, effort: 5 })
    .toFile(out);
  return info.size;
}

export async function buildAchievementIcons(): Promise<{ files: number; bytes: number }> {
  const dir = join(OUT, "ui", "achievements");
  const sources = ["sheet.png", "lock_and_ship.png", "word.png"].map((n) => join(SOURCES, n));
  const outs = [...ACHIEVEMENTS.map((a) => join(dir, `${a.id}.webp`)), join(dir, "lock.webp")];
  if (outs.every((o) => upToDate(o, ...sources, import.meta.filename))) return { files: outs.length, bytes: outs.reduce((s, o) => s + statSync(o).size, 0) };

  let bytes = 0;
  const sheet = await readRgba(sources[0]!);
  keyOutBackground(sheet);
  const pieces = piecesOf(sheet);
  const both = await readRgba(sources[1]!);
  const half = SPLIT_X;
  const word = await readRgba(sources[2]!);
  for (const [i, a] of ACHIEVEMENTS.entries()) {
    const out = join(dir, `${a.id}.webp`);
    if (i === SPACESHIP_CELL) bytes += await toIcon(crop(both, half, 0, both.width - half, both.height), out);
    else if (i === WORD_CELL) bytes += await toIcon(word, out);
    else bytes += await toIcon(cellPicture(sheet, pieces, i), out);
  }
  bytes += await toIcon(crop(both, 0, 0, half, both.height), join(dir, "lock.webp"));
  return { files: outs.length, bytes };
}

if (import.meta.filename === process.argv[1]) {
  const r = await buildAchievementIcons();
  console.log(`achievement pictures: ${r.files} files, ${Math.round(r.bytes / 1024)} KB`);
}
