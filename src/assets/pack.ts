/**
 * The versions of the game and where their files are. No Babylon and no DOM that a test cannot do without, so `ui`, `render`, `campaign` and the save code can all import it
 * (`docs/PLAN_FANTASTIC_ISLANDS.md`).
 *
 * "Classic" is the game as it was: its files are `public/assets/`. "Fantastic Islands" brings its own files in `public/assets-packs/fantastic/` and only the ones that differ;
 * every other file is Classic's (`resolveAsset`). Which files a pack brings is in its `pack.json`, written by `npm run assets:pack`, so that no request has to fail to find out.
 *
 * The version is chosen once, before the first file is asked for (`initPack` is the first thing `main()` does); a change in the options reloads the page.
 */
export type PackId = "classic" | "fantastic";

export interface PackInfo {
  id: PackId;
  /** The name in the options and on the title screen. */
  name: string;
  /** Folder below `assets-packs/`; Classic has none (it is `assets/`). */
  folder: string | null;
  /** The prefix of the keys the saves of this version are stored under; Classic has none, so the saves from before the versions stay where they are. */
  keyPrefix: string;
}

export const PACKS: Readonly<Record<PackId, PackInfo>> = {
  classic: { id: "classic", name: "Classic", folder: null, keyPrefix: "mm3-seed-rpg:" },
  fantastic: { id: "fantastic", name: "Fantastic Islands", folder: "fantastic", keyPrefix: "mm3-seed-rpg:fantastic:" },
};
export const PACK_IDS: readonly PackId[] = ["classic", "fantastic"];
export const DEFAULT_PACK: PackId = "classic";

/** The version of an address parameter or a stored setting; anything unknown is Classic. */
export function parsePackId(value: unknown): PackId {
  return PACK_IDS.includes(value as PackId) ? (value as PackId) : DEFAULT_PACK;
}

/** What a pack brings, from its `pack.json`. */
export interface PackManifest {
  id: PackId;
  /** The files of the pack, relative to its folder (the same paths as below `assets/`). */
  files: string[];
  /** Names of the monsters that differ from Classic (id -> name); the ids and every table stay as they are. */
  names?: Record<string, string>;
}

const BASE = (): string => (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";

let active: PackId = DEFAULT_PACK;
let files: ReadonlySet<string> = new Set();
let names: Readonly<Record<string, string>> = {};

export const activePack = (): PackInfo => PACKS[active];
export const activePackId = (): PackId => active;

/** The root every file is below when the pack does not bring it: `assets/`. */
export const classicRoot = (): string => `${BASE()}assets/`;
const packRoot = (id: PackId): string => `${BASE()}assets-packs/${PACKS[id].folder}/`;

/** Makes `id` the version of this session. Classic needs no request; a pack that cannot be read leaves the session on Classic's files for everything it does not bring. */
export async function initPack(id: PackId, fetcher: (url: string) => Promise<Response> = fetch): Promise<PackId> {
  active = id;
  files = new Set();
  names = {};
  if (id === "classic") return id;
  try {
    const res = await fetcher(`${packRoot(id)}pack.json`);
    if (res.ok) setPackManifest((await res.json()) as PackManifest);
  } catch {
    // the pack has no manifest: it brings nothing
  }
  return id;
}

/** Sets the active pack from a manifest that is at hand already (tests). */
export function setPackManifest(manifest: PackManifest): void {
  active = manifest.id;
  files = new Set(manifest.files);
  names = manifest.names ?? {};
}

/** Back to Classic without a request (tests). */
export function resetPack(): void {
  active = DEFAULT_PACK;
  files = new Set();
  names = {};
}

/** The URL of a file below `assets/`: the pack's own when it brings the file, else Classic's. */
export function resolveAsset(path: string): string {
  return active !== "classic" && files.has(path) ? `${packRoot(active)}${path}` : `${classicRoot()}${path}`;
}

/** Does the active pack bring this file itself? */
export const packBrings = (path: string): boolean => active !== "classic" && files.has(path);

/** The names of the monsters that this version shows differently (monster id -> name). Ids are the keys everywhere, never names. */
export const packMonsterNames = (): Readonly<Record<string, string>> => names;

/** The storage key of a save, setting or index of the active version. Classic's keys are the ones the game always used. */
export function packKey(base: string): string {
  return activePack().keyPrefix === PACKS.classic.keyPrefix ? base : base.replace(PACKS.classic.keyPrefix, activePack().keyPrefix);
}
