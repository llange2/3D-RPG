/** Interior maps: grid of cells inside a POI. Pure data, no DOM, no Babylon. */
import type { Alignment } from "../data/castles";

export const CELL = {
  SOLID: 0,
  FLOOR: 1,
  // 2 was PILLAR, a solid cell drawn as a column; pillars are `InteriorMap.pillars` now (floor with four columns on it)
  BUILDING: 3, // solid, a town building block
  LOW: 4, // flat ground nobody can walk on without help: water, lava, a tile with a mountain or a tree on it
} as const;
export type Cell = (typeof CELL)[keyof typeof CELL];

export type InteriorKind = "dungeon" | "cave" | "fortress" | "town";

/**
 * Look of one kind of cell, for maps whose cells do not all share the theme's textures (the hand-built campaign maps
 * mix city, dungeon and outdoor blocks). Texture files are relative to the asset root, without extension.
 */
export interface CellStyle {
  /** floor: walkable ground; wall: tall solid block; low: flat ground that cannot be entered (water, lava, a tile with a model). */
  cls: "floor" | "wall" | "low";
  floor: string | null;
  wall: string | null;
  ceiling: string | null;
  /** Lava and the like: drawn unlit. */
  glow?: boolean;
  /** Water: the texture scrolls. */
  water?: boolean;
  /** The model brings its own floor (the pit trap has a hole in it), so no floor quad is drawn under it. */
  floorless?: boolean;
  /** A model that stands on the cell (mountain, forest, tree), by static model key. `scaleXYZ` is the size per axis (a mountain is taller than wide). */
  model?: { key: string; scale: number; scaleXYZ?: [number, number, number]; y?: number; yaw?: number };
}
export type Facing = "N" | "E" | "S" | "W";

export const FACING_DELTA: Record<Facing, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

export interface Room {
  id: number;
  /** Bounding box in cells. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** A floor cell near the centre. */
  cx: number;
  cy: number;
  /** Number of floor cells that belong to the room. */
  size: number;
}

export interface Lot {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The cell of the building door. Stepping on `door` enters the building; `facing` points out of the house, the wall behind the cell carries the door. */
  door: { x: number; y: number; facing: Facing };
  /** A shop of a hand-built ground plan: the door is a cell of the street, not a niche in a facade, and its sign hangs over that cell. */
  inline?: boolean;
}

/**
 * Where a town's ground plan has something other than a shop on a street cell (`data/town-blueprints.ts`): the people who sell talents,
 * chests, fountains and decoration. The rules of the town decide which of them are used (`actions/rules.ts`).
 */
export type TownSite =
  | { kind: "talent"; x: number; y: number; talent: string }
  /** An object that holds loot and must always give some (a real chest, or any chest cell a gate has shut). */
  | { kind: "chest"; x: number; y: number; item: number }
  /** An object the old town used as a chest that is no chest (storage equipment, a gravestone): it may hold loot or just stand there. */
  | { kind: "loose"; x: number; y: number; item: number }
  | { kind: "decor"; x: number; y: number; item: number }
  /** The town's portal (the old Portal, item 3): it takes the party to the portals of the other towns it has touched. */
  | { kind: "portal"; x: number; y: number; item: number }
  /** The job master (the old "Work for a week", persona 49): a week of work for a purse of gold. */
  | { kind: "work"; x: number; y: number; persona: number }
  | { kind: "fountain"; x: number; y: number; item: number }
  /** The Crow's perch of the start town, in a dead end and facing the street. */
  | { kind: "perch"; x: number; y: number; facing: Facing }
  /** A gate on a street cell that shuts off a pocket with chests; `axis` is the way through it. */
  | { kind: "cage"; x: number; y: number; axis: "x" | "y" }
  /** A cell inside a cage where a guard stands; `monsters` are the old monster ids it may be. */
  | { kind: "guard"; x: number; y: number; monsters: number[] }
  /**
   * The way into a castle's treasure vault (a 2 x 2 chamber in the corner of a hall): a gate that asks before it opens (`how` "gate"), a locked
   * door that asks whether to break it (`door`), or no opening at all but a wall that gives way to a perceptive party (`wall`; then the cell is solid).
   * `axis` is the way through it.
   */
  | { kind: "vault_way"; x: number; y: number; axis: "x" | "y"; how: "gate" | "door" | "wall" }
  /** The chest of a vault; `main` is the vault farthest from the way in, with the hoard of the boss's room. */
  | { kind: "vault_chest"; x: number; y: number; main: boolean }
  /** A guard of a vault; `boss` for the one in the main vault. */
  | { kind: "vault_guard"; x: number; y: number; boss: boolean };

