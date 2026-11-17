/**
 * The effect pictures (`tools/assets/sources/fx`, made by `tools/assets/fx`): particle sheet, smoke, the five impact flipbooks and the seamless water textures become WebP
 * under `public/assets/fx/`. Most are additive pictures with straight alpha (alpha = intensity, rgb = the colour); `water_flow` (the sheet of water down a fountain) and
 * `water_drop` (the user's drop) are drawn by their alpha instead (blue stays blue on a bright wall). The alpha is kept at full quality and the sizes stay as they are:
 * the game cuts the cells out by their number (`render/fxSheets.ts`).
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { OUT, ROOT, ensureDir, upToDate } from "./lib";

const SOURCES = join(ROOT, "tools", "assets", "sources", "fx");

/** Source file (without `fx_` and `.png`) → name under `public/assets/fx`. The names are the game's (`FX_FILES` in `render/fxSheets.ts`). */
export const FX_PICTURES = ["particles", "smoke", "impact_fire", "impact_ice", "impact_acid", "impact_magic", "impact_water", "water_ripple", "water_flow", "water_drop", "foam"] as const;

export async function buildFx(): Promise<{ files: number; bytes: number }> {
  let bytes = 0;
  for (const name of FX_PICTURES) {
    const src = join(SOURCES, `fx_${name}.png`);
    const out = join(OUT, "fx", `${name}.webp`);
    if (!upToDate(out, src)) {
      ensureDir(out);
      // lossy colour is fine for glows, the alpha stays exact (it is the intensity). The game blends SRC_ALPHA + ONE, so whatever colour the encoder leaves under
      // fully transparent pixels counts for nothing (with premultiplied pictures and ONE + ONE it showed as light squares around the glows)
      await sharp(src).webp({ quality: 90, alphaQuality: 100, effort: 5, smartSubsample: false }).toFile(out);
    }
    bytes += statSync(out).size;
  }
  return { files: FX_PICTURES.length, bytes };
}

if (import.meta.filename === process.argv[1]) {
  const r = await buildFx();
  console.log(`fx pictures: ${r.files} files, ${Math.round(r.bytes / 1024)} KB`);
}
