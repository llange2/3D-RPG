import { fbm2, hash2, ONE, permille, valueNoise2 } from "../core/noise";
import { derive, LAYER, rngFor, seedFromString, type SeedState } from "../core/rng";
import { placeName } from "../data/names";
import { OVERWORLD_THEMES } from "../data/overworld-themes";
import { planPlaces } from "../interiors/dungeonPlan";
import { FIELD_UNIT, ISLAND_EDGE, buildLayout, fieldAt, isqrt, tierOn, wrapDist2, type Island, type Layout } from "./islands";
import { roadThrough, type Pt, type RoadSeg } from "./roads";
import {
  BIOME,
  CHUNK_SIZE,
  DECO,
  DEFAULT_WORLD_SIZE,
  GROUND,
  SIDE_DELTA,
  WORLD_SIZES,
  poiBounds,
  poiEntrances,
  isTileWalkable,
  wrap,
  wrapDelta,
  type Biome,
  type Deco,
  type Ground,
  type Poi,
  type PoiKind,
  type PoiSide,
  type TileInfo,
  type WorldSize,
} from "./types";

export type { PoiSide } from "./types";

/** Elevation thresholds on the 0..65535 scale. */
// Land lies between the two: `SEA_LEVEL` is the coast, the mountains stand on top of the land by their own ridge noise.
export const SEA_LEVEL = 22800;
// p90 was 43500; the old outside map is a fifth mountains (and a tenth woods) on its land, the generated world had a fortieth
export const MOUNTAIN_LEVEL = 40000;

/**
 * Footprint of a POI, in tiles per side. The old game drew every place on its outside map as one object on a single cell (the Village at
 * scale 1.8 x 2.5 x 1.8, the Castle, the Dungeon and Cave entrance are each about one cell, 3 units, wide); here a town and a castle are twice
 * that (2 x 2 tiles) and a pyramid three times (3 x 3, set when the plan of the island makes a dungeon a pyramid), so that they look like places
 * and not like props. Their models are scaled up to fill the tiles.
 */
const POI_SIZE: Record<PoiKind, number> = { town: 2, castle: 2, dungeon: 1, cave: 1 };
const PYRAMID_SIZE = 3;

const SIDES: readonly { side: PoiSide; dx: number; dy: number }[] = [
  { side: "S", dx: 0, dy: 1 },
  { side: "E", dx: 1, dy: 0 },
  { side: "W", dx: -1, dy: 0 },
  { side: "N", dx: 0, dy: -1 },
];

/**
 * The side of a place that faces its visitors, and the tile in front of its middle (the one the road ends at). The old outside map puts the
 * "enter" action on the cell in front of the object (Fountain Head: Village on 93/61, entrance on 93/60), so the party never has to walk into
 * the object. The side is fixed with the place (`Poi.side`), every road of the place ends there; a place two tiles wide has a second entrance tile
 * beside this one (`poiEntrances`).
 */
export function poiFront(poi: Poi): { side: PoiSide; x: number; y: number } {
  const [front] = poiEntrances(poi);
  return { side: poi.side, x: front!.x, y: front!.y };
}
/** Tiles of walkable ground around a spot that count as "open" (`World.isOpenGround`): a pocket in the trees is far smaller, a meadow far larger. */
const OPEN_GROUND = 300;
/** A landmark counts as reachable when the party can walk from a tile beside it to a road or across this many tiles of open ground. */
const LANDMARK_GROUND = 1000;
const NEIGHBOURS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const AROUND: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** Land that makes the water beside it a shore (shallow): a bridge counts, so the party may step off it; mountains and lava do not. */
const SHORE_LAND: ReadonlySet<Ground> = new Set([GROUND.LAND, GROUND.ROAD, GROUND.PASS, GROUND.BRIDGE, GROUND.POI_BLOCK]);
/**
 * Tiles around a place that are cleared of water, mountains and trees (the footprint comes on top): two, so that a place on a speck of land
 * in the sea is an island the party can walk round, with the shore (shallow water) outside it.
 */
const FLATTEN = 2;
/**
 * Light vegetation near the ways: within `VEG_NEAR` tiles of a road or a place the trees stand on a loose lattice (at least two free tiles
 * between any two), out to `VEG_FAR` the old woods thin out step by step. Further away woods and mountains stay as thick as the noise makes them,
 * they are the walls between the ways. Distances are Chebyshev, to the nearest road tile or footprint.
 */
const VEG_NEAR = 2;
const VEG_FAR = 6;
/** Permille of the lattice slots near the ways that hold a tree, by biome (a desert has few, a lava land none). */
const NEAR_TREE: Record<number, number> = { [BIOME.MEADOW]: 450, [BIOME.FOREST]: 800, [BIOME.DESERT]: 250, [BIOME.SNOW]: 600, [BIOME.SWAMP]: 650, [BIOME.LAVA]: 0, [BIOME.OCEAN]: 0 };
/** Side of a cell of the lattice; a slot lies in the top left 2 x 2 tiles of its cell, so two trees are at least three tiles apart in x or y. */
const LATTICE = 4;
/** Permille of the land tiles that hold a landmark (the finished strip of the old outside map has wells, huts, caravans and stone heads on about one tile in 40). */
const LANDMARK_PERMILLE = 9;
/**
 * Woods: a large-scale noise (about 56 tiles) that turns a stretch of land into a forest with a share of its tiles blocked by trees,
 * like the forest tiles that fill whole blocks of the old outside map. `WOOD_EDGE` is where a wood starts, it is at its densest
 * `WOOD_SPAN` above that. The densest part blocks nearly every tile, like the solid forest blocks of the old outside map (block 23 is an obstacle): the way through is a road.
 */
/**
 * Mountain ranges that do not depend on the height of the land: a noise of about 32 tiles, the top tenth of it, makes ranges everywhere.
 */
const RIDGE_LEVEL = 44500;
/** Size of the ranges in tiles: an island holds several of them, so that most islands have some mountains and none is all mountain. */
const RIDGE_PERIOD = 20;
/** Size (tiles) and strength of the unevenness that breaks the ranges into lumps, see `lump`. Measured so that about a tenth of the land stays mountain. */
const LUMP_PERIOD = 6;
const LUMP_AMPLITUDE = 14000;
const WOOD_EDGE = 34500;
const WOOD_SPAN = 5500;
const WOOD_MAX = 850;
/** How much of a wood each biome grows, in permille (a desert has oases, a lava land nothing). */
const WOOD_BY_BIOME: Record<number, number> = { [BIOME.MEADOW]: 1000, [BIOME.FOREST]: 1000, [BIOME.DESERT]: 200, [BIOME.SNOW]: 900, [BIOME.SWAMP]: 800, [BIOME.LAVA]: 0, [BIOME.OCEAN]: 0 };

/**
 * One place for every 60 tiles of an island. The old outside map has 22 places on 12'700 tiles (a village, castle, dungeon entrance or cave every
 * 10 tiles or so; one in 54 tiles of the land of its finished strip): the places are dense, the sea between them is not.
 */
const LAND_PER_PLACE = 60;
const MIN_PLACE_DISTANCE = 6;
/** Distance (Chebyshev) from a town inside which no other place is built. */
const TOWN_CLEARANCE = 6;
/** A place keeps this many tiles of land round it (no coast within reach of the cleared ground), so that it stands on the island and not on a spit. */
const COAST_MARGIN = 2;
/** A place prefers this many tiles of land round it: the ground it clears (`FLATTEN`) then takes no sea, so the channel to the next island keeps its deep tile. */
const PLACE_ROOM = 3;
/** The towns of the start island aim at the land that reaches within this many tiles of the farthest point along the axis (the land search finds the ground). */
const START_END_BAND = 8;
/** Places closer than this (Manhattan) that the road tree does not join get a second road with a chance of 50 %. */
const LOOP_DISTANCE = 14;
const LOOP_PERMILLE = 350;
/** How far (tiles) `nearestBiome` looks for land before it goes by the middles of the islands. */
const NEAREST_LAND = 8;
/** The land rises from the coast to its full height over this many tiles. */
const RISE_TILES = 6;
/** An inland water this many tiles wide or less is shallow throughout (see `narrowInland`). */
const NARROW_WATER = 3;
/** The mountain ring of a lava island: two tiles deep along the coast, with a way in that is six tiles wide and looked for out to six tiles from the sea. */
const RING = { NONE: 0, WALL: 1, WAY: 2 } as const;
const RING_DEPTH = 2;
const RING_WAY_DEPTH = 6;
const RING_WAY_WIDTH = 3;
/** The rivers of an island by climate (none on desert and lava): distance between them, width and the noise level above which a stretch is shallow. */
const RIVERS: Partial<Record<number, { period: number; band: number; ford: number }>> = {
  [BIOME.MEADOW]: { period: 56, band: 750, ford: 52000 },
  [BIOME.FOREST]: { period: 64, band: 600, ford: 52000 },
  [BIOME.SNOW]: { period: 80, band: 350, ford: 50000 },
  [BIOME.SWAMP]: { period: 28, band: 1700, ford: 42000 },
};
/** Size of a cell of the index that finds the islands near a tile. */
const INDEX_CELL = 16;

