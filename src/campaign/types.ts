/**
 * The hand-built campaign of the old game (34 maps), exported to JSON by tools/export/export_maps.py.
 * Coordinates are the absolute ones of the old editor (around 5000/5000); `origin` is the cell the exported area starts at.
 * The old y axis points north, the grid of the new game points south, so conversion happens in model.ts.
 */

/** One cell as exported. Keys are short to keep the files small. */
export interface RawCell {
  x: number;
  y: number;
  /** Block id (BLOCKS table) and its rotation in degrees. */
  b?: number;
  br?: number;
  /** Item id (map decoration in the ITEMS table: chests, statues, levers, signs...) and rotation. */
  i?: number;
  ir?: number;
  /** Action id (see action_handler.py), its first parameter and the editor's additional parameters. */
  a?: number;
  ap?: number | string;
  ax?: Record<string, unknown>;
  /** Monster id, its parameter, health and rotation. */
  m?: number;
  mp?: number | string;
  mh?: number;
  mr?: number;
  /** Sound id and parameter (ambient sound zones). */
  s?: number;
  sp?: number | string;
}

export interface CampaignMapData {
  name: string;
  slug: string;
  debug: boolean;
  music: number;
  start: { x: number; y: number; facing: "N" | "E" | "S" | "W" };
  origin: [number, number];
  width: number;
  height: number;
  cells: RawCell[];
}

export interface CampaignIndexEntry {
  name: string;
  slug: string;
  debug: boolean;
  width: number;
  height: number;
  music: number;
  cells: number;
  actions: number;
  monsters: number;
  bytes: number;
}

/**
 * Where a new campaign game starts. The old new_game() loads a prepared save: Fountain Head, on the doorstep of the inn.
 * The party stands in the street in front of it, facing north.
 */
export const CAMPAIGN_START = "fountain-head";
export const CAMPAIGN_START_CELL = { x: 5005, y: 5002, facing: "N" as const };

/** The two traps whose moving part the old game animated: the spears of the spring trap (action 17) and the guillotine (24). */
export type TrapKind = "spear" | "guillotine";
/** The way a metal gate leaves: action 16 lets it drop into the floor, action 18 (and levers) lift it into the ceiling. */
export type GateDirection = "down" | "up";

/** Map names the old editor misspelled in transfer actions. */
const ALIASES: Record<string, string> = { "dragontooth-castle": "castle-dragontooth" };

/** Slug of an old map name: "Fountain Head Cavern" -> "fountain-head-cavern". */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The slug of the map a transfer action names. */
export function mapSlugOf(name: string): string {
  const slug = slugOf(name);
  return ALIASES[slug] ?? slug;
}

/** Old rotation in degrees to a facing. 0 looks north (+y of the old map), 90 east. */
export function facingOfRotation(deg: number | string | undefined, fallback: "N" | "E" | "S" | "W" = "N"): "N" | "E" | "S" | "W" {
  if (deg === undefined || deg === "") return fallback;
  const n = Math.round(Number(deg) / 90);
  if (!Number.isFinite(n)) return fallback;
  return (["N", "E", "S", "W"] as const)[((n % 4) + 4) % 4]!;
}

/** Parses "5003/5007" into absolute coordinates, or null for empty, malformed and 0/0 values. */
export function parseXY(value: unknown): { x: number; y: number } | null {
  if (typeof value !== "string") return null;
  const m = /^\s*(-?\d+)\s*\/\s*(-?\d+)\s*$/.exec(value);
  // the editor's empty default is 0/0; no map has cells near the origin
  return m && !(Number(m[1]) === 0 && Number(m[2]) === 0) ? { x: Number(m[1]), y: Number(m[2]) } : null;
}
