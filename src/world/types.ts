/** Shared world constants and tile vocabulary. Pure data, no DOM, no Babylon. */

/**
 * Tiles per chunk side. Ten, because every world is a multiple of ten wide and high (70, 100, 140, 200, 210, 280, 300, 400) and a world is a globe: the chunk grid
 * must fit it exactly, so that a chunk on one side of the seam is the chunk beside it on the other.
 */
export const CHUNK_SIZE = 10;
/** World units per tile (the old game used 3 as well, so model scales carry over). */
export const TILE_SIZE = 3;

export const BIOME = {
  MEADOW: 0,
  FOREST: 1,
  DESERT: 2,
  SNOW: 3,
  SWAMP: 4,
  LAVA: 5,
  OCEAN: 6,
} as const;
export type Biome = (typeof BIOME)[keyof typeof BIOME];
export const BIOME_NAMES = ["meadow", "forest", "desert", "snow", "swamp", "lava", "ocean"] as const;

export const GROUND = {
  LAND: 0,
  WATER: 1, // deep water or ocean, blocks movement
  SHALLOW: 2, // ford or marsh, walkable
  MOUNTAIN: 3, // blocks movement
  ROAD: 4,
  BRIDGE: 5, // road over water
  PASS: 6, // road through mountains
  // 8 and 9 were the walkable yard and the gate tile of the walled POIs of generator version 1
  POI_BLOCK: 7, // footprint of a town, castle, dungeon entrance or cave: blocks movement, walking into it asks to enter
  LAVA_POOL: 10, // blocks movement
} as const;
export type Ground = (typeof GROUND)[keyof typeof GROUND];

export const DECO = {
  NONE: 0,
  TREE: 1, // blocks movement
  // 2 was the grey boulder of the first overworld; removed on request, the number stays free so that no other value moves
  BUSH: 3,
  TUFT: 4,
  /** A well, hut, caravan, fountain or stone head of the old outside map: decoration that blocks movement. */
  LANDMARK: 5,
} as const;
export type Deco = (typeof DECO)[keyof typeof DECO];

export type PoiKind = "town" | "castle" | "dungeon" | "cave";

/**
 * The sizes of a world, which is a group of islands in deep water that wraps round like a globe: swim off the north edge and the party comes in at
 * the south, the same east and west. Small is 100 tiles wide and 70 high (a world is always wider than it is high, as the old outside map), the others are twice, three and four times that on each side. `towns` is the number of
 * towns per level (tier): one for each of the five levels on a small world, then two, three and four.
 */
export type WorldSize = "small" | "default" | "large" | "huge";
export const WORLD_SIZES: Record<WorldSize, { label: string; width: number; height: number; towns: number }> = {
  small: { label: "Small", width: 100, height: 70, towns: 1 },
  default: { label: "Default", width: 200, height: 140, towns: 2 },
  large: { label: "Large", width: 300, height: 210, towns: 3 },
  huge: { label: "Huge", width: 400, height: 280, towns: 4 },
};
export const WORLD_SIZE_NAMES = Object.keys(WORLD_SIZES) as WorldSize[];
export const DEFAULT_WORLD_SIZE: WorldSize = "default";
/** Deep water the world keeps free on every side: swimming across the seam is at least twice this much open sea. */
export const SEA_MARGIN = 3;

export function parseWorldSize(text: string | null | undefined): WorldSize {
  return WORLD_SIZE_NAMES.find((n) => n === text) ?? DEFAULT_WORLD_SIZE;
}

/** Side of a POI, as a compass direction (grid y grows south). */
export type PoiSide = "N" | "E" | "S" | "W";
export const SIDE_DELTA: Readonly<Record<PoiSide, { dx: number; dy: number }>> = { N: { dx: 0, dy: -1 }, E: { dx: 1, dy: 0 }, S: { dx: 0, dy: 1 }, W: { dx: -1, dy: 0 } };

export interface Poi {
  /** Stable id, also the key of save deltas: `p:<island>:0:<index>` (`region` is the island and 0). */
  id: string;
  kind: PoiKind;
  name: string;
  /** Centre tile of the footprint (the lower right of the middle four for an even size); every footprint tile is `POI_BLOCK`. */
  x: number;
  y: number;
  /**
   * Edge length of the footprint in tiles: 2 for a town or castle, 1 for a dungeon entrance or cave, 3 for a pyramid (a dungeon that asks for a
   * key card). The model on it is scaled to fill it. Set once the plan of the region is known, which is what makes a dungeon a pyramid.
   */
  size: number;
  /**
   * The side with the entrance: the one the model faces and every road of the place ends at, so that no road stops at a wall. Fixed when the
   * region is planned (it faces the road the place hangs on), never read off the roads.
   */
  side: PoiSide;
  /** `rx` is the index of the island the place stands on, `ry` is 0 (what was a region of the endless world is an island now). */
  region: { rx: number; ry: number };
  anchor: boolean;
  /** Difficulty tier 1..5: the level of the island it stands on. */
  tier: number;
  /** Biome at the centre, used for interior themes. */
  biome: Biome;
}

export interface TileInfo {
  biome: Biome;
  ground: Ground;
  deco: Deco;
  /** Raw elevation 0..65535, used for terrain heights and for rendering. */
  elevation: number;
  /** Index into `World.poisNear` result is not stable; use the POI id instead. */
  poiId: string | null;
}

/** The tiles a place stands on, both ends inclusive. */
export function poiBounds(p: Pick<Poi, "x" | "y" | "size">): { x0: number; y0: number; x1: number; y1: number } {
  const low = Math.floor(p.size / 2);
  return { x0: p.x - low, y0: p.y - low, x1: p.x - low + p.size - 1, y1: p.y - low + p.size - 1 };
}

/**
 * The tiles in front of a place that count as its entrance, the one the road ends at first. The model stands in the middle of its footprint, so
 * a footprint of two tiles has two tiles in front of its door (the model's door is between them) and both lead in; one of three has only the
 * middle one, a single tile only its own.
 */
export function poiEntrances(p: Pick<Poi, "x" | "y" | "size" | "side">): { x: number; y: number }[] {
  const b = poiBounds(p);
  const { dx, dy } = SIDE_DELTA[p.side];
  const front = { x: dx === 0 ? p.x : dx > 0 ? b.x1 + 1 : b.x0 - 1, y: dy === 0 ? p.y : dy > 0 ? b.y1 + 1 : b.y0 - 1 };
  if (p.size % 2 !== 0) return [front];
  return [front, dx === 0 ? { x: p.x - 1, y: front.y } : { x: front.x, y: p.y - 1 }];
}

export function isGroundWalkable(g: Ground): boolean {
  return (
    g === GROUND.LAND ||
    g === GROUND.SHALLOW ||
    g === GROUND.ROAD ||
    g === GROUND.BRIDGE ||
    g === GROUND.PASS
  );
}

export function isTileWalkable(t: { ground: Ground; deco: Deco }): boolean {
  return isGroundWalkable(t.ground) && t.deco !== DECO.TREE && t.deco !== DECO.LANDMARK;
}

export function chunkOf(t: number): number {
  return Math.floor(t / CHUNK_SIZE);
}

/** `t` brought into 0..size-1: the world is a globe, tile -1 is the last one. */
export function wrap(t: number, size: number): number {
  return ((t % size) + size) % size;
}

/** The shortest way from `a` to `b` round a globe of `size` tiles, negative when west or north. */
export function wrapDelta(a: number, b: number, size: number): number {
  const d = wrap(b - a, size);
  return d > size / 2 ? d - size : d;
}