export interface ChunkData {
  cx: number;
  cy: number;
  biome: Uint8Array;
  ground: Uint8Array;
  deco: Uint8Array;
  elevation: Uint16Array;
  /** POI footprints (with flatten margin) that touch this chunk, at the position they have beside it (a place across the seam is shifted by the width of the world). */
  pois: Poi[];
}

/** The tiles a place stands on, and whether the road being laid is one of its own (it ends at the place's door). */
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  own: boolean;
}

/** The places of an island and the roads between them. */
interface RegionPlan {
  pois: Poi[];
  connectors: RoadSeg[];
}

/** An island as the rest of the game sees it: its places and roads (what was a region of the endless world). */
export interface RegionData {
  rx: number;
  ry: number;
  pois: Poi[];
  roads: RoadSeg[];
}

interface BaseTile {
  biome: Biome;
  /** Climate biome of the island, used to pick POI themes. */
  landBiome: Biome;
  ground: Ground;
  deco: Deco;
  elevation: number;
}

function toInt(seed: SeedState): number {
  return seed[0] | 0;
}

export class World {
  readonly seedText: string;
  readonly size: WorldSize;
  /** Tiles across and down; the world is a globe, tile `width` is tile 0 again. */
  readonly width: number;
  readonly height: number;
  private readonly seed: SeedState;
  private readonly layout: Layout;
  private readonly sShape: number;
  private readonly sWarpX: number;
  private readonly sWarpY: number;
  private readonly sRiver: number;
  private readonly sFord: number;
  private readonly sDeco: number;
  private readonly sClump: number;
  private readonly sWoods: number;
  private readonly sRidge: number;
  private readonly sLump: number;
  private readonly sLava: number;
  private readonly sLattice: number;
  private readonly sThin: number;
  /** Indices of the islands that can reach a cell of `INDEX_CELL` x `INDEX_CELL` tiles. */
  private readonly islandIndex: number[][] = [];
  private readonly indexColumns: number;
  /** Chunks across and down (the world is an exact number of chunks). */
  readonly chunksAcross: number;
  readonly chunksDown: number;
  private planned = false;
  private plans: RegionPlan[] = [];
  private poiList: Poi[] = [];
  private readonly poiMap = new Map<string, Poi>();
  private readonly flatElevation = new Map<string, number>();
  /** Per chunk (row * chunksAcross + column): the road pieces within reach of it and the places near it, so a tile does not look at all of them. */
  private chunkRoads: RoadSeg[][] = [];
  private chunkPois: Poi[][] = [];

  constructor(seedText: string, size: WorldSize = DEFAULT_WORLD_SIZE) {
    this.seedText = seedText;
    this.size = size;
    this.width = WORLD_SIZES[size].width;
    this.height = WORLD_SIZES[size].height;
    this.chunksAcross = this.width / CHUNK_SIZE;
    this.chunksDown = this.height / CHUNK_SIZE;
    this.seed = seedFromString(seedText);
    const t = (name: string) => toInt(derive(this.seed, LAYER.TERRAIN, name));
    this.sShape = t("shape");
    this.sWarpX = t("warpx");
    this.sWarpY = t("warpy");
    this.sRiver = t("river");
    this.sFord = t("ford");
    this.sDeco = toInt(derive(this.seed, LAYER.PROPS, "deco"));
    this.sClump = toInt(derive(this.seed, LAYER.PROPS, "clump"));
    this.sWoods = toInt(derive(this.seed, LAYER.PROPS, "woods"));
    this.sRidge = t("ridge");
    this.sLump = t("lump");
    this.sLava = t("lava");
    this.sLattice = toInt(derive(this.seed, LAYER.PROPS, "lattice"));
    this.sThin = toInt(derive(this.seed, LAYER.PROPS, "thin"));
    this.layout = buildLayout(this.seed, size);
    this.indexColumns = Math.ceil(this.width / INDEX_CELL);
    const rows = Math.ceil(this.height / INDEX_CELL);
    for (let i = 0; i < this.indexColumns * rows; i++) this.islandIndex.push([]);
    for (const isl of this.layout.islands) {
      // every cell the box of the island touches (stepping by a cell from the corner would skip one when the box is narrower than a cell)
      for (let y = isl.y - isl.reach; y <= isl.y + isl.reach; y++) {
        for (let x = isl.x - isl.reach; x <= isl.x + isl.reach; x++) {
          const cell = Math.floor(wrap(y, this.height) / INDEX_CELL) * this.indexColumns + Math.floor(wrap(x, this.width) / INDEX_CELL);
          const list = this.islandIndex[cell]!;
          if (!list.includes(isl.index)) list.push(isl.index);
        }
      }
    }
  }

  get rootSeed(): SeedState {
    return this.seed;
  }

  /** The islands of the world, the start island first. */
  get islands(): readonly Island[] {
    return this.layout.islands;
  }

  /** A tile coordinate brought into the world: the world is a globe, west of tile 0 lies the last tile. */
  wrapX(x: number): number {
    return wrap(x, this.width);
  }
  wrapY(y: number): number {
    return wrap(y, this.height);
  }

  // ---------------------------------------------------------------- the islands and their terrain

  /**
   * The island a tile belongs to and how far inside its coast the tile lies (Q8, in 1/256 tiles; above 0 is land): a lookup in the raster of the island,
   * whose shape (ellipses, a triangle, a bay, warped and roughened) is made once by `buildLayout`.
   */
  private landAt(x: number, y: number): { island: Island; field: number } | null {
    const list = this.islandIndex[Math.floor(y / INDEX_CELL) * this.indexColumns + Math.floor(x / INDEX_CELL)]!;
    let best: { island: Island; field: number } | null = null;
    for (const index of list) {
      const isl = this.layout.islands[index]!;
      const field = fieldAt(isl, wrapDelta(isl.x, x, this.width), wrapDelta(isl.y, y, this.height));
      if (field > 0 && (!best || field > best.field)) best = { island: isl, field };
    }
    return best;
  }

  /** The island whose land this tile belongs to (before roads and places are laid), null at sea. */
  islandAt(x: number, y: number): Island | null {
    return this.landAt(this.wrapX(x), this.wrapY(y))?.island ?? null;
  }

  /** Is this tile (canonical) part of an island, before roads and places are laid? */
  private isLand(x: number, y: number): boolean {
    return this.landAt(x, y) !== null;
  }

  /**
   * The level of the nearest island at this spot: what a wild monster there is built for (the sea belongs to the island nearest to it). The
   * start island is level 1 on one side of its middle and level 2 on the other.
   */
  tierAt(x: number, y: number): number {
    const cx = this.wrapX(x);
    const cy = this.wrapY(y);
    const here = this.landAt(cx, cy);
    if (here) return tierOn(here.island, cx, cy, this.width, this.height);
    // at sea: the island whose coast is nearest (the distance to the middle less its radius; the islands differ a lot in size)
    let best = this.layout.islands[0]!;
    let bestD = Infinity;
    for (const isl of this.layout.islands) {
      const d = isqrt(wrapDist2(cx, cy, isl.x, isl.y, this.width, this.height)) - ((isl.r + isl.reach) >> 1);
      if (d < bestD) {
        best = isl;
        bestD = d;
      }
    }
    return tierOn(best, cx, cy, this.width, this.height);
  }

