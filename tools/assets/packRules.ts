/**
 * The rules a pack's files must follow (`docs/PLAN_FANTASTIC_ISLANDS.md` 4.2). No file access here: `build-pack.ts` and `tests/unit/assets.test.ts` hand in the lists.
 *
 * - A picture sheet and its register (`ui/items.webp` + `ui/items.json`, `ui/spells.*`, `ui/minimap.*`) come together or not at all: a new register over the old sheet would point at the wrong cells.
 * - A pack that brings `tex/X` brings `hd/tex/X` too when Classic has one, or "Textures: high" would show Classic's picture under the new one.
 * - A model registry in a pack is a list of entries that differ or are new, merged over Classic's (`fetchMergedJson`): it must be an object, and the file of each entry must exist in the pack or in Classic.
 */
export interface PackCheckInput {
  /** The files the pack brings (paths below `assets/`). */
  pack: ReadonlySet<string>;
  /** The files of Classic. */
  classic: ReadonlySet<string>;
}

const stem = (path: string): string => path.replace(/\.[^./]+$/, "");
const ext = (path: string): string => /\.([^./]+)$/.exec(path)?.[1] ?? "";

export function checkPackFiles({ pack, classic }: PackCheckInput): string[] {
  const problems: string[] = [];
  // sheet and register: any file whose Classic counterpart has a sibling of the other kind
  for (const path of pack) {
    const base = stem(path);
    const kind = ext(path);
    const other = kind === "json" ? "webp" : kind === "webp" ? "json" : "";
    if (!other) continue;
    const sibling = `${base}.${other}`;
    // only pairs that exist in Classic (a lone texture next to nothing is no pair)
    if (classic.has(sibling) && classic.has(path) && !pack.has(sibling)) problems.push(`${path}: its ${other === "json" ? "register" : "sheet"} ${sibling} is not in the pack (they belong together)`);
  }
  for (const path of pack) {
    if (path.startsWith("tex/") && classic.has(`hd/${path}`) && !pack.has(`hd/${path}`)) problems.push(`${path}: Classic has hd/${path}, the pack must bring its own`);
  }
  return problems;
}

/** The problems of a pack's registry (`models.static.original.json`, `models.monsters.original.json`) given as parsed JSON. */
export function checkRegistryEntries(file: string, registry: unknown, packFiles: ReadonlySet<string>, classicFiles: ReadonlySet<string>): string[] {
  if (typeof registry !== "object" || registry === null || Array.isArray(registry)) return [`${file}: not an object of model entries`];
  const problems: string[] = [];
  for (const [key, entry] of Object.entries(registry)) {
    const model = (entry as { file?: unknown })?.file;
    if (typeof model !== "string") problems.push(`${file}: ${key} has no file`);
    else if (!packFiles.has(model) && !classicFiles.has(model)) problems.push(`${file}: ${key} names ${model}, which is in neither the pack nor Classic`);
  }
  return problems;
}

/** The names of a pack: monster id (a number) -> a non-empty name. */
export function checkNames(names: unknown, knownIds: ReadonlySet<number>): string[] {
  if (names === undefined) return [];
  if (typeof names !== "object" || names === null || Array.isArray(names)) return ["names: not an object"];
  const problems: string[] = [];
  for (const [id, name] of Object.entries(names)) {
    if (!/^\d+$/.test(id) || !knownIds.has(Number(id))) problems.push(`names: ${id} is no monster of the table`);
    else if (typeof name !== "string" || name.trim() === "") problems.push(`names: ${id} has an empty name`);
  }
  return problems;
}
