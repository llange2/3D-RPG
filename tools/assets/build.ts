/** Runs every asset stage and writes public/assets/manifest.json (files grouped for lazy loading, with sizes and budget check). */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { buildAudio } from "./build-audio";
import { buildAllModels, buildMonsters } from "./build-models";
import { buildTextures } from "./build-textures";
import { OUT, mb } from "./lib";

const BUDGET = { coreMB: 40, totalMB: 250 };

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name), out);
    else out.push(join(dir, e.name));
  }
  return out;
}

/** Which load group a file belongs to. `core` is needed before the first frame; the rest loads on demand. */
function groupOf(path: string): string {
  if (/^models\/monster_(\d+)\.glb$/.test(path)) return `monster:${/monster_(\d+)/.exec(path)![1]}`;
  if (path.startsWith("audio/music/")) return `music:${path.slice(12).replace(/\.webm$/, "")}`;
  const interior = /^tex\/tex_(dungeon|fortress|city|cyber|cave)/.exec(path);
  if (interior) return `interior:${interior[1] === "cave" ? "cave" : interior[1]}`;
  if (path.startsWith("ui/town/") || path.startsWith("ui/loading") || path === "ui/title.webp" || path === "ui/mm3_009.webp" || path === "ui/tex_main_menu.webp") return "screens";
  if (path.startsWith("models/obj_") || path.startsWith("models/ci_") || path.startsWith("models/proj_") || path.startsWith("models/frame_")) return "objects";
  if (path.startsWith("campaign/")) return "campaign";
  if (path.startsWith("terrain/flat/")) return "terrain-flat"; // the painted ground tiles: the flat mode draws them all, the 3D mode the full tiles under its models
  return "core";
}

// the title and outside music are heard right away, so they belong to core
const CORE_MUSIC = new Set(["music:title", "music:outside"]);

async function main(): Promise<void> {
  const t0 = Date.now();
  await buildTextures();
  const staticModels = await buildAllModels();
  const monsters = await buildMonsters();
  await buildAudio();
  writeFileSync(join(OUT, "models.static.json"), JSON.stringify(staticModels, null, 1));
  writeFileSync(join(OUT, "models.monsters.json"), JSON.stringify(monsters, null, 1));

  const all = walk(OUT).map((f) => relative(OUT, f).split(sep).join("/"));
  // The unreduced models (npm run assets:originals) are an optional extra of ~470 MB for the menu's model switch: they
  // are neither part of the load groups nor of the size budget, and are reported on their own.
  const isOriginal = (p: string): boolean => p.startsWith("models-original/") || /^models\.(static|monsters)\.original\.json$/.test(p);
  const files = all.filter((p) => !p.endsWith(".stats.json") && p !== "manifest.json" && !isOriginal(p));
  const originalBytes = all.filter(isOriginal).reduce((s, p) => s + statSync(join(OUT, p)).size, 0);
  const groups: Record<string, { bytes: number; files: string[] }> = {};
  let total = 0;
  for (const path of files) {
    let group = groupOf(path);
    if (CORE_MUSIC.has(group)) group = "core";
    const bytes = statSync(join(OUT, path)).size;
    total += bytes;
    const g = (groups[group] ??= { bytes: 0, files: [] });
    g.bytes += bytes;
    g.files.push(path);
  }
  const core = groups.core?.bytes ?? 0;
  const manifest = { version: 1, generatedAt: new Date().toISOString(), totalBytes: total, coreBytes: core, groups };
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest));

  console.log(`assets built in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${files.length} files, total ${mb(total)} MB, core ${mb(core)} MB, ${Object.keys(groups).length} groups`);
  console.log(originalBytes > 0 ? `  original models present (not in the budget): ${mb(originalBytes)} MB` : "  original models not built (npm run assets:originals)");
  const sizes = Object.entries(groups).filter(([k]) => !k.startsWith("monster:") && !k.startsWith("music:"));
  for (const [name, g] of sizes) console.log(`  ${name.padEnd(18)} ${String(g.files.length).padStart(4)} files ${String(mb(g.bytes)).padStart(7)} MB`);
  const monsterBytes = Object.entries(groups).filter(([k]) => k.startsWith("monster:")).reduce((s, [, g]) => s + g.bytes, 0);
  const musicBytes = Object.entries(groups).filter(([k]) => k.startsWith("music:")).reduce((s, [, g]) => s + g.bytes, 0);
  console.log(`  monsters (lazy)    ${String(mb(monsterBytes)).padStart(7)} MB   music (lazy) ${mb(musicBytes)} MB`);
  if (mb(core) > BUDGET.coreMB || mb(total) > BUDGET.totalMB) {
    console.error(`BUDGET EXCEEDED: core ${mb(core)} MB (max ${BUDGET.coreMB}), total ${mb(total)} MB (max ${BUDGET.totalMB})`);
    process.exit(1);
  }
}

await main();