  /** Terrain without roads and POIs. Pure function of (seed, tx, ty), `tx` and `ty` inside the world. */
  baseTile(tx: number, ty: number): BaseTile {
    const here = this.landAt(tx, ty);
    if (!here) {
      return { biome: BIOME.OCEAN, landBiome: BIOME.MEADOW, ground: GROUND.WATER, deco: DECO.NONE, elevation: 12000 };
    }
    const landBiome = here.island.biome;
    // the land rises from the coast to a fifth of the way up to the mountains, over six tiles
    let elevation = SEA_LEVEL + 1 + Math.floor((Math.min(ONE, Math.floor((here.field * ONE) / (RISE_TILES * FIELD_UNIT))) * 9000) / ONE);

    let ground: Ground = GROUND.LAND;
    const ridge = fbm2(this.sRidge, tx, ty, RIDGE_PERIOD, 2);
    const lump = this.lump(tx, ty);
    const ring = this.coastRing(here.island, tx, ty);
    const rock = ring === RING.WALL || (ring !== RING.WAY && ridge + lump > RIDGE_LEVEL);
    // a mountain whose core lies more than two tiles from open ground is a hollow: its range stays a wall of at most four tiles
    if (ring === RING.WALL) {
      ground = GROUND.MOUNTAIN;
      elevation = MOUNTAIN_LEVEL + 1 + 2000;
    } else if (rock && this.insideMass(tx, ty)) {
      elevation = Math.min(elevation, MOUNTAIN_LEVEL);
    } else if (rock) {
      ground = GROUND.MOUNTAIN;
      elevation = MOUNTAIN_LEVEL + 1 + (ridge + lump - RIDGE_LEVEL);
    } else {
      ground = this.riverGround(tx, ty, landBiome, elevation);
    }

    if (ground === GROUND.LAND && landBiome === BIOME.LAVA && ring !== RING.WAY && valueNoise2(this.sLava, tx, ty, 14) > 52500) {
      ground = GROUND.LAVA_POOL;
    }

    const deco = ground === GROUND.LAND ? this.decoAt(tx, ty, landBiome, 0) : DECO.NONE;
    return { biome: landBiome, landBiome, ground, deco, elevation };
  }

  /**
   * The mountain ring of a lava island (the user's rule, 22nd playtest: the lava island of the old outside map is surrounded by mountains, but the way in
   * must never be shut). Tiles within two of the sea are `RING.WALL`; a strip about six tiles wide from the middle of the island out through the coast, in
   * the direction of `Island.entry`, is `RING.WAY`: no mountain, no lava, so that the party can walk from the shore into the island. Other climates have no ring.
   */
  private coastRing(isl: Island, x: number, y: number): number {
    if (isl.biome !== BIOME.LAVA) return RING.NONE;
    const dx = wrapDelta(isl.x, x, this.width);
    const dy = wrapDelta(isl.y, y, this.height);
    let sea = RING_WAY_DEPTH + 1;
    for (let k = 1; k < sea; k++) {
      for (const [ax, ay] of AROUND) {
        if (fieldAt(isl, dx + ax * k, dy + ay * k) <= 0) {
          sea = k;
          break;
        }
      }
    }
    if (sea > RING_WAY_DEPTH) return RING.NONE;
    const along = dx * isl.entry.x + dy * isl.entry.y;
    const across = Math.abs(dx * isl.entry.y - dy * isl.entry.x);
    if (along > 0 && across <= RING_WAY_WIDTH * 1024) return RING.WAY;
    return sea <= RING_DEPTH ? RING.WALL : RING.NONE;
  }

  /** Would this tile be a mountain before the ranges are thinned out? Same test as `baseTile`, without the coast and river. */
  private rawMountain(tx: number, ty: number): boolean {
    const x = this.wrapX(tx);
    const y = this.wrapY(ty);
    const here = this.landAt(x, y);
    if (!here) return false;
    const ring = this.coastRing(here.island, x, y);
    if (ring !== RING.NONE) return ring === RING.WALL;
    return fbm2(this.sRidge, x, y, RIDGE_PERIOD, 2) + this.lump(x, y) > RIDGE_LEVEL;
  }

  /**
   * Small-scale unevenness (about six tiles) added to the heights that decide where mountains stand. A massif the size of an island breaks
   * into lumps of a few tiles with open ground between, instead of one block that is impassable for fifty tiles.
   */
  private lump(tx: number, ty: number): number {
    return Math.floor(((valueNoise2(this.sLump, tx, ty, LUMP_PERIOD) - 32768) * LUMP_AMPLITUDE) / 32768);
  }

  /**
   * True for a mountain tile with mountain two tiles away in every direction: the middle of a range thicker than four tiles. Those
   * tiles are left open (a highland between two walls) so that a road across a range is a pass of four tiles at most, never the
   * thirty-tile corridor a continent-sized massif made. A pure function of the coordinates, like the rest of the terrain.
   */
  private insideMass(tx: number, ty: number): boolean {
    return this.rawMountain(tx - 2, ty) && this.rawMountain(tx + 2, ty) && this.rawMountain(tx, ty - 2) && this.rawMountain(tx, ty + 2);
  }

  /**
   * The rivers of an island, by climate (22nd playtest): the old outside map has them on the meadow island and the swamp, but not on lava (where a
   * "river" would be a lava stream, which the user did not want). `period` is the distance between two rivers, `band` how wide they are, `ford` the
   * noise level above which a stretch of river is shallow.
   */
  private riverGround(tx: number, ty: number, biome: Biome, elevation: number): Ground {
    if (elevation < SEA_LEVEL + 4000) return GROUND.LAND;
    const river = RIVERS[biome];
    if (!river) return GROUND.LAND;
    const wx = tx + Math.floor(((fbm2(this.sWarpX, tx, ty, 64, 3) - 32768) * 40) / 32768);
    const wy = ty + Math.floor(((fbm2(this.sWarpY, tx, ty, 64, 3) - 32768) * 40) / 32768);
    const n = fbm2(this.sRiver, wx, wy, river.period, 2);
    // here and there the river swells into a pond (up to three times as wide), which is where deep water in the middle stays
    const swell = 1000 + Math.floor((valueNoise2(this.sFord + 7, tx, ty, 26) * 2000) / ONE);
    if (Math.abs(n - 32768) >= Math.floor((river.band * swell) / 1000)) return GROUND.LAND;
    return valueNoise2(this.sFord, tx, ty, 20) > river.ford ? GROUND.SHALLOW : GROUND.WATER;
  }

  private decoAt(tx: number, ty: number, biome: Biome, startWeight: number): Deco {
    const d = OVERWORLD_THEMES[biome].deco;
    const p = permille(hash2(this.sDeco, tx, ty));
    const clump = valueNoise2(this.sClump, tx, ty, 10);
    const keep = ONE - startWeight; // no solid obstacles inside the start area
    // trees stand in groves like the forest tiles of the old outside map: the clump noise squared (and capped at twice the
    // density) leaves meadows between thick woods instead of sprinkling single trees over everything
    const grove = Math.min(2 * ONE, Math.floor((3 * clump * clump) / ONE));
    const scatter = Math.floor((d.tree * grove) / ONE);
    const wood = Math.max(0, Math.min(WOOD_MAX, Math.floor(((fbm2(this.sWoods, tx, ty, 56, 2) - WOOD_EDGE) * WOOD_MAX) / WOOD_SPAN)));
    const tree = Math.floor((Math.max(scatter, Math.floor((wood * (WOOD_BY_BIOME[biome] ?? 0)) / 1000)) * keep) / ONE);
    if (p < tree) return DECO.TREE;
    if (p < tree + d.bush) return DECO.BUSH;
    if (p < tree + d.bush + d.tuft) return DECO.TUFT;
    if (p < tree + d.bush + d.tuft + Math.floor((LANDMARK_PERMILLE * keep) / ONE)) return DECO.LANDMARK;
    return DECO.NONE;
  }

  // ---------------------------------------------------------------- islands, POIs, roads

  private poiKind(rng: ReturnType<typeof rngFor>, biome: Biome): PoiKind {
    // the towns of a world are placed by level (`Island.towns`); what the dice add are the other places
    const table = OVERWORLD_THEMES[biome === BIOME.OCEAN ? BIOME.MEADOW : biome].poi.secondary;
    const kinds = (Object.keys(table) as PoiKind[]).filter((k) => k !== "town");
    return kinds[rng.weightedIndex(kinds.map((k) => table[k]))]!;
  }

  private makePoi(island: Island, index: number, x: number, y: number, kind: PoiKind, anchor: boolean, name?: string): Poi {
    const nameRng = rngFor(this.seed, LAYER.POI, island.index, 0, index, "name");
    return {
      id: `p:${island.index}:0:${index}`,
      kind,
      name: name ?? placeName(nameRng, kind),
      x,
      y,
      size: POI_SIZE[kind],
      // an anchor faces a random side; the other places turn to the place their road hangs on once the island is planned (`plan`)
      side: SIDES[rngFor(this.seed, LAYER.POI, island.index, 0, index, "side").int(4)]!.side,
      region: { rx: island.index, ry: 0 },
      anchor,
      tier: tierOn(island, x, y, this.width, this.height),
      biome: island.biome,
    };
  }

  /**
   * Is the ground at (x, y), `margin` tiles in every direction, land of the island (no coast, no sea within the cleared ring of a place)? A town
   * may not stand where the party could not walk round it either.
   */
  private landAround(x: number, y: number, margin: number, island: Island): boolean {
    // the islands do not overlap, so a tile is the island's if its own raster says so
    const cx = wrapDelta(island.x, x, this.width);
    const cy = wrapDelta(island.y, y, this.height);
    for (let dy = -margin; dy <= margin; dy++) for (let dx = -margin; dx <= margin; dx++) if (fieldAt(island, cx + dx, cy + dy) <= 0) return false;
    return true;
  }

