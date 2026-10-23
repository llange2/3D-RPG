/**
 * Placeholder pictures for status icons the user has not drawn yet. Today: Power Shield (spell 33), whose icon the spell sheet wants in the
 * top right "until the final icon is provided". Drop the real picture into `old_code/resources/textures/tex_gui_power_shield.png` and this
 * stage uses it instead of the drawing (`build-textures.ts` then converts it like the other `tex_gui_*` icons).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { OLD, OUT, ensureDir, upToDate } from "./lib";

/** A shield in the colours of the other status icons (200 x 200, like `tex_gui_levitate`). */
const POWER_SHIELD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#cfe4ff"/><stop offset="1" stop-color="#3a64b8"/></radialGradient>
  </defs>
  <path d="M100 14 L172 40 V100 C172 142 140 172 100 188 C60 172 28 142 28 100 V40 Z" fill="url(#g)" stroke="#f1d98a" stroke-width="9" stroke-linejoin="round"/>
  <path d="M100 38 L152 56 V100 C152 130 130 152 100 166 C70 152 48 130 48 100 V56 Z" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="5"/>
  <text x="100" y="124" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="64" fill="#1d2f5e">10%</text>
</svg>`;

/** Writes `ui/tex_gui_power_shield.webp` unless the real texture exists (then `buildTextures` makes it). */
export async function buildPlaceholderIcons(): Promise<number> {
  if (existsSync(join(OLD, "textures", "tex_gui_power_shield.png"))) return 0;
  const out = join(OUT, "ui", "tex_gui_power_shield.webp");
  if (upToDate(out, import.meta.filename)) return 0;
  ensureDir(out);
  await sharp(Buffer.from(POWER_SHIELD_SVG)).webp({ quality: 88 }).toFile(out);
  return 1;
}

if (import.meta.filename === process.argv[1]) console.log(`placeholder icons: ${await buildPlaceholderIcons()} written`);
