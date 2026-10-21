/**
 * Flat ground tiles of the overworld (graphics mode "flat"): hand-painted 856 px squares in `sources/terrain-flat/`, one per terrain and
 * one per transition between two terrains. They become WebP in `public/assets/terrain/flat/` plus the register `tiles.json` that tells
 * the game what each tile shows. The naming rules (which terrain a tile counts as, which quarters show what) are in
 * `src/data/flatTerrain.ts`. Neighbouring tiles are meant to line up along their borders, so nothing here is made seamless.
 */
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { missingFlatTiles, parseFlatName, type FlatRegister, type FlatTile } from "../../src/data/flatTerrain";
import { OUT, ensureDir, pool, upToDate } from "./lib";

const SRC = join(import.meta.dirname, "sources", "terrain-flat");
const DEST = join(OUT, "terrain", "flat");
const SIZE = 512;

/**
 * The painted water has large light and dark clouds; seen small (far away, or on the edge of a mipmap) they turned into a restless pattern. Wherever
 * a tile shows water, the water is redrawn as two quiet blues: the clouds keep their places but only a fifth of their contrast, so it reads as light
 * blue and blue and holds still when it shrinks. The painted sources stay as they are. Water is found by its colour (blue far above red), which
 * leaves the land untouched and fades out where the painted shore blends into it.
 */
const WATER_DARK = [66, 132, 188] as const;
const WATER_LIGHT = [104, 184, 226] as const;
/** Share of the old cloud contrast that remains. */
const WATER_CONTRAST = 0.2;
/** The painted clouds run from red 54 (dark) to 130 (light). */
const PAINTED_DARK = 54;
const PAINTED_LIGHT = 130;

const showsWater = (t: FlatTile): boolean => t.terrain === "water" || t.other === "water";

/** Replaces the water of a raw RGB picture in place. */
export function calmWater(rgb: Buffer): void {
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i]!;
    const blueness = rgb[i + 2]! - r;
    // 0 below 50, 1 above 90: pure water is 110 and more, grass, sand, snow, stone and lava are far below
    const w = Math.max(0, Math.min(1, (blueness - 50) / 40));
    if (w === 0) continue;
    const cloud = Math.max(0, Math.min(1, (r - PAINTED_DARK) / (PAINTED_LIGHT - PAINTED_DARK)));
    const t = 0.5 + (cloud - 0.5) * WATER_CONTRAST;
    for (let c = 0; c < 3; c++) rgb[i + c] = Math.round(rgb[i + c]! * (1 - w) + (WATER_DARK[c]! + (WATER_LIGHT[c]! - WATER_DARK[c]!) * t) * w);
  }
}

export async function buildFlatTerrain(): Promise<{ files: number; bytes: number; missing: string[] }> {
  const names = readdirSync(SRC)
    .filter((f) => f.endsWith(".jpg"))
    .map((f) => f.slice(0, -4))
    .sort();
  const register: FlatRegister = { version: 1, size: SIZE, tiles: {} };
  for (const name of names) register.tiles[name] = parseFlatName(name);
  let bytes = 0;
  await pool(names, 6, async (name) => {
    const src = join(SRC, `${name}.jpg`);
    const out = join(DEST, `${name}.webp`);
    if (!upToDate(out, src, import.meta.filename)) {
      ensureDir(out);
      const picture = sharp(src, { failOn: "none" }).resize(SIZE, SIZE, { fit: "fill" }).removeAlpha();
      if (showsWater(register.tiles[name]!)) {
        const { data, info } = await picture.raw().toBuffer({ resolveWithObject: true });
        calmWater(data);
        await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).webp({ quality: 82, effort: 5 }).toFile(out);
      } else {
        await picture.webp({ quality: 82, effort: 5 }).toFile(out);
      }
    }
    bytes += statSync(out).size;
  });
  const registerFile = join(DEST, "tiles.json");
  ensureDir(registerFile);
  writeFileSync(registerFile, JSON.stringify(register, null, 1));
  bytes += statSync(registerFile).size;
  // WebP files of a tile that no longer has a source would stay behind and look valid
  for (const f of existsSync(DEST) ? readdirSync(DEST) : []) {
    if (f.endsWith(".webp") && !register.tiles[f.slice(0, -5)]) console.warn(`flat terrain: ${f} has no source any more`);
  }
  return { files: names.length + 1, bytes, missing: missingFlatTiles(names) };
}

if (process.argv[1]?.endsWith("build-flat-terrain.ts")) {
  const r = await buildFlatTerrain();
  console.log(`flat terrain: ${r.files} files, ${(r.bytes / 1048576).toFixed(2)} MB`);
  if (r.missing.length) console.log(`  missing transitions: ${r.missing.join(", ")}`);
}
