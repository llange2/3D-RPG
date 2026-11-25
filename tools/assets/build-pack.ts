/**
 * Builds the files of a version of the game that is a pack (`docs/PLAN_FANTASTIC_ISLANDS.md`): copies `tools/assets/sources-packs/<id>/assets/**` (the files in the shape the game loads them,
 * the same paths as below `public/assets/`) to `public/assets-packs/<id>/`, takes `tools/assets/sources-packs/<id>/names.json` (monster id -> name) over, checks the rules of
 * `packRules.ts` and writes `pack.json`, the list the game reads at start-up.
 *
 * Usage: npm run assets:pack [-- --pack fantastic]
 *
 * Files in the output that the sources no longer have are removed one by one (the output is generated, never edited by hand).
 */
import { existsSync, copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { MONSTER_IDS } from "../../src/data/tables";
import { checkNames, checkPackFiles, checkRegistryEntries } from "./packRules";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLIC_ASSETS = join(ROOT, "public", "assets");
const REGISTRIES = ["models.static.original.json", "models.monsters.original.json"];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name), out);
    else out.push(join(dir, e.name));
  }
  return out;
}
const rel = (root: string, file: string): string => relative(root, file).split(sep).join("/");

export interface PackBuildResult {
  files: string[];
  bytes: number;
  problems: string[];
}

export function buildPack(id: string): PackBuildResult {
  const src = join(ROOT, "tools", "assets", "sources-packs", id);
  const srcAssets = join(src, "assets");
  const out = join(ROOT, "public", "assets-packs", id);
  mkdirSync(out, { recursive: true });

  const wanted = walk(srcAssets).map((f) => rel(srcAssets, f)).sort();
  let bytes = 0;
  for (const path of wanted) {
    const to = join(out, path);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(srcAssets, path), to);
    bytes += statSync(to).size;
  }
  // files of an earlier build that the sources no longer have
  const keep = new Set([...wanted, "pack.json"]);
  for (const f of walk(out)) if (!keep.has(rel(out, f))) unlinkSync(f);
  // (emptied folders: deepest first)
  for (const d of readdirSync(out, { withFileTypes: true, recursive: true }).filter((e) => e.isDirectory()).map((e) => join(e.parentPath, e.name)).sort((a, b) => b.length - a.length)) {
    if (readdirSync(d).length === 0) rmdirSync(d);
  }

  const classic = new Set(walk(PUBLIC_ASSETS).map((f) => rel(PUBLIC_ASSETS, f)));
  const pack = new Set(wanted);
  const problems = checkPackFiles({ pack, classic });
  for (const reg of REGISTRIES) {
    if (pack.has(reg)) problems.push(...checkRegistryEntries(reg, JSON.parse(readFileSync(join(out, reg), "utf-8")), pack, classic));
  }
  const namesFile = join(src, "names.json");
  const names = existsSync(namesFile) ? (JSON.parse(readFileSync(namesFile, "utf-8")) as Record<string, string>) : undefined;
  problems.push(...checkNames(names, new Set(MONSTER_IDS)));

  const manifest = { id, files: wanted, ...(names ? { names } : {}) };
  writeFileSync(join(out, "pack.json"), `${JSON.stringify(manifest, null, 1)}\n`);
  return { files: wanted, bytes, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const at = process.argv.indexOf("--pack");
  const id = at >= 0 ? (process.argv[at + 1] ?? "fantastic") : "fantastic";
  const result = buildPack(id);
  console.log(`${id}: ${result.files.length} files, ${(result.bytes / 1048576).toFixed(2)} MB`);
  if (result.problems.length > 0) {
    console.error(`PROBLEMS:\n${result.problems.join("\n")}`);
    process.exitCode = 1;
  }
}