export interface InteriorTheme {
  id: string;
  /** Texture keys; the renderer maps them to files (`tex_<key>`). */
  wall: string;
  floor: string;
  ceiling: string | null;
  door: string;
  fog: { color: string; density: number };
  ambient: string;
  /** Sound zone of the old sound.py (1 town, 3 dungeon, 4 castle, 5 cyber, 6 cave). */
  music: number;
  /** Weighted monster families used by the spawn rules. */
  monsterThemes: Record<string, number>;
  lootLevelBias: number;
  /** True when the player sees sky (towns). */
  open: boolean;
}

/**
 * The dungeon theme a cave or dungeon was generated for (`data/dungeon-themes.ts`) and how it takes part in the key chain: the quest
 * item types its entrance asks for and the ones hidden inside.
 */
export interface DungeonRef {
  /** `DungeonTheme.id`. */
  id: string;
  klass: "A" | "B" | "C";
  /** Quest item type the entrance asks for (a key or a key card), or null for a free place. */
  requires: string | null;
  /** Quest item types hidden inside: keys in a Class A place, at most one key card in a Class B place. */
  gives: string[];
  /** Themes whose quest needs a big hall (the picture, the field, the ring, the row of heads): the room the generator set aside for it. */
  hall?: { x: number; y: number; w: number; h: number };
  /** The picture riddle: the number the walls of the hall draw (what the statue wants to be told). */
  glyph?: string;
}

export interface InteriorMap {
  kind: InteriorKind;
  /** Stable key, also used for save deltas: `<poi id>:<floor>`. */
  key: string;
  width: number;
  height: number;
  cells: Uint8Array;
  rooms: Room[];
  /** Per cell: room id, or -1 for corridors and streets. */
  roomOf: Int16Array;
  /** Floor cell that triggers the exit transfer. */
  exit: { x: number; y: number };
  /** Cell the party appears on, facing away from the exit wall. */
  spawn: { x: number; y: number; facing: Facing };
  /** Town building lots; empty for other kinds. */
  lots: Lot[];
  /** Towns: the cells for talent sellers, chests, fountains and decoration. */
  sites?: TownSite[];
  /** The old towns have no square; kept for maps that have one. */
  plaza?: { x: number; y: number; w: number; h: number };
  theme: InteriorTheme;
  tier: number;
  /** Cells with four pillars standing at their corners (floor, drawn with the model of the old fortress block 40). Absent where there are none. */
  pillars?: { x: number; y: number }[];
  /** Caves and dungeons of the generated world: the theme they were built for. Absent in towns, castles and the campaign. */
  dungeon?: DungeonRef;
  /** Castles of the generated world: the kind of castle, which decides its banner and its monsters (`data/castles.ts`). */
  castle?: { alignment: Alignment };
  /** Optional per-cell look. `cell` holds, per cell, an index into `list`; generated maps do not use it. */
  styles?: { list: CellStyle[]; cell: Uint8Array };
}

export function cellIndex(map: { width: number }, x: number, y: number): number {
  return y * map.width + x;
}

export function inBounds(map: { width: number; height: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function isFloor(map: InteriorMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && map.cells[y * map.width + x] === CELL.FLOOR;
}
