/**
 * The textures of the "high" setting (Options > Graphics > Textures, 36th playtest): the wall, floor, ceiling and door textures of the interiors again from the old game's
 * pictures (`old_code/resources/textures`), now up to 1024 px on the long side instead of 512 (a picture that is smaller than that stays as it is, a bigger one is scaled
 * down). They go to `public/assets/hd/tex/` under the same names; the game asks for `hd/tex/<name>` when "high" is on and falls back to `tex/<name>` for any that is missing.
 * Optional, like the original models: not part of the load groups and not part of the size budget. Run with `npm run assets:hd`.
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { WORLD_TEXTURES } from "./build-textures";
import { OLD, OUT, ensureDir, mb, pool, upToDate } from "./lib";

const TEX = join(OLD, "textures");
/** The longest side of a "high" texture. */
export const HIGH_SIZE = 1024;

async function main(): Promise<void> {
  let files = 0;
  let bytes = 0;
  await pool([...WORLD_TEXTURES], 4, async (name) => {
    const src = ["png", "jpg", "jpeg"].map((e) => join(TEX, `${name}.${e}`)).find((p) => statSync(p, { throwIfNoEntry: false }));
    if (!src) throw new Error(`world texture not found: ${name}`);
    const out = join(OUT, "hd", "tex", `${name}.webp`);
    if (!upToDate(out, src, import.meta.filename)) {
      ensureDir(out);
      await sharp(src, { failOn: "none" }).resize(HIGH_SIZE, HIGH_SIZE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85, effort: 5 }).toFile(out);
    }
    files++;
    bytes += statSync(out).size;
  });
  console.log(`high textures: ${files} files, ${mb(bytes)} MB in public/assets/hd/tex`);
}

await main();
