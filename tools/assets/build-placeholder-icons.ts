/**
 * The status icons the old game never drew, painted by the user (`sources/status-icons/*.png`, cut out of `.ignore/icons.png`): Power Shield (spell 33) and
 * Wizard's Eye (spell 24). They show top right while the spell lasts, like the old `tex_gui_*` icons, so they are written the same way: 200 x 200 with alpha
 * as `ui/tex_gui_<name>.webp`. (The Power Shield used a drawn dummy here until the 38th playtest; the file keeps its name for `build-textures.ts`.)
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { OUT, ensureDir, upToDate } from "./lib";

const SOURCES = join(dirname(import.meta.filename), "sources", "status-icons");
export const STATUS_ICONS = ["power_shield", "wizard_eye"] as const;

/** Writes `ui/tex_gui_<name>.webp` for each status icon whose source is newer than the file. */
export async function buildPlaceholderIcons(): Promise<number> {
  let written = 0;
  for (const name of STATUS_ICONS) {
    const source = join(SOURCES, `${name}.png`);
    if (!existsSync(source)) throw new Error(`status icon source missing: ${source}`);
    const out = join(OUT, "ui", `tex_gui_${name}.webp`);
    if (upToDate(out, source, import.meta.filename)) continue;
    ensureDir(out);
    await sharp(source).resize(200, 200, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90, alphaQuality: 95 }).toFile(out);
    written++;
  }
  return written;
}

if (import.meta.filename === process.argv[1]) console.log(`status icons: ${await buildPlaceholderIcons()} written`);
