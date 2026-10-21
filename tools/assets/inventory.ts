/**
 * Asset inventory, size report and provenance ledger for old_code/resources.
 *
 * Writes tools/assets/reports/inventory.json (groups, heaviest files, budget findings) and
 * tools/assets/reports/provenance.json (one entry per file: sha256, size, dimensions or triangles, metadata flags).
 * Read-only on old_code. Excluded on purpose: resources/maps/_old (backups), *.lnk, documentation/ (original MM3 files).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RESOURCES = join(ROOT, "..", "old_code", "resources");
const REPORTS = join(ROOT, "tools", "assets", "reports");

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg"]);
const SKIP_DIRS = new Set(["_old"]);
const SKIP_EXT = new Set([".lnk"]);

/** Byte markers that hint at the tool a file came from. They are hints, not proof. */
const MARKERS: { flag: string; needle: string }[] = [
  { flag: "marker:c2pa", needle: "c2pa" },
  { flag: "marker:OpenAI", needle: "OpenAI" },
  { flag: "marker:Designer", needle: "Designer" },
  { flag: "marker:Gigapixel", needle: "Gigapixel" },
];

const FONT_PROPRIETARY = new Set(["MATURASC.TTF"]);

interface Entry {
  path: string;
  bytes: number;
  sha256: string;
  group: string;
  width?: number;
  height?: number;
  tris?: number;
  flags: string[];
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory()) {
      if (!SKIP_DIRS.has(name.name)) yield* walk(join(dir, name.name));
    } else if (!SKIP_EXT.has(extname(name.name).toLowerCase())) {
      yield join(dir, name.name);
    }
  }
}

function classify(rel: string): string {
  const parts = rel.split("/");
  const [top, second, third] = parts;
  const file = parts[parts.length - 1] ?? "";
  if (top === "objects") {
    if (second === "monster") return third === "animated" ? "objects/monster/animated" : "objects/monster/static";
    if (second === "personas") return "objects/personas";
    return "objects/props+terrain";
  }
  if (top === "textures") {
    if (second === "water") return "textures/water";
    const prefixes: [string, string][] = [
      ["item_", "textures/item icons"],
      ["character", "textures/portraits"],
      ["mm3_icon_", "textures/class+spell icons"],
      ["mm3_spell_", "textures/class+spell icons"],
      ["tex_mm_", "textures/minimap tiles"],
      ["tex_", "textures/world+ui"],
      ["town_", "textures/town"],
      ["npc", "textures/npc"],
    ];
    for (const [prefix, group] of prefixes) if (file.startsWith(prefix)) return group;
    return "textures/other";
  }
  return top ?? "other";
}

/** Triangle count of a binary glTF, read from the JSON chunk without a glTF library. */
function glbTriangles(buf: Buffer): number | undefined {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return undefined;
  const jsonLength = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString("utf-8", 20, 20 + jsonLength)) as {
    meshes?: { primitives: { attributes: Record<string, number>; indices?: number; mode?: number }[] }[];
    accessors?: { count: number }[];
  };
  let tris = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const prim of mesh.primitives) {
      if ((prim.mode ?? 4) !== 4) continue;
      const accessor = gltf.accessors?.[prim.indices ?? prim.attributes.POSITION ?? -1];
      if (accessor) tris += Math.floor(accessor.count / 3);
    }
  }
  return tris;
}

/** Triangle count of an OBJ: every face with n vertices becomes n-2 triangles. */
function objTriangles(buf: Buffer): number {
  let tris = 0;
  for (const line of buf.toString("latin1").split("\n")) {
    if (line.charCodeAt(0) === 102 /* f */ && line.charCodeAt(1) === 32) {
      const vertexCount = line.trim().split(/\s+/).length - 1;
      if (vertexCount >= 3) tris += vertexCount - 2;
    }
  }
  return tris;
}

async function describe(file: string): Promise<Entry> {
  const rel = relative(RESOURCES, file).split(sep).join("/");
  const buf = readFileSync(file);
  const ext = extname(file).toLowerCase();
  const entry: Entry = {
    path: `resources/${rel}`,
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
    group: classify(rel),
    flags: [],
  };

  if (IMAGE_EXT.has(ext)) {
    const meta = await sharp(buf).metadata();
    entry.width = meta.width;
    entry.height = meta.height;
    const text = buf.toString("latin1");
    for (const { flag, needle } of MARKERS) if (text.includes(needle)) entry.flags.push(flag);
  } else if (ext === ".glb") {
    entry.tris = glbTriangles(buf);
  } else if (ext === ".obj") {
    entry.tris = objTriangles(buf);
  }
  if (FONT_PROPRIETARY.has(file.split(sep).pop() ?? "")) entry.flags.push("proprietary-font");
  return entry;
}

const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;

async function main(): Promise<void> {
  const started = Date.now();
  const entries: Entry[] = [];
  for (const file of walk(RESOURCES)) entries.push(await describe(file));

  const groups = new Map<string, { files: number; bytes: number }>();
  for (const e of entries) {
    const g = groups.get(e.group) ?? { files: 0, bytes: 0 };
    g.files++;
    g.bytes += e.bytes;
    groups.set(e.group, g);
  }

  const images = entries.filter((e) => e.width !== undefined && e.height !== undefined);
  const bigTextures = images.filter((e) => Math.max(e.width!, e.height!) > 1024);
  const heavyModels = entries.filter((e) => e.tris !== undefined && e.tris > 5000);
  const models = entries.filter((e) => e.tris !== undefined);
  const flagCounts: Record<string, number> = {};
  for (const e of entries) for (const f of e.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;

  const byHash = new Map<string, Entry[]>();
  for (const e of entries) byHash.set(e.sha256, [...(byHash.get(e.sha256) ?? []), e]);
  const duplicateBytes = [...byHash.values()].filter((l) => l.length > 1).reduce((sum, l) => sum + l[0]!.bytes * (l.length - 1), 0);

  const summary = {
    generatedAt: new Date().toISOString(),
    totalFiles: entries.length,
    totalMB: mb(entries.reduce((s, e) => s + e.bytes, 0)),
    groups: [...groups.entries()]
      .map(([group, g]) => ({ group, files: g.files, MB: mb(g.bytes) }))
      .sort((a, b) => b.MB - a.MB),
    budgetFindings: {
      imagesOver1024px: { count: bigTextures.length, MB: mb(bigTextures.reduce((s, e) => s + e.bytes, 0)) },
      modelsOver5kTriangles: { count: heavyModels.length, ofModels: models.length },
      exactDuplicateBytesMB: mb(duplicateBytes),
    },
    metadataFlags: flagCounts,
    heaviestFiles: [...entries]
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 20)
      .map((e) => ({ path: e.path, MB: mb(e.bytes), tris: e.tris, size: e.width ? `${e.width}x${e.height}` : undefined })),
  };

  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(join(REPORTS, "inventory.json"), JSON.stringify(summary, null, 1) + "\n");
  writeFileSync(join(REPORTS, "provenance.json"), JSON.stringify(entries) + "\n");

  console.log(`assets:report  ${summary.totalFiles} files, ${summary.totalMB} MB, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  for (const g of summary.groups) console.log(`  ${g.group.padEnd(30)} ${String(g.files).padStart(5)} files ${String(g.MB).padStart(8)} MB`);
  console.log("budget findings:", JSON.stringify(summary.budgetFindings));
  console.log("metadata flags (hints, not proof):", JSON.stringify(flagCounts));
}

await main();
