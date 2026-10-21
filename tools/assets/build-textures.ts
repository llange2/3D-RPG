/**
 * Texture stage of the asset pipeline: world textures, the painted ground tiles, UI images and all icons. Everything becomes WebP at a size
 * that fits the game. (The old `terrain/*.webp` ground pictures, cut out of the tile models, are gone: the painted full tiles replace them.)
 */
import { execFile } from "node:child_process";
import { statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { buildFlatTerrain } from "./build-flat-terrain";
import { buildMinimap } from "./build-minimap";
import { OLD, OUT, ensureDir, mb, pool, upToDate } from "./lib";

const TEX = join(OLD, "textures");

async function toWebp(src: string, out: string, size: number | null, quality = 82, fit: "cover" | "inside" = "inside"): Promise<number> {
  if (upToDate(out, src)) return statSync(out).size;
  ensureDir(out);
  let img = sharp(src, { failOn: "none" });
  if (size) img = img.resize(size, size, { fit, withoutEnlargement: true });
  const info = await img.webp({ quality, effort: 5 }).toFile(out);
  return info.size;
}

// ---------------------------------------------------------------- world textures

/** Wall, floor, ceiling and door textures of the interior themes; 512 px is plenty at first-person distance. */
const WORLD_TEXTURES = [
  "tex_dungeon_wall", "tex_dungeon_wall_cracked", "tex_dungeon_floor", "tex_dungeon_ceiling", "tex_dungeon_door", "tex_dungeon_door2",
  "tex_fortress_wall", "tex_fortress_floor", "tex_fortress_floor_gate", "tex_fortress_pillar", "tex_fortress_door",
  "tex_city_wall", "tex_city_columns", "tex_city_floor", "tex_city_floor_gate", "tex_city_door",
  "tex_cyber_wall", "tex_cyber_floor", "tex_cyber_ceiling",
  "tex_cave", "tex_cave_ceiling", "tex_lava", "tex_snow", "tex_water", "tex_black",
];

// ---------------------------------------------------------------- icons and UI

async function listFiles(dir: string, filter: (name: string) => boolean): Promise<string[]> {
  const { readdirSync } = await import("node:fs");
  return readdirSync(dir).filter(filter);
}

export async function buildTextures(): Promise<Record<string, { files: number; bytes: number }>> {
  const stats: Record<string, { files: number; bytes: number }> = {};
  const add = (group: string, bytes: number) => {
    const s = (stats[group] ??= { files: 0, bytes: 0 });
    s.files++;
    s.bytes += bytes;
  };
  const find = (base: string) => ["png", "jpg", "jpeg"].map((e) => join(TEX, `${base}.${e}`)).find((p) => statSync(p, { throwIfNoEntry: false }));

  await pool(WORLD_TEXTURES, 6, async (name) => {
    const src = find(name);
    if (!src) throw new Error(`world texture not found: ${name}`);
    add("tex (interior)", await toWebp(src, join(OUT, "tex", `${name}.webp`), 512));
  });

  const flat = await buildFlatTerrain();
  stats["terrain flat"] = { files: flat.files, bytes: flat.bytes };
  if (flat.missing.length) console.warn(`flat terrain: ${flat.missing.length} transitions missing (${flat.missing.join(", ")})`);

  const icons = await listFiles(TEX, (n) => n.startsWith("item_") && /\.(png|jpg)$/.test(n));
  await pool(icons, 8, async (n) => add("icons items", await toWebp(join(TEX, n), join(OUT, "icons", "items", `${basename(n, ".png").replace(/\.jpg$/, "")}.webp`), 96, 85)));

  const portraits = await listFiles(TEX, (n) => /^character\d+.*\.(png|jpg)$/.test(n));
  await pool(portraits, 8, async (n) => add("icons portraits", await toWebp(join(TEX, n), join(OUT, "icons", "portraits", `${n.replace(/\.(png|jpg)$/, "")}.webp`), 192, 85)));

  const skills = await listFiles(TEX, (n) => /^mm3_(icon|spell)_.*\.(png|jpg)$/.test(n));
  await pool(skills, 8, async (n) => add("icons skills+spells", await toWebp(join(TEX, n), join(OUT, "icons", "skills", `${n.replace(/\.(png|jpg)$/, "")}.webp`), 160, 85)));

  // the 38 symbols of the map become one sheet (`ui/minimap.webp`), see build-minimap.ts
  add("ui", (await buildMinimap()).bytes);

  const effects = ["tex_acid_hit", "tex_fire_hit", "tex_ice_hit", "tex_magic_hit", "tex_physical_hit", "tex_compass", "tex_denied", "tex_gui_levitate", "tex_gui_protect_acid", "tex_gui_protect_fire", "tex_gui_protect_ice", "tex_gui_protect_magic", "gui_health", "gui_mana", "frame", "scroll", "scroll_wide", "cursor", "gui", "gui_mm"];
  await pool(effects, 6, async (name) => {
    const src = find(name);
    if (src) add("ui", await toWebp(src, join(OUT, "ui", `${name}.webp`), 512, 85));
  });

  const cures = await listFiles(TEX, (n) => n.startsWith("tex_cure_"));
  await pool(cures, 6, async (n) => add("ui", await toWebp(join(TEX, n), join(OUT, "ui", `${n.replace(/\.(png|jpg)$/, "")}.webp`), 256, 85)));

  const quest = await listFiles(TEX, (n) => n.startsWith("quest_"));
  await pool(quest, 6, async (n) => add("ui", await toWebp(join(TEX, n), join(OUT, "ui", `${n.replace(/\.(png|jpg)$/, "")}.webp`), 256, 85)));

  const loading = ["loading_screen1", "loading_screen2", "loading_screen3", "loading_screen4", "_title", "_mm3_009", "tex_main_menu"];
  await pool(loading, 4, async (name) => {
    const src = find(name);
    if (src) add("screens", await toWebp(src, join(OUT, "ui", `${name.replace(/^_/, "")}.webp`), 1600, 80));
  });

  const town = await listFiles(TEX, (n) => n.startsWith("town_") && /\.jpg$/.test(n));
  await pool(town, 4, async (n) => add("screens", await toWebp(join(TEX, n), join(OUT, "ui", "town", `${n.replace(/\.jpg$/, "")}.webp`), 1024, 78)));

  const npc = await listFiles(TEX, (n) => /^npc\d+.*\.(png|jpg)$/.test(n));
  await pool(npc, 4, async (n) => add("icons portraits", await toWebp(join(TEX, n), join(OUT, "icons", "portraits", `${n.replace(/\.(png|jpg)$/, "")}.webp`), 256, 85)));

  // sky: the old 8192x2048 cloud image becomes a 2048x512 layer
  const sky = join(TEX, "Sky01.jpg");
  const skyOut = join(OUT, "ui", "sky01.webp");
  if (!upToDate(skyOut, sky)) {
    ensureDir(skyOut);
    await sharp(sky).resize(2048, 512, { fit: "fill" }).webp({ quality: 80 }).toFile(skyOut);
  }
  add("ui", statSync(skyOut).size);

  // the crow mascot moves while danger is near: the old 512x512 H.264 clip (20 s with a silent audio track) as a small VP9 loop
  const crow = join(TEX, "npc01_active.mp4");
  const crowOut = join(OUT, "ui", "npc01_active.webm");
  if (!upToDate(crowOut, crow)) {
    ensureDir(crowOut);
    await promisify(execFile)(ffmpegPath!, ["-y", "-loglevel", "error", "-i", crow, "-an", "-vf", "scale=192:192", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-deadline", "good", "-cpu-used", "4", crowOut]);
  }
  add("ui", statSync(crowOut).size);

  writeFileSync(join(OUT, "textures.stats.json"), JSON.stringify(stats, null, 1));
  return stats;
}

if (process.argv[1]?.endsWith("build-textures.ts")) {
  const stats = await buildTextures();
  for (const [group, s] of Object.entries(stats)) console.log(`${group.padEnd(22)} ${String(s.files).padStart(4)} files ${String(mb(s.bytes)).padStart(7)} MB`);
}