  /**
   * May a place stand here? The ground it clears (`FLATTEN` round its footprint, a pyramid being the widest) must stay off the two rows of sea along every
   * edge of the world: clearing turns sea into land, and the user wants at least two tiles of water at the edge.
   */
  private edgeSafe(x: number, y: number): boolean {
    const m = ISLAND_EDGE + FLATTEN + 2;
    return x >= m && x <= this.width - 1 - m && y >= m && y <= this.height - 1 - m;
  }

  /** Spiral search for a plain land tile inside the box that has `margin` tiles of land round it; null if there is none within `radius`. */
  private findLand(island: Island, cx: number, cy: number, radius: number, minX: number, minY: number, maxX: number, maxY: number, margin = COAST_MARGIN, accept?: (x: number, y: number) => boolean): { x: number; y: number } | null {
    for (let r = 0; r <= radius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < minX || x > maxX || y < minY || y > maxY) continue;
          if (!this.edgeSafe(x, y)) continue;
          if (fieldAt(island, wrapDelta(island.x, x, this.width), wrapDelta(island.y, y, this.height)) <= 0) continue; // the box of an island may hold a small island of its own (in a bay)
          if (this.baseTile(this.wrapX(x), this.wrapY(y)).ground !== GROUND.LAND) continue;
          if (margin > 0 && !this.landAround(x, y, margin, island)) continue;
          if (accept && !accept(x, y)) continue;
          return { x, y };
        }
      }
    }
    return null;
  }

  /** The places of an island: its towns first, the first of them the anchor (index 0), then a place in about half of the cells of a grid laid over the island. */
  private placesOf(isl: Island): Poi[] {
    const pois: Poi[] = [];
    const box = { x0: isl.x - isl.reach, y0: isl.y - isl.reach, x1: isl.x + isl.reach, y1: isl.y + isl.reach };
    const near = (x: number, y: number, gap: number): boolean => pois.some((p) => Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) < gap);
    const twoLevels = isl.tiers.length > 1;
    for (let t = 0; t < isl.towns; t++) {
      const rng = rngFor(this.seed, LAYER.POI, isl.index, 0, t, "town");
      const tier = isl.townTiers[t]!;
      // the first town stands to one side of the middle of its island, so that a small island has room for a second place on the other side; the others where there is room
      const spread = Math.max(2, isl.r >> 1);
      const sx = rng.chance(500) ? 1 : -1;
      const eastWest = rng.chance(500);
      let target: { x: number; y: number };
      if (twoLevels) {
        // the start island: the towns of a level stand in the half of that level, at its far end (the level-2 monsters must not roam next to
        // Starthaven); the search for land below moves a target in the sea inwards
        const dir = tier === isl.tiers[0] ? isl.axis : { x: -isl.axis.x, y: -isl.axis.y };
        // the land of the island reaches farthest along the axis in some places only: the targets are the tiles within a few tiles of that reach
        // (the shape of the island is not the shape of its box), one chosen by chance for each town
        const inland: { x: number; y: number; a: number }[] = [];
        let reach = -Infinity;
        for (let dy = isl.box.y0; dy <= isl.box.y1; dy++) {
          for (let dx = isl.box.x0; dx <= isl.box.x1; dx++) {
            if (fieldAt(isl, dx, dy) < COAST_MARGIN * FIELD_UNIT) continue;
            const a = dx * dir.x + dy * dir.y;
            inland.push({ x: dx, y: dy, a });
            reach = Math.max(reach, a);
          }
        }
        const ends = inland.filter((e) => e.a >= reach - START_END_BAND);
        const end = ends[rng.int(Math.max(1, ends.length))];
        target = end ? { x: isl.x + end.x, y: isl.y + end.y } : { x: isl.x + dir.x * spread, y: isl.y + dir.y * spread };
      } else {
        target =
          t === 0
            ? { x: isl.x + (eastWest ? sx * (isl.r >> 1) : rng.range(-1, 1)), y: isl.y + (eastWest ? rng.range(-1, 1) : sx * (isl.r >> 1)) }
            : { x: isl.x + rng.range(-spread, spread), y: isl.y + rng.range(-spread, spread) };
      }
      // a town keeps clear of the other towns, and one of the start island lies well inside the half of its level (two tiles clear of the line between the levels)
      const fits = (x: number, y: number): boolean =>
        !near(x, y, TOWN_CLEARANCE * 2) &&
        (!twoLevels ||
          ([-2, 2].every((k) => tierOn(isl, x + k * isl.axis.x, y + k * isl.axis.y, this.width, this.height) === tier) && tierOn(isl, x, y, this.width, this.height) === tier));
      // the odd shapes of the islands leave less room than a circle: if no spot fits, the rules give way one after the other (never the one that keeps the town on land)
      const spots: [number, (x: number, y: number) => boolean][] = [
        [PLACE_ROOM, fits],
        [COAST_MARGIN, fits],
        [1, fits],
        [0, fits],
        [1, (x, y) => !near(x, y, TOWN_CLEARANCE)],
        [0, (x, y) => !near(x, y, MIN_PLACE_DISTANCE)],
      ];
      let pos: { x: number; y: number } | null = null;
      for (const [margin, accept] of spots) {
        pos = this.findLand(isl, target.x, target.y, isl.reach, box.x0, box.y0, box.x1, box.y1, margin, accept);
        if (pos) break;
      }
      if (!pos) throw new Error(`island ${isl.index} (${isl.kind}, ${isl.area} tiles) has no room for town ${t}`);
      const name = isl.index === 0 && t === 0 ? "Starthaven" : undefined;
      pois.push(this.makePoi(isl, t, pos.x, pos.y, "town", t === 0, name));
    }
    const towns = pois.length;
    // the other places: about one for every `LAND_PER_PLACE` tiles of the island (the finished strip of the old outside map has one in 54), on spots of
    // plain land with room round them, found by trying random spots of the island
    const wanted = Math.max(2, Math.floor(isl.area / LAND_PER_PLACE) - towns);
    let placed = 0;
    for (let attempt = 0; attempt < 400 && placed < wanted; attempt++) {
      const rng = rngFor(this.seed, LAYER.POI, isl.index, 0, "pick", attempt);
      const x = isl.x + rng.range(isl.box.x0, isl.box.x1);
      const y = isl.y + rng.range(isl.box.y0, isl.box.y1);
      const pos = this.findLand(isl, x, y, 1, box.x0, box.y0, box.x1, box.y1, PLACE_ROOM) ?? this.findLand(isl, x, y, 1, box.x0, box.y0, box.x1, box.y1);
      if (!pos) continue;
      if (pois.slice(0, towns).some((p) => Math.max(Math.abs(pos.x - p.x), Math.abs(pos.y - p.y)) < TOWN_CLEARANCE)) continue;
      if (near(pos.x, pos.y, MIN_PLACE_DISTANCE)) continue;
      pois.push(this.makePoi(isl, 100 + attempt, pos.x, pos.y, this.poiKind(rng, isl.biome), false));
      placed++;
    }
    return pois;
  }

  // ---------------------------------------------------------------- roads

  private roadSeed(kind: string, a: number, b: number): number {
    return toInt(derive(this.seed, LAYER.ROAD, kind, a, b));
  }

  /**
   * The points a road takes from the entrance of a place outwards: the entrance tile, then a straight stub of two tiles away from the door
   * (so the road meets the door head on) and, if the place it is going to lies behind the building, three tiles sideways round the corner.
   */
  private leave(poi: Poi, towards: Pt): Pt[] {
    const front = poiEntrances(poi)[0]!;
    const { dx, dy } = SIDE_DELTA[poi.side];
    const stub = { x: front.x + 2 * dx, y: front.y + 2 * dy };
    if ((towards.x - stub.x) * dx + (towards.y - stub.y) * dy >= 0) return [front, stub];
    const across = dx === 0 ? towards.x - stub.x : towards.y - stub.y;
    const sign = across >= 0 ? 1 : -1;
    return [front, stub, dx === 0 ? { x: stub.x + 3 * sign, y: stub.y } : { x: stub.x, y: stub.y + 3 * sign }];
  }

  /**
   * The road from the entrance of one place to the entrance of another: straight pieces with right-angle bends. Of the shapes that join the two
   * ends (horizontal then vertical, the reverse, and two with a middle piece at a hashed share of the way) the cheapest wins: water and rock cost
   * more (a bridge, a pass), the neighbourhood of a place a lot more (a road must not run into a building that is not its goal).
   * `others` are the places that may be in the way.
   */
  private route(a: Poi, b: Poi, seed: number, others: readonly Poi[]): RoadSeg[] {
    const from = this.leave(a, b);
    const to = this.leave(b, a);
    const u = from[from.length - 1]!;
    const v = to[to.length - 1]!;
    const shapes: Pt[][] = [];
    if (u.x === v.x || u.y === v.y) {
      shapes.push([]);
    } else {
      shapes.push([{ x: v.x, y: u.y }], [{ x: u.x, y: v.y }]);
      // the middle piece lies at a quarter, half or three quarters of the way, or at a hashed share between 30 and 70 per cent
      for (const t of [250, 500, 750, 300 + ((seed >>> 0) % 401)]) {
        const xm = u.x + Math.floor(((v.x - u.x) * t) / 1000);
        const ym = u.y + Math.floor(((v.y - u.y) * t) / 1000);
        shapes.push([{ x: xm, y: u.y }, { x: xm, y: v.y }], [{ x: u.x, y: ym }, { x: v.x, y: ym }]);
      }
    }
    // the places that can be in the way are those near the rectangle between the two ends (the detours stay close to it)
    const near = { x0: Math.min(u.x, v.x) - 8, y0: Math.min(u.y, v.y) - 8, x1: Math.max(u.x, v.x) + 8, y1: Math.max(u.y, v.y) + 8 };
    const boxes: Box[] = [];
    for (const p of others) {
      const bb = poiBounds(p);
      if (bb.x1 >= near.x0 && bb.x0 <= near.x1 && bb.y1 >= near.y0 && bb.y0 <= near.y1) boxes.push({ ...bb, own: p === a || p === b });
    }
    let best = shapes[0]!;
    let bestCost = Infinity;
    for (const mid of shapes) {
      const cost = this.roadCost([u, ...mid, v], boxes);
      if (cost < bestCost) {
        best = mid;
        bestCost = cost;
      }
    }
    return roadThrough(this.dodge([...from, ...best, ...to.slice().reverse()], boxes));
  }

  /**
   * A road through the footprint of a place that is not its goal would end at the building on both sides. Every straight piece (not the stubs at
   * the doors) that runs into such a place is led round it instead: to the edge of the place's cleared ground, along it and back, on the side that costs less.
   */
  private dodge(points: Pt[], boxes: readonly Box[]): Pt[] {
    // the two places the road joins are not in its way
    const zones = boxes.filter((bb) => !bb.own);
    if (zones.length === 0) return points;
    let pts = points;
    for (let round = 0; round < 4; round++) {
      let changed = false;
      const next: Pt[] = [pts[0]!];
      for (let i = 1; i < pts.length; i++) {
        const a = next[next.length - 1]!;
        const b = pts[i]!;
        const stub = i <= 1 || i >= pts.length - 1;
        const zone = stub ? undefined : zones.find((bb) => {
          const x0 = Math.min(a.x, b.x);
          const x1 = Math.max(a.x, b.x);
          const y0 = Math.min(a.y, b.y);
          const y1 = Math.max(a.y, b.y);
          const inside = (pt: Pt) => pt.x >= bb.x0 - 1 && pt.x <= bb.x1 + 1 && pt.y >= bb.y0 - 1 && pt.y <= bb.y1 + 1;
          return x1 >= bb.x0 - 1 && x0 <= bb.x1 + 1 && y1 >= bb.y0 - 1 && y0 <= bb.y1 + 1 && !inside(a) && !inside(b);
        });
        if (!zone) {
          next.push(b);
          continue;
        }
        changed = true;
        const horizontal = a.y === b.y;
        // the two ways round: on the near side of the place or on the far one
        const options = horizontal
          ? [zone.y0 - 2, zone.y1 + 2].map((y) => {
              const [ex, ox] = a.x < b.x ? [zone.x0 - 2, zone.x1 + 2] : [zone.x1 + 2, zone.x0 - 2];
              return [{ x: ex, y: a.y }, { x: ex, y }, { x: ox, y }, { x: ox, y: a.y }];
            })
          : [zone.x0 - 2, zone.x1 + 2].map((x) => {
              const [ey, oy] = a.y < b.y ? [zone.y0 - 2, zone.y1 + 2] : [zone.y1 + 2, zone.y0 - 2];
              return [{ x: a.x, y: ey }, { x, y: ey }, { x, y: oy }, { x: a.x, y: oy }];
            });
        let best = options[0]!;
        let bestCost = Infinity;
        for (const o of options) {
          const cost = this.roadCost([a, ...o, b], zones);
          if (cost < bestCost) {
            best = o;
            bestCost = cost;
          }
        }
        next.push(...best, b);
      }
      pts = next;
      if (!changed) break;
    }
    return pts;
  }

  /** What a road through these points costs: sampled every second tile, plus a little for every bend. A guide for choosing between shapes, not the terrain itself. */
  private roadCost(points: readonly Pt[], boxes: readonly Box[]): number {
    let cost = (points.length - 2) * 3;
    for (const seg of roadThrough(points)) {
      const near = boxes.filter((bb) => bb.x1 + 2 >= seg.x0 && bb.x0 - 2 <= seg.x1 && bb.y1 + 2 >= seg.y0 && bb.y0 - 2 <= seg.y1);
      for (let i = seg.from; i <= seg.to; i += 2) {
        const x = seg.horizontal ? i : seg.x0;
        const y = seg.horizontal ? seg.y0 : i;
        // sea costs a bridge, the rock of a range a pass
        const land = this.isLand(this.wrapX(x), this.wrapY(y));
        cost += !land ? 24 : fbm2(this.sRidge, this.wrapX(x), this.wrapY(y), RIDGE_PERIOD, 2) + this.lump(this.wrapX(x), this.wrapY(y)) > RIDGE_LEVEL ? 4 : 0;
        for (const bb of near) if (x >= bb.x0 - 1 && x <= bb.x1 + 1 && y >= bb.y0 - 1 && y <= bb.y1 + 1) cost += 60;
      }
    }
    return cost;
  }

  /**
   * How the places of an island hang together: a tree of short roads from the anchor to every other place (each place joins the nearest one that is
   * already connected), and a second road between close places that the tree leaves apart now and then. Prim's algorithm; ties
   * go to the lower index, so the result only depends on the places. Returns the edges (`[a, b]`: `b` joined the tree through `a`, the loops come
   * last) and, for every place, the place it joined through (the entrance of a place faces that one).
   */
  private connections(island: number, pois: Poi[]): { edges: [number, number][]; parent: number[] } {
    const n = pois.length;
    const manhattan = (a: Poi, b: Poi) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const joined = new Array<boolean>(n).fill(false);
    joined[0] = true;
    const nearest = pois.map((p) => ({ d: manhattan(p, pois[0]!), from: 0 }));
    const edges: [number, number][] = [];
    const parent = new Array<number>(n).fill(0);
    const linked = new Set<number>();
    for (let k = 1; k < n; k++) {
      let pick = -1;
      for (let i = 1; i < n; i++) if (!joined[i] && (pick < 0 || nearest[i]!.d < nearest[pick]!.d)) pick = i;
      joined[pick] = true;
      edges.push([nearest[pick]!.from, pick]);
      parent[pick] = nearest[pick]!.from;
      linked.add(nearest[pick]!.from * n + pick);
      for (let i = 1; i < n; i++) {
        const d = manhattan(pois[i]!, pois[pick]!);
        if (!joined[i] && d < nearest[i]!.d) nearest[i] = { d, from: pick };
      }
    }
    for (let i = 1; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (manhattan(pois[i]!, pois[j]!) > LOOP_DISTANCE || linked.has(i * n + j) || linked.has(j * n + i)) continue;
        if (rngFor(this.seed, LAYER.ROAD, "loop", island, 0, i, j).chance(LOOP_PERMILLE)) edges.push([i, j]);
      }
    }
    return { edges, parent };
  }

  /** The places of an island with their sizes and entrance sides, and the roads between them. */
  private planIsland(isl: Island): RegionPlan {
    const pois = this.placesOf(isl);
    // the plan of the island's dungeons says which of them are pyramids (they ask for a key card), and those are three tiles wide
    const klass = planPlaces(this.seed, isl.index, 0, pois);
    for (const p of pois) if (klass.get(p.id)?.klass === "C") p.size = PYRAMID_SIZE;
    if (pois.length < 2) return { pois, connectors: [] };
    const { edges, parent } = this.connections(isl.index, pois);
    // a place faces the place its road hangs on (the anchor keeps its random side): every road of it ends at the door
    for (let i = 1; i < pois.length; i++) {
      const p = pois[i]!;
      const q = pois[parent[i]!]!;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      p.side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N";
    }
    const connectors = edges.flatMap(([a, b], i) => this.route(pois[a]!, pois[b]!, this.roadSeed("C", isl.index, i), pois));
    return { pois, connectors };
  }

  /** Plans every island (once, when the first tile is asked for): places, roads and the index that finds them near a chunk. */
  private plan(): void {
    if (this.planned) return;
    this.planned = true;
    this.plans = this.layout.islands.map((isl) => this.planIsland(isl));
    // the bridge between the start island and the level-3 island: a road from a place on the level-2 half to the place of the other island nearest to it
    for (const isl of this.layout.islands) {
      if (isl.bridge < isl.index) continue;
      const other = this.layout.islands[isl.bridge]!;
      const mine = this.plans[isl.index]!;
      const theirs = this.plans[other.index]!;
      const nearest = (list: readonly Poi[], to: Island, tier?: number): Poi | undefined => {
        const pool = tier === undefined ? list : list.filter((p) => p.tier === tier);
        const choice = pool.length > 0 ? pool : list;
        return choice.reduce<Poi | undefined>((best, p) => (best === undefined || Math.abs(p.x - to.x) + Math.abs(p.y - to.y) < Math.abs(best.x - to.x) + Math.abs(best.y - to.y) ? p : best), undefined);
      };
      const from = nearest(mine.pois, other, isl.tiers[isl.tiers.length - 1]);
      const to = nearest(theirs.pois, isl);
      if (from && to) mine.connectors.push(...this.route(from, to, this.roadSeed("B", isl.index, other.index), [...mine.pois, ...theirs.pois]));
    }
    this.poiList = this.plans.flatMap((p) => p.pois);
    for (const p of this.poiList) {
      this.poiMap.set(p.id, p);
      this.flatElevation.set(p.id, Math.min(MOUNTAIN_LEVEL - 600, Math.max(SEA_LEVEL + 600, this.baseTile(this.wrapX(p.x), this.wrapY(p.y)).elevation)));
    }
    const reach = VEG_FAR + 1;
    const roads = this.plans.flatMap((p) => p.connectors);
    for (let ccy = 0; ccy < this.chunksDown; ccy++) {
      for (let ccx = 0; ccx < this.chunksAcross; ccx++) {
        const x0 = ccx * CHUNK_SIZE;
        const y0 = ccy * CHUNK_SIZE;
        const x1 = x0 + CHUNK_SIZE - 1;
        const y1 = y0 + CHUNK_SIZE - 1;
        this.chunkRoads.push(roads.filter((r) => r.near(x0, y0, x1, y1, reach)));
        this.chunkPois.push(
          this.poiList.filter((p) => {
            const b = poiBounds(p);
            return b.x1 + reach >= x0 && b.x0 - reach <= x1 && b.y1 + reach >= y0 && b.y0 - reach <= y1;
          }),
        );
      }
    }
  }

  /** An island with its places and roads, `rx` its index and `ry` 0; an island that does not exist has none. */
  region(rx: number, ry: number): RegionData {
    this.plan();
    const plan = ry === 0 ? this.plans[rx] : undefined;
    return { rx, ry, pois: plan?.pois ?? [], roads: plan?.connectors ?? [] };
  }

  /** Every place of the world. */
  allPois(): readonly Poi[] {
    this.plan();
    return this.poiList;
  }

  /** The anchor place of an island: its first town. */
  anchorOf(rx: number, ry: number): Poi {
    return this.region(rx, ry).pois[0]!;
  }

  poiById(id: string): Poi | null {
    this.plan();
    return this.poiMap.get(id) ?? null;
  }

  /** The side of a POI that faces its visitors and the tile in front of its middle, where its roads end. */
  frontOf(poi: Poi): { side: PoiSide; x: number; y: number } {
    return poiFront(poi);
  }

  /** The place whose entrance tile this is (a tile in front of its door, see `poiEntrances`), if any. */
  poiAtEntrance(x: number, y: number): Poi | null {
    const cx = this.wrapX(x);
    const cy = this.wrapY(y);
    for (const s of SIDES) {
      const id = this.tile(cx + s.dx, cy + s.dy).poiId;
      const poi = id ? this.poiById(id) : null;
      if (!poi) continue;
      if (poiEntrances(poi).some((e) => this.wrapX(e.x) === cx && this.wrapY(e.y) === cy)) return poi;
    }
    return null;
  }

  /**
   * All POIs whose middle lies in the given tile rectangle. The world is a globe: a place is found at every position it has beside the
   * rectangle, shifted by whole worlds (`x` and `y` of the copy are where the place stands there; the id is the same).
   */
  poisInRect(x0: number, y0: number, x1: number, y1: number): Poi[] {
    this.plan();
    const out: Poi[] = [];
    const W = this.width;
    const H = this.height;
    for (const p of this.poiList) {
      for (let ky = Math.ceil((y0 - p.y) / H); p.y + ky * H <= y1; ky++) {
        for (let kx = Math.ceil((x0 - p.x) / W); p.x + kx * W <= x1; kx++) out.push(kx === 0 && ky === 0 ? p : { ...p, x: p.x + kx * W, y: p.y + ky * H });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- composed tiles

  /** Composed tiles by their place in the world: a tile is asked for by its neighbours over and over. */
  private readonly composedCache = new Map<number, TileInfo>();
  private readonly rawCache = new Map<number, TileInfo>();

  /** The tile at canonical coordinates, roads and places laid over the terrain (cached). */
  private compose(tx: number, ty: number): TileInfo {
    const key = ty * this.width + tx;
    let t = this.composedCache.get(key);
    if (!t) this.composedCache.set(key, (t = this.composeTile(tx, ty)));
    return t;
  }

  private composeTile(tx: number, ty: number): TileInfo {
    this.plan();
    const base = this.baseTile(tx, ty);
    let { ground, deco, biome, elevation } = base;
    let poiId: string | null = null;
    // only the roads and places near this tile's chunk can matter
    const chunk = Math.floor(ty / CHUNK_SIZE) * this.chunksAcross + Math.floor(tx / CHUNK_SIZE);
    const places = this.chunkPois[chunk]!;

    // 1. flatten: clear water, mountains and decoration around every POI
    let cleared = false;
    for (const p of places) {
      const b = poiBounds(p);
      if (tx < b.x0 - FLATTEN || tx > b.x1 + FLATTEN || ty < b.y0 - FLATTEN || ty > b.y1 + FLATTEN) continue;
      cleared = true;
      if (ground === GROUND.WATER || ground === GROUND.MOUNTAIN || ground === GROUND.LAVA_POOL || ground === GROUND.SHALLOW) {
        ground = GROUND.LAND;
      }
      deco = DECO.NONE;
      biome = p.biome;
      elevation = this.flatElevation.get(p.id)!;
    }

    // 2. roads override water (bridge), mountains (pass) and decoration
    const rock = ground === GROUND.MOUNTAIN;
    let onRoad = false;
    let open = false;
    for (const road of this.chunkRoads[chunk]!) {
      if (!road.contains(tx, ty)) continue;
      onRoad = true;
      // where two roads share a tile, either of them may open the pass
      if (rock && this.opensUp(road, tx, ty)) open = true;
      else if (!rock) break;
    }
    if (onRoad) {
      if (ground === GROUND.WATER || ground === GROUND.LAVA_POOL) ground = GROUND.BRIDGE;
      else if (rock && !open) ground = GROUND.PASS;
      else ground = GROUND.ROAD;
      deco = DECO.NONE;
    }

    // 3. POI footprints override roads: the model stands on plain ground and blocks it
    for (const p of places) {
      const b = poiBounds(p);
      if (tx < b.x0 || tx > b.x1 || ty < b.y0 || ty > b.y1) continue;
      poiId = p.id;
      deco = DECO.NONE;
      elevation = this.flatElevation.get(p.id)!;
      ground = GROUND.POI_BLOCK;
    }

    // 4. light vegetation near the ways: a loose lattice of trees next to roads and places, the woods thin out from there
    if (ground === GROUND.LAND && deco !== DECO.LANDMARK && !cleared) {
      const slot = this.latticeSlot(tx, ty);
      if (deco === DECO.TREE || slot) {
        const d = this.waysDistance(tx, ty, chunk, places);
        if (d <= VEG_NEAR) {
          if (slot && permille(hash2(this.sLattice, tx, ty)) < (NEAR_TREE[biome] ?? 0)) deco = DECO.TREE;
          else if (deco === DECO.TREE) deco = DECO.NONE;
        } else if (d <= VEG_FAR && deco === DECO.TREE && permille(hash2(this.sThin, tx, ty)) * (VEG_FAR - VEG_NEAR + 1) >= (d - VEG_NEAR) * 1000) {
          deco = DECO.NONE;
        }
      }
    }

    return { biome, ground, deco, elevation, poiId };
  }

  /** Is this tile the slot of its lattice cell? Each 4 x 4 cell has one, in its top left 2 x 2 tiles: two trees on slots are at least three tiles apart in x or y. */
  private latticeSlot(tx: number, ty: number): boolean {
    const cx = Math.floor(tx / LATTICE);
    const cy = Math.floor(ty / LATTICE);
    const h = hash2(this.sLattice + 1, cx, cy);
    return tx - cx * LATTICE === (h & 1) && ty - cy * LATTICE === ((h >>> 1) & 1);
  }

  /** Chebyshev distance from a tile to the nearest road tile or place footprint, `VEG_FAR + 1` when none is that close. */
  private waysDistance(tx: number, ty: number, chunk: number, places: readonly Poi[]): number {
    let d = VEG_FAR + 1;
    for (const road of this.chunkRoads[chunk]!) {
      const k = road.distance(tx, ty);
      if (k < d) d = k;
    }
    for (const p of places) {
      const b = poiBounds(p);
      const dx = tx < b.x0 ? b.x0 - tx : tx > b.x1 ? tx - b.x1 : 0;
      const dy = ty < b.y0 ? b.y0 - ty : ty > b.y1 ? ty - b.y1 : 0;
      d = Math.min(d, Math.max(dx, dy));
    }
    return d;
  }

  /**
   * A road that runs along a thin range, or through a thick one, would be a trench of mountain on both sides for as long as it
   * keeps to the rock. Where it has been in the rock for three tiles or more, every third tile along the road is plain road again,
   * so that a pass is never longer than five tiles (counting the tiles the road shifts sideways).
   */
  private opensUp(road: RoadSeg, tx: number, ty: number): boolean {
    const m = road.horizontal ? tx : ty;
    if (((m % 3) + 3) % 3 !== 0) return false;
    const inRock = (j: number): boolean => {
      if (j < road.from || j > road.to) return false;
      return (road.horizontal ? this.baseTile(this.wrapX(j), this.wrapY(road.cross)) : this.baseTile(this.wrapX(road.cross), this.wrapY(j))).ground === GROUND.MOUNTAIN;
    };
    let before = 0;
    while (before < 3 && inRock(m - 1 - before)) before++;
    let after = 0;
    while (after < 3 && inRock(m + 1 + after)) after++;
    return before + after + 1 >= 3;
  }

  /**
   * The tile before the shore and the landmarks are settled: terrain, roads, places and trees, with the ground that has no painted tile to meet the
   * road made land. The flat ground has a picture for the border of two terrains and none for three that meet at a corner, so a pool of water or lava
   * that touches a road (diagonally too) is filled in, and a pool of lava that touches water as well: a road along a coast, a lone ford beside a path,
   * a lava lake at the sea. (A bridge cannot avoid it where it meets the bank.) `tx`, `ty` anywhere: the world is a globe.
   */
  private rawTile(tx: number, ty: number): TileInfo {
    const x = this.wrapX(tx);
    const y = this.wrapY(ty);
    const key = y * this.width + x;
    let t = this.rawCache.get(key);
    if (t) return t;
    t = this.compose(x, y);
    const wet = t.ground === GROUND.WATER || t.ground === GROUND.SHALLOW;
    if (wet || t.ground === GROUND.LAVA_POOL) {
      let beside: Ground | null = null;
      for (const [dx, dy] of AROUND) {
        const g = this.compose(this.wrapX(x + dx), this.wrapY(y + dy)).ground;
        const way = g === GROUND.ROAD || g === GROUND.PASS;
        const water = g === GROUND.WATER || g === GROUND.SHALLOW;
        // water and lava meet roads and each other only at a straight border: whatever would make a corner of three terrains is land
        if (way || (!wet && (water || g === GROUND.BRIDGE)) || (wet && g === GROUND.LAVA_POOL)) {
          beside = g;
          break;
        }
      }
      if (beside !== null) t = { ...t, ground: GROUND.LAND, deco: DECO.NONE, biome: this.landAt(x, y)?.island.biome ?? this.biomeBeside(x, y) ?? this.nearestBiome(x, y) };
    }
    this.rawCache.set(key, t);
    return t;
  }

  /** The climate of the land right beside a tile (the eight neighbours), so that a tile of sea made land joins the ground it touches and meets no other climate at a corner. */
  private biomeBeside(x: number, y: number): Biome | null {
    for (const [dx, dy] of AROUND) {
      const t = this.compose(this.wrapX(x + dx), this.wrapY(y + dy));
      if ((t.ground === GROUND.LAND || t.ground === GROUND.MOUNTAIN || t.ground === GROUND.ROAD || t.ground === GROUND.PASS) && t.biome !== BIOME.OCEAN) return t.biome;
    }
    return null;
  }

  /**
   * The climate of the island whose land is nearest to a tile (for a tile of sea that was made land beside a road): the land itself, found by looking
   * ring after ring round the tile, so that the shore beside a bridge head has the ground of the island it belongs to and not of a bigger one that is
   * nearer by its middle.
   */
  private nearestBiome(x: number, y: number): Biome {
    for (let r = 1; r <= NEAREST_LAND; r++) {
      let found: Island | null = null;
      let bestField = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const here = this.landAt(this.wrapX(x + dx), this.wrapY(y + dy));
          if (here && here.field > bestField) {
            found = here.island;
            bestField = here.field;
          }
        }
      }
      if (found) return found.biome;
    }
    let best = this.layout.islands[0]!;
    let bestD = Infinity;
    for (const isl of this.layout.islands) {
      const d = isqrt(wrapDist2(x, y, isl.x, isl.y, this.width, this.height)) - ((isl.r + isl.reach) >> 1);
      if (d < bestD) {
        best = isl;
        bestD = d;
      }
    }
    return best.biome;
  }

  /**
   * What the terrain makes of a raw tile: water beside land is a shore, shallow so that the party can wade (a deep tile never touches land, a
   * bridge or a road, not even at a corner), and a landmark the party could not get to (closed in by trees, rock or water) is not built.
   * `groundAt` gives the raw ground of the tiles around.
   */
  private settle(tx: number, ty: number, raw: TileInfo, groundAt: (x: number, y: number) => Ground): TileInfo {
    if (raw.ground === GROUND.WATER) {
      for (const [dx, dy] of AROUND) if (SHORE_LAND.has(groundAt(tx + dx, ty + dy))) return { ...raw, ground: GROUND.SHALLOW };
      if (this.narrowInland(tx, ty)) return { ...raw, ground: GROUND.SHALLOW };
    } else if (raw.deco === DECO.LANDMARK && !this.landmarkReachable(tx, ty)) {
      return { ...raw, deco: DECO.NONE };
    }
    return raw;
  }

  /**
   * Deep water of a small inland water: a river or pond of an island (inside its coast, never the sea, a strait or a bay) that is at most three tiles
   * wide where the tile lies, in one direction or the other, with land at both ends. Its middle is shallow like its banks, so that a party that can wade
   * (Swimmer) can cross a stream; a lake wider than that keeps its deep water for those who can sail (the user's rule, 22nd playtest).
   */
  private narrowInland(tx: number, ty: number): boolean {
    if (!this.landAt(this.wrapX(tx), this.wrapY(ty))) return false;
    const wet = (x: number, y: number): boolean => {
      const g = this.rawTile(x, y).ground;
      return g === GROUND.WATER || g === GROUND.SHALLOW;
    };
    for (const [ax, ay] of [[1, 0], [0, 1]] as const) {
      let run = 1;
      let closed = true;
      for (const sign of [1, -1]) {
        let k = 1;
        while (k <= NARROW_WATER && wet(tx + sign * ax * k, ty + sign * ay * k)) k++;
        if (k > NARROW_WATER) closed = false;
        run += k - 1;
      }
      if (closed && run <= NARROW_WATER) return true;
    }
    return false;
  }

  /**
   * Can the party stand next to this landmark? A walker on one of the four tiles around it must get to a road, a bridge or a pass, or across
   * `LANDMARK_GROUND` tiles of open ground. The test reads the raw tiles (every landmark counts as a wall, the shore as water), so it never asks
   * for a tile that asks for it.
   */
  private landmarkReachable(tx: number, ty: number): boolean {
    const get = (x: number, y: number) => this.rawTile(x, y);
    for (const [dx, dy] of NEIGHBOURS) if (this.flood(tx + dx, ty + dy, LANDMARK_GROUND, get)) return true;
    return false;
  }

  /** The tile at (tx, ty); the world is a globe, so any coordinates will do. */
  tile(tx: number, ty: number): TileInfo {
    const x = this.wrapX(tx);
    const y = this.wrapY(ty);
    return this.settle(x, y, this.rawTile(x, y), (a, b) => this.rawTile(a, b).ground);
  }

  /**
   * Can a walker standing on this tile get out into the open? A flood fill over the walkable tiles (four neighbours, as the party moves)
   * that succeeds when it reaches a road, a bridge, a pass or the tile of a place (they all lead somewhere) or has seen `OPEN_GROUND`
   * tiles without finding a wall on every side. False for a pocket that mountains, trees and water close: a monster or mascot put
   * there could never be reached. Pure function of the seed, so generators may ask it for any tile.
   */
  isOpenGround(tx: number, ty: number): boolean {
    return this.flood(tx, ty, OPEN_GROUND, (x, y) => this.tile(x, y));
  }

  /**
   * May something that blocks the tile (a mascot, a wagon) stand on it without cutting a way? The walkable tiles around it, taken in a ring of
   * eight, must stay in one piece without it: on a meadow, at a wall or at a shore they do, in a corridor of one tile, at a bend of a path or on a
   * strip of land between water they do not (the group could no longer walk round, which the first playtest of the island start showed).
   */
  leavesPassage(tx: number, ty: number): boolean {
    // the ring from north clockwise: the even entries are the four edge neighbours, the odd ones the corners between them
    const ring: readonly (readonly [number, number])[] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    const open = ring.map(([dx, dy]) => isTileWalkable(this.tile(tx + dx, ty + dy)));
    const wall = open.indexOf(false);
    if (wall < 0) return true;
    // go once round from a wall and count the pieces (runs of walkable tiles) that hold an edge neighbour: each is a way the tile is part of
    let pieces = 0;
    let inPiece = false;
    let hasEdge = false;
    for (let k = 1; k <= 8; k++) {
      const i = (wall + k) % 8;
      if (open[i]) {
        inPiece = true;
        if (i % 2 === 0) hasEdge = true;
      } else if (inPiece) {
        if (hasEdge) pieces++;
        inPiece = false;
        hasEdge = false;
      }
    }
    return pieces <= 1;
  }

  /**
   * May something that blocks a tile (a mascot, a wagon) stand there without cutting the way round a place? The ring of cleared ground round every
   * place (`FLATTEN` tiles wide) is a street of its own: the walkable tiles of it must fall into no more pieces with the new blocker (and `others`, the ones
   * already standing there) than without it. Where the ring was cut already (by the sea, by rock) it stays as it is; a wagon and a donkey side by side across
   * a ring of two tiles would have shut it.
   */
  keepsRingOpen(tx: number, ty: number, others: readonly { x: number; y: number }[] = []): boolean {
    const x = this.wrapX(tx);
    const y = this.wrapY(ty);
    const key = (a: number, b: number) => this.wrapY(b) * this.width + this.wrapX(a);
    for (const p of this.poisInRect(x - FLATTEN - 6, y - FLATTEN - 6, x + FLATTEN + 6, y + FLATTEN + 6)) {
      const b = poiBounds(p);
      if (x < b.x0 - FLATTEN - 1 || x > b.x1 + FLATTEN + 1 || y < b.y0 - FLATTEN - 1 || y > b.y1 + FLATTEN + 1) continue;
      // the ring: the tiles one or two steps from the footprint
      const ring: [number, number][] = [];
      for (let gy = b.y0 - FLATTEN; gy <= b.y1 + FLATTEN; gy++) {
        for (let gx = b.x0 - FLATTEN; gx <= b.x1 + FLATTEN; gx++) if (gx < b.x0 || gx > b.x1 || gy < b.y0 || gy > b.y1) ring.push([gx, gy]);
      }
      const pieces = (shut: ReadonlySet<number>): number => {
        const free = new Set<number>();
        for (const [gx, gy] of ring) {
          const t = this.tile(gx, gy);
          if (isTileWalkable(t) && t.poiId === null && !shut.has(key(gx, gy))) free.add(key(gx, gy));
        }
        const seen = new Set<number>();
        let count = 0;
        for (const [gx, gy] of ring) {
          const k = key(gx, gy);
          if (!free.has(k) || seen.has(k)) continue;
          count++;
          const stack: [number, number][] = [[gx, gy]];
          seen.add(k);
          while (stack.length > 0) {
            const [cx, cy] = stack.pop()!;
            for (const [dx, dy] of NEIGHBOURS) {
              const nk = key(cx + dx, cy + dy);
              if (free.has(nk) && !seen.has(nk)) {
                seen.add(nk);
                stack.push([cx + dx, cy + dy]);
              }
            }
          }
        }
        return count;
      };
      const standing = new Set<number>(others.map((o) => key(o.x, o.y)));
      if (pieces(new Set(standing).add(key(x, y))) > pieces(standing)) return false;
    }
    return true;
  }

  private flood(tx: number, ty: number, cap: number, get: (x: number, y: number) => TileInfo): boolean {
    const W = this.width;
    const start = get(this.wrapX(tx), this.wrapY(ty));
    if (!isTileWalkable(start)) return false;
    // the world is a globe: tiles are told apart by their place in the world, not by the coordinates the walk reached
    const seen = new Set<number>();
    const key = (x: number, y: number) => this.wrapY(y) * W + this.wrapX(x);
    const stack: number[] = [tx, ty];
    seen.add(key(tx, ty));
    while (stack.length > 0) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      const t = x === tx && y === ty ? start : get(this.wrapX(x), this.wrapY(y));
      if (t.poiId !== null || t.ground === GROUND.ROAD || t.ground === GROUND.BRIDGE || t.ground === GROUND.PASS) return true;
      if (seen.size >= cap) return true;
      for (const [dx, dy] of NEIGHBOURS) {
        const k = key(x + dx, y + dy);
        if (seen.has(k)) continue;
        seen.add(k);
        if (isTileWalkable(get(this.wrapX(x + dx), this.wrapY(y + dy)))) stack.push(x + dx, y + dy);
      }
    }
    return false;
  }

  /** The chunk (cx, cy) anywhere in the unwrapped plane: it holds the tiles of the chunk it is a copy of. */
  chunk(cx: number, cy: number): ChunkData {
    const n = CHUNK_SIZE * CHUNK_SIZE;
    const data: ChunkData = {
      cx,
      cy,
      biome: new Uint8Array(n),
      ground: new Uint8Array(n),
      deco: new Uint8Array(n),
      elevation: new Uint16Array(n),
      pois: [],
    };
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    // the raw tiles of the chunk and one ring around it, which the shore of the edge tiles needs
    const side = CHUNK_SIZE + 2;
    const raw: TileInfo[] = [];
    for (let gy = 0; gy < side; gy++) {
      for (let gx = 0; gx < side; gx++) raw.push(this.rawTile(x0 - 1 + gx, y0 - 1 + gy));
    }
    const groundAt = (x: number, y: number) => raw[(y - y0 + 1) * side + (x - x0 + 1)]!.ground;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const t = this.settle(x0 + lx, y0 + ly, raw[(ly + 1) * side + lx + 1]!, groundAt);
        const i = ly * CHUNK_SIZE + lx;
        data.biome[i] = t.biome;
        data.ground[i] = t.ground;
        data.deco[i] = t.deco;
        data.elevation[i] = t.elevation;
      }
    }
    const m = 3;
    for (const p of this.poisInRect(x0 - 8, y0 - 8, x0 + CHUNK_SIZE + 8, y0 + CHUNK_SIZE + 8)) {
      const b = poiBounds(p);
      if (b.x1 + m >= x0 && b.x0 - m < x0 + CHUNK_SIZE && b.y1 + m >= y0 && b.y0 - m < y0 + CHUNK_SIZE) data.pois.push(p);
    }
    return data;
  }

  /**
   * The tile the player starts on: a few steps in front of the start town on the road that arrives there (the first free tile of the
   * three, two and one steps from its entrance), facing the town. The terrain around Starthaven is the world's own, as around every
   * town of the old outside map (on the shore, between mountains, in a wood): there is no meadow made to measure, only the
   * entrance tile, which is always walkable, and the road that leads away from it.
   */
  startPosition(): { x: number; y: number; facing: PoiSide } {
    const town = this.anchorOf(0, 0);
    const front = this.frontOf(town);
    const out = SIDES.find((s) => s.side === front.side)!;
    const facing: PoiSide = ({ N: "S", S: "N", E: "W", W: "E" } as const)[front.side];
    for (const k of [3, 2, 1]) {
      const x = front.x + out.dx * k;
      const y = front.y + out.dy * k;
      const t = this.tile(x, y);
      if (isTileWalkable(t) && t.poiId === null) return { x, y, facing };
    }
    return { x: front.x, y: front.y, facing };
  }
}

/** FNV-1a over all chunk arrays; used for golden hashes and chunk-independence tests. */
export function chunkHash(c: ChunkData): number {
  let h = 0x811c9dc5;
  const feed = (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i]!;
      h = Math.imul(h, 0x01000193);
    }
  };
  feed(c.biome);
  feed(c.ground);
  feed(c.deco);
  feed(new Uint8Array(c.elevation.buffer, c.elevation.byteOffset, c.elevation.byteLength));
  return h >>> 0;
}
