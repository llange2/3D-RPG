import { hash2, valueNoise2 } from "../core/noise";
import { tunedItemModels } from "../data/item-tuning";
import { BIOME, CHUNK_SIZE, DECO, GROUND, TILE_SIZE, poiBounds, type Biome, type Poi, type TileInfo } from "../world/types";
import { poiFront, type PoiSide, type World } from "../world/world";
import { flatTerrainOf, type FlatTileSet } from "./flatGround";
import { tileHeight, tileToWorldX, tileToWorldZ, usesTileModels } from "./heights";

/** Geometry of one chunk, grouped by material. Pure data: no Babylon, can be built on the main thread or in a worker. */
export interface ChunkGeometry {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  groups: { material: string; start: number; count: number }[];
  props: PropInstance[];
}

export interface PropInstance {
  model: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  /** Size per axis when it is not uniform (the old game's Village is 4.5 wide and 5.5 high). Overrides `scale`. */
  scaleXYZ?: [number, number, number];
  /** Pitch and roll in radians, applied before the yaw (a trap door lies flat by a roll of 270 degrees). */
  rotX?: number;
  rotZ?: number;
  /** `y` is the height of the model's origin instead of its lowest point. For rolled items, whose lowest point is not at the bottom of the model. */
  atOrigin?: boolean;
  lod?: { model: string; scale: number };
  /** Drawn only close to the party; chunks farther away leave it out and show the flat ground texture alone (the old ground tiles). */
  nearOnly?: boolean;
  /** Place the model so the middle of its bounding box (x, z) is at the given position. For off-centre origins like shop signs. */
  center?: boolean;
}

const UV_SCALE = 1 / 9; // one ground texture covers 3x3 tiles
/** Water and shallows share one texture at one scale, so the pattern runs on across the border between them: one texture covers 6x6 tiles. */
export const WATER_UV_SCALE = UV_SCALE / 2;
const GRID = CHUNK_SIZE + 4; // tiles -2..CHUNK_SIZE+1 around the chunk, needed for exact normals at the borders

function groundMaterial(t: TileInfo): string {
  switch (t.ground) {
    case GROUND.WATER:
      return "water";
    case GROUND.SHALLOW:
      return "shallow";
    case GROUND.LAVA_POOL:
      return "lava";
    case GROUND.ROAD:
    case GROUND.PASS:
    case GROUND.BRIDGE:
      return "cobble";
    case GROUND.MOUNTAIN:
      return t.biome === BIOME.SNOW ? "snow" : t.biome === BIOME.LAVA ? "lava_ground" : t.biome === BIOME.DESERT ? "desert" : "rock";
    default:
      // bare earth in the grass: the ground of the lava land, which is earth as well
      return t.dirt ? "lava_ground" : landMaterial(t.biome);
  }
}

function landMaterial(b: Biome): string {
  switch (b) {
    case BIOME.FOREST:
      return "forest";
    case BIOME.DESERT:
      return "desert";
    case BIOME.SNOW:
      return "snow";
    case BIOME.SWAMP:
      return "swamp";
    case BIOME.LAVA:
      return "lava_ground";
    default:
      return "meadow";
  }
}

export interface PropSpec {
  model: string;
  scale: number;
  /** Size per axis, for the tile models whose height differs from their width (palms, mountains). */
  scaleXYZ?: [number, number, number];
  /** Simple stand-in used for chunks far from the party. */
  lod?: { model: string; scale: number };
}

/**
 * The tile models of the old outside map (entities.py add_block 21 to 32) at the sizes it gave them: one model fills a tile, the
 * party cannot walk through it. Woods are the old forest tiles, the mountains come in a model per biome.
 */
const TILE_TREES: Partial<Record<Biome, PropSpec>> = {
  [BIOME.MEADOW]: { model: "veg_trees", scale: 1.7, lod: { model: "lod_tree_green", scale: 1.1 } },
  [BIOME.FOREST]: { model: "veg_forest_tile", scale: 2.2, lod: { model: "lod_tree_green", scale: 1.3 } },
  [BIOME.SNOW]: { model: "veg_snowy_forest", scale: 2.2, lod: { model: "lod_tree_snow", scale: 1.3 } },
  [BIOME.DESERT]: { model: "veg_palms", scale: 1.65, scaleXYZ: [1.65, 2, 1.65], lod: { model: "lod_tree_palm", scale: 1.1 } },
  [BIOME.SWAMP]: { model: "veg_old_tree", scale: 1.6, lod: { model: "lod_tree_dead", scale: 1.1 } },
};
const TILE_MOUNTAINS: Record<Biome, PropSpec> = {
  [BIOME.MEADOW]: { model: "mtn_mountain", scale: 1.7, scaleXYZ: [1.7, 2.3, 1.7], lod: { model: "lod_mtn_rock", scale: 1 } },
  [BIOME.FOREST]: { model: "mtn_mountain", scale: 1.7, scaleXYZ: [1.7, 2.3, 1.7], lod: { model: "lod_mtn_rock", scale: 1 } },
  [BIOME.OCEAN]: { model: "mtn_mountain", scale: 1.7, scaleXYZ: [1.7, 2.3, 1.7], lod: { model: "lod_mtn_rock", scale: 1 } },
  [BIOME.SNOW]: { model: "mtn_snowy", scale: 1.65, scaleXYZ: [1.65, 2, 1.65], lod: { model: "lod_mtn_snow", scale: 1 } },
  [BIOME.DESERT]: { model: "mtn_desert", scale: 1.65, scaleXYZ: [1.65, 2, 1.65], lod: { model: "lod_mtn_desert", scale: 1 } },
  [BIOME.SWAMP]: { model: "mtn_swamp", scale: 1.65, scaleXYZ: [1.65, 2, 1.65], lod: { model: "lod_mtn_swamp", scale: 1 } },
  [BIOME.LAVA]: { model: "mtn_lava", scale: 2.55, scaleXYZ: [2.55, 3, 2.55], lod: { model: "lod_mtn_lava", scale: 1 } },
};

/** What stands on a tile with a solid or decorative object, by biome. Hash `h` picks between variants. `tileModels`: the old game's tile models. */
/** The landmarks of the old outside map (item numbers), with a weight: wells and huts are common, the rest is a find. The Monster Hut is not one: it has a place of its own (`world/huts.ts`). */
const LANDMARKS: readonly { item: number; weight: number }[] = [
  { item: 91, weight: 4 }, // Well
  { item: 45, weight: 4 }, // Hut
  { item: 26, weight: 2 }, // Rustic caravan
  { item: 33, weight: 2 }, // Giant stone head
  { item: 2, weight: 1 }, // Fountain
];
const LANDMARK_TOTAL = LANDMARKS.reduce((n, l) => n + l.weight, 0);
export const LANDMARK_MODELS = LANDMARKS.map((l) => `ci_${l.item}`);

function landmarkSpec(h: number): PropSpec {
  let k = (h >>> 3) % LANDMARK_TOTAL;
  const pick = LANDMARKS.find((l) => (k -= l.weight) < 0)!;
  const pose = ITEM_POSES[String(pick.item)]!;
  return { model: `ci_${pick.item}`, scale: pose.scale, scaleXYZ: pose.scale3 };
}

/** The old item that stands on a landmark tile: the pick `propSpec` makes for it, so that the game can say what the party bumped into. */
export function landmarkItemAt(tx: number, ty: number): number {
  let k = ((hash2(0xbeef, tx, ty) >>> 0) >>> 3) % LANDMARK_TOTAL;
  return LANDMARKS.find((l) => (k -= l.weight) < 0)!.item;
}

export function propSpec(deco: number, biome: Biome, h: number, tileModels = false): PropSpec | null {
  if (deco === DECO.LANDMARK) return landmarkSpec(h);
  if (tileModels && deco === DECO.TREE) {
    const spec = TILE_TREES[biome];
    if (spec) return spec;
  }
  switch (deco) {
    case DECO.TREE:
      if (biome === BIOME.SNOW) return { model: "veg_snowy_forest", scale: 1.45, lod: { model: "lod_tree_snow", scale: 1.1 } };
      if (biome === BIOME.DESERT) return { model: "veg_palms", scale: 1.45, lod: { model: "lod_tree_palm", scale: 1.1 } };
      if (biome === BIOME.SWAMP) return { model: "veg_old_tree", scale: 1.6, lod: { model: "lod_tree_dead", scale: 1.1 } };
      return { model: "veg_trees", scale: 1.45, lod: { model: "lod_tree_green", scale: 1.1 } };
    case DECO.BUSH:
      if (biome === BIOME.SWAMP || biome === BIOME.FOREST) return { model: "proc_mushroom", scale: 1.3 };
      return { model: h % 2 === 0 ? "proc_flower_blue" : "proc_flower_pink", scale: 1.3 };
    case DECO.TUFT:
      return { model: "proc_tuft", scale: 1.3 };
    default:
      return null;
  }
}

/**
 * The reduced ground tiles are chamfered at the corners and edges (the simplifier rounds the slab), which left the dark base quad showing
 * between the patches of grass and beside the square slabs of the tree and mountain tiles. They are drawn this much larger than the old game
 * did (the full tiles of the original set are nearly square and need no help), and every tile lies a hair above or below its neighbours
 * (`slabLift`), so that the overlap does not flicker where two coplanar slabs meet.
 */
export const GROUND_FILL = 1.25;

/** What is left of the base quad between the patches is lit up towards the colour of the slabs (their textures are boosted, the quad's is not), so it reads as the same grass in the shade and not as a lower, darker floor. */
const BASE_BOOST = 1.3;

/** Height of a ground tile's slab above the ground plane, a few millimetres apart from tile to tile (see `GROUND_FILL`); never zero, so it never equals a tree tile's slab. */
export const slabLift = (h: number): number => 0.004 + ((h >>> 10) % 100) * 0.00016;

/**
 * A tile model that stands on a slab of its own: trees, palms, woods and mountains (the old game's `Trees`, `Mountain` and so on). In the flat
 * ground mode the painted tile lies under the party's feet, and a slab rising above it would show as a second, lighter level of ground.
 */
export const hasOwnSlab = (model: string): boolean => model.startsWith("veg_") || model.startsWith("mtn_");

/** In the flat ground mode such a model is sunk by this much, so that its slab (and the grass tufts' roots) hide below the painted ground and only the model itself stands on it. */
export const FLAT_SLAB_SINK = -0.35;

/**
 * The ground tiles of the old outside map (entities.py add_block 8, 12, 24, 25, 26): a slab with bushes, stones and tufts on it, at
 * the sizes the old game gave them (a tile is 3 units, the model 1.9 wide: 1.7 fills it with a little overlap). They stand on the flat
 * ground texture, sunk so that the slab hides below it and only the lumps show, and only close to the party (`nearOnly`).
 */
const GROUND_TILES: Partial<Record<string, PropSpec>> = {
  meadow: { model: "gnd_grass", scale: GROUND_FILL * 1.7, scaleXYZ: [GROUND_FILL * 1.7, 1, GROUND_FILL * 1.7] },
  forest: { model: "gnd_grass", scale: GROUND_FILL * 1.7, scaleXYZ: [GROUND_FILL * 1.7, 1, GROUND_FILL * 1.7] },
  snow: { model: "gnd_snow", scale: GROUND_FILL * 1.7, scaleXYZ: [GROUND_FILL * 1.7, 1, GROUND_FILL * 1.7] },
  swamp: { model: "gnd_swamp", scale: GROUND_FILL * 1.7, scaleXYZ: [GROUND_FILL * 1.7, 1, GROUND_FILL * 1.7] },
  desert: { model: "gnd_desert", scale: GROUND_FILL * 1.65, scaleXYZ: [GROUND_FILL * 1.65, 1, GROUND_FILL * 1.65] },
  // bare earth (the patches in meadows and forests, the land and rock of a lava island): the old game's dirt tile (`Dirt.obj`, block 12)
  lava_ground: { model: "gnd_dirt", scale: 1.54, scaleXYZ: [1.54, 1, 1.54] },
  // the ways are cobblestone (`Cobblestone.obj`, as the old game's block 9), not the dirt of block 12; its slab is as thin as a plate, so the old game's height factor 2
  cobble: { model: "gnd_cobble", scale: 1.54, scaleXYZ: [1.54, 2, 1.54] },
};

let flatTiles: FlatTileSet | null = null;

/**
 * Graphics mode "flat": the ground is the painted tiles of `terrain/flat` laid on the corners of the map tiles instead of one textured quad
 * per tile with the old ground models (`gnd_*`) on top. Null switches back to the models. Set before the first chunk and rebuild the chunks
 * after a change (`ChunkManager.rebuild`).
 */
export function setFlatGround(tiles: FlatTileSet | null): void {
  flatTiles = tiles;
}
export const usesFlatGround = (): boolean => flatTiles !== null;

let ultraGround = false;

/** Original model set: the ground tiles are the old game's models in full (`gndx_*`, 2000 to 6000 triangles each) instead of the reduced `gnd_*`. Set before the first chunk. */
export function setUltraGround(on: boolean): void {
  ultraGround = on;
}

/** The model that stands for a ground tile model at the current quality (the key itself when there is no full version). */
export function groundModel(key: string): string {
  return ultraGround && ULTRA_GROUND.has(key) ? key.replace("gnd_", "gndx_") : key;
}

const ULTRA_GROUND = new Set(["gnd_grass", "gnd_snow", "gnd_swamp", "gnd_desert", "gnd_dirt"]);

/** Every model key the terrain can ask for, to preload them. */
export const TILE_MODELS = [
  "veg_trees", "veg_snowy_forest", "veg_palms", "veg_old_tree", "veg_forest_tile", "mtn_mountain", "mtn_snowy", "mtn_desert", "mtn_swamp", "mtn_lava",
  "gnd_grass", "gnd_snow", "gnd_swamp", "gnd_desert", "gnd_dirt", "gnd_cobble",
];

/** `TILE_MODELS` at the current quality: the full ground tiles replace the reduced ones in ultra. */
export const tileModelKeys = (): string[] => TILE_MODELS.map(groundModel);

/** The old outside map shows a town, castle, dungeon entrance and cave as one item each: "Village", "Castle", "Dungeon entrance" and "Cave entrance". Same models, same scales. */
const POI_ITEM: Record<string, { model: string; item: number }> = {
  town: { model: "poi_town", item: 47 },
  castle: { model: "poi_castle", item: 44 },
  dungeon: { model: "poi_dungeon", item: 41 },
  cave: { model: "poi_cave", item: 42 },
  // a dungeon that asks for a key card; the old outside map's pyramid is three cells wide
  pyramid: { model: "poi_pyramid", item: 43 },
};
const ITEM_POSES = tunedItemModels<{ scale: number; scale3: [number, number, number]; yaw: number }>();
const POI_MODEL: Record<string, { model: string; scale: number; scaleXYZ: [number, number, number]; yaw: number }> = Object.fromEntries(
  Object.entries(POI_ITEM).map(([kind, p]) => [kind, { model: p.model, scale: ITEM_POSES[String(p.item)]!.scale, scaleXYZ: ITEM_POSES[String(p.item)]!.scale3, yaw: ITEM_POSES[String(p.item)]!.yaw }]),
);

class Group {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  vertex(p: [number, number, number], n: [number, number, number], uv: [number, number], c: [number, number, number]): number {
    this.positions.push(...p);
    this.normals.push(...n);
    this.uvs.push(...uv);
    this.colors.push(c[0], c[1], c[2], 1);
    return this.positions.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }
}

/**
 * Builds the terrain of one chunk: a quad per tile with shared corner heights (so slopes are smooth and chunk borders
 * match exactly), vertex colours for brightness variation and the prop instance list (decorations and one model per POI).
 */
export function meshChunk(world: World, cx: number, cy: number): ChunkGeometry {
  const tileModels = usesTileModels();
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  const grid: TileInfo[] = new Array<TileInfo>(GRID * GRID);
  const tileAt = (lx: number, ly: number): TileInfo => grid[(ly + 2) * GRID + (lx + 2)]!;
  for (let ly = -2; ly < CHUNK_SIZE + 2; ly++) for (let lx = -2; lx < CHUNK_SIZE + 2; lx++) grid[(ly + 2) * GRID + (lx + 2)] = world.tile(x0 + lx, y0 + ly);
  const heightOfTile = new Float32Array(GRID * GRID);
  for (let i = 0; i < grid.length; i++) heightOfTile[i] = tileHeight(grid[i]!);
  const th = (lx: number, ly: number) => heightOfTile[(ly + 2) * GRID + (lx + 2)]!;

  // corner heights for corners -1..CHUNK_SIZE+1; corner (i,j) lies between tiles (i-1,j-1)..(i,j)
  const CG = CHUNK_SIZE + 3;
  const corner = new Float32Array(CG * CG);
  for (let j = -1; j <= CHUNK_SIZE + 1; j++) {
    for (let i = -1; i <= CHUNK_SIZE + 1; i++) corner[(j + 1) * CG + (i + 1)] = (th(i - 1, j - 1) + th(i, j - 1) + th(i - 1, j) + th(i, j)) / 4;
  }
  const ch = (i: number, j: number) => corner[(j + 1) * CG + (i + 1)]!;
  const normalAt = (i: number, j: number): [number, number, number] => {
    // heights change along +x (east) and along +z, which is -j (north)
    const dhx = (ch(i + 1, j) - ch(i - 1, j)) / (2 * TILE_SIZE);
    const dhz = (ch(i, j - 1) - ch(i, j + 1)) / (2 * TILE_SIZE);
    const len = Math.hypot(dhx, 1, dhz);
    return [-dhx / len, 1 / len, -dhz / len];
  };

  const groups = new Map<string, Group>();
  const group = (name: string) => {
    let g = groups.get(name);
    if (!g) groups.set(name, (g = new Group()));
    return g;
  };
  const props: PropInstance[] = [];

  /** The textured quad of one tile (the ground of the 3D mode; the flat mode lays its tiles on the corners instead, below). */
  const addGroundQuad = (lx: number, ly: number, tile: TileInfo, tx: number, ty: number, material: string): void => {
    const g = group(material);
    const water = material === "water" || material === "shallow";

    // brightness: small per-tile jitter plus a slow large-scale variation that hides texture repetition. Water is one
    // sheet, so it gets neither: every tile of it with its own brightness drew the tile grid over the lake.
    const jitter = water ? 1 : 0.98 + (((hash2(0x5eed, tx, ty) >>> 8) % 1000) / 1000) * 0.04;
    const slow = water ? 1 : 0.88 + (valueNoise2(0x1234, tx, ty, 9) / 65535) * 0.24;
    let shade = jitter * slow;
    if (tile.ground === GROUND.MOUNTAIN) shade *= 0.8 + Math.min(0.5, (th(lx, ly) - 2.4) / 14);
    if (tileModels && !flatTiles && material !== "cobble" && GROUND_TILES[material]) shade *= BASE_BOOST;
    const uvScale = water ? WATER_UV_SCALE : UV_SCALE;
    const color: [number, number, number] = [shade, shade, shade];

    const bridge = tile.ground === GROUND.BRIDGE;
    const flatH = th(lx, ly);
    const corners = [
      [lx, ly], // NW
      [lx + 1, ly], // NE
      [lx + 1, ly + 1], // SE
      [lx, ly + 1], // SW
    ] as const;
    const ids = corners.map(([i, j]) => {
      const wx = tileToWorldX(x0 + i);
      const wz = tileToWorldZ(y0 + j);
      const y = bridge ? flatH : ch(i, j);
      const n: [number, number, number] = bridge ? [0, 1, 0] : normalAt(i, j);
      return g.vertex([wx, y, wz], n, [wx * uvScale, wz * uvScale], color);
    }) as [number, number, number, number];
    // front face up in Babylon's left-handed system (checked in the browser): NW, SE, NE and NW, SW, SE
    g.tri(ids[0], ids[2], ids[1]);
    g.tri(ids[0], ids[3], ids[2]);
  };

  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const tile = tileAt(lx, ly);
      const tx = x0 + lx;
      const ty = y0 + ly;
      const material = groundMaterial(tile);
      if (!flatTiles) addGroundQuad(lx, ly, tile, tx, ty, material);

      // objects on the tile
      const wx = tileToWorldX(tx) + TILE_SIZE / 2;
      const wz = tileToWorldZ(ty) - TILE_SIZE / 2;
      const hh = hash2(0xbeef, tx, ty) >>> 0;
      const spec = propSpec(tile.deco, tile.biome, hh, tileModels);
      const base = (ch(lx, ly) + ch(lx + 1, ly) + ch(lx + 1, ly + 1) + ch(lx, ly + 1)) / 4;
      if (spec) {
        // the old game's tile models are placed as they are (they fill the tile, turned in steps of 90 degrees); the other props vary in size and turn freely
        const asTile = tileModels && (spec.model.startsWith("veg_") || spec.model.startsWith("mtn_") || tile.deco === DECO.LANDMARK);
        const jitterScale = asTile ? 1 : 0.9 + (((hh >>> 4) % 100) / 100) * 0.25;
        const free = tile.deco !== DECO.TREE && tile.deco !== DECO.LANDMARK; // small things sit at random spots inside the tile, groves fill it
        const ox = free ? (((hh >>> 8) % 100) / 100 - 0.5) * 1.6 : 0;
        const oz = free ? (((hh >>> 16) % 100) / 100 - 0.5) * 1.6 : 0;
        props.push({
          model: spec.model,
          x: wx + ox,
          y: base + (flatTiles && asTile && hasOwnSlab(spec.model) ? FLAT_SLAB_SINK : 0),
          z: wz + oz,
          // trees stand in steps of 90 degrees in every mode (also on the old flat ground), small things turn freely
          rotY: (asTile || tile.deco === DECO.TREE ? ((hh >>> 12) % 4) * 90 : (hh >>> 12) % 360) * (Math.PI / 180),
          scale: spec.scale * jitterScale,
          scaleXYZ: spec.scaleXYZ,
          lod: spec.lod ? { model: spec.lod.model, scale: spec.lod.scale * jitterScale } : undefined,
        });
      }
      // the old ground tile under whatever else stands on the tile, trees and mountains too: their models bring a slab of their own, but some
      // (the swamp's old tree, the mountains) sink it or lack it, and the dark base quad showed around them as a lower floor. The ground tile
      // lies a hair above such a slab, so the slab is hidden and the ground is the same all over. A bridge and water have none.
      const groundTile = tileModels && !flatTiles && tile.ground !== GROUND.BRIDGE ? GROUND_TILES[tile.ground === GROUND.MOUNTAIN ? landMaterial(tile.biome) : material] : undefined;
      if (groundTile) {
        const model = groundModel(groundTile.model);
        // the full tiles of the original set are nearly square, they keep the old game's size
        const k = model !== groundTile.model && groundTile.model !== "gnd_dirt" ? 1 / GROUND_FILL : 1;
        props.push({
          model,
          x: wx,
          y: base + slabLift(hash2(0x6a0e, tx, ty) >>> 0),
          z: wz,
          rotY: ((hash2(0x6a0d, tx, ty) >>> 10) % 4) * 90 * (Math.PI / 180),
          scale: groundTile.scale * k,
          scaleXYZ: groundTile.scaleXYZ && [groundTile.scaleXYZ[0] * k, groundTile.scaleXYZ[1], groundTile.scaleXYZ[2] * k],
          nearOnly: true,
        });
      }
      if (tileModels && tile.ground === GROUND.MOUNTAIN) {
        // a mountain tile is the old game's mountain model on level ground (the same models as the campaign's outside map)
        const m = TILE_MOUNTAINS[tile.biome];
        props.push({
          model: m.model,
          x: wx,
          y: base + (flatTiles ? FLAT_SLAB_SINK : 0),
          z: wz,
          rotY: ((hh >>> 12) % 4) * 90 * (Math.PI / 180),
          scale: m.scale,
          scaleXYZ: m.scaleXYZ,
          lod: m.lod,
        });
      }
    }
  }

  if (flatTiles) {
    // the painted tiles sit on the corners of the map tiles: the corner (i, j) is the north-west corner of tile (i, j) and the picture
    // reaches half a tile to every side, so the chunk draws the pictures of its own corners and its neighbour the rest
    const terrain = grid.map(flatTerrainOf);
    const terrainAt = (lx: number, ly: number) => terrain[(ly + 2) * GRID + (lx + 2)]!;
    const half = TILE_SIZE / 2;
    for (let j = 0; j < CHUNK_SIZE; j++) {
      for (let i = 0; i < CHUNK_SIZE; i++) {
        const g = group(`flat:${flatTiles.pick(terrainAt(i - 1, j - 1), terrainAt(i, j - 1), terrainAt(i - 1, j), terrainAt(i, j))}`);
        const px = tileToWorldX(x0 + i);
        const pz = tileToWorldZ(y0 + j);
        const up: [number, number, number] = [0, 1, 0];
        const white: [number, number, number] = [1, 1, 1];
        // the top of the picture is north; the same winding as the ground quads above
        const nw = g.vertex([px - half, 0, pz + half], up, [0, 1], white);
        const ne = g.vertex([px + half, 0, pz + half], up, [1, 1], white);
        const se = g.vertex([px + half, 0, pz - half], up, [1, 0], white);
        const sw = g.vertex([px - half, 0, pz - half], up, [0, 0], white);
        g.tri(nw, se, ne);
        g.tri(nw, sw, se);
      }
    }
  }

  // points of interest are drawn once, by the chunk that holds their centre
  // (the world is a globe: a place across the seam is found at the position it has beside this chunk)
  for (const poi of world.poisInRect(x0, y0, x0 + CHUNK_SIZE - 1, y0 + CHUNK_SIZE - 1)) props.push(poiProp(poi, ch, x0, y0, tileAt));

  // pack groups into shared buffers; every group is one contiguous index range = one submesh
  const names = [...groups.keys()].sort();
  let vCount = 0;
  let iCount = 0;
  for (const n of names) {
    vCount += groups.get(n)!.positions.length / 3;
    iCount += groups.get(n)!.indices.length;
  }
  const out: ChunkGeometry = {
    positions: new Float32Array(vCount * 3),
    normals: new Float32Array(vCount * 3),
    uvs: new Float32Array(vCount * 2),
    colors: new Float32Array(vCount * 4),
    indices: new Uint32Array(iCount),
    groups: [],
    props,
  };
  let v = 0;
  let ii = 0;
  for (const n of names) {
    const g = groups.get(n)!;
    out.positions.set(g.positions, v * 3);
    out.normals.set(g.normals, v * 3);
    out.uvs.set(g.uvs, v * 2);
    out.colors.set(g.colors, v * 4);
    for (let k = 0; k < g.indices.length; k++) out.indices[ii + k] = g.indices[k]! + v;
    out.groups.push({ material: n, start: ii, count: g.indices.length });
    v += g.positions.length / 3;
    ii += g.indices.length;
  }
  return out;
}

/** Yaw that turns a model whose front is +z (north) towards a side; grid y grows south, which is -z. */
const SIDE_YAW: Record<PoiSide, number> = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 };

function poiProp(poi: Poi, ch: (i: number, j: number) => number, x0: number, y0: number, tileAt: (lx: number, ly: number) => TileInfo): PropInstance {
  const spec = POI_MODEL[poi.kind === "dungeon" && poi.size === 3 ? "pyramid" : poi.kind]!;
  const lx = poi.x - x0;
  const ly = poi.y - y0;
  const base = (ch(lx, ly) + ch(lx + 1, ly) + ch(lx + 1, ly + 1) + ch(lx, ly + 1)) / 4;
  // the door, gate or crest is on the model's +z side at yaw 0: turn it to the side the visitors come from (the item's own yaw
  // corrects models whose front is built elsewhere), which is also the side the party is asked to enter from
  const front = poiFront(poi);
  const rotY = SIDE_YAW[front.side] + (spec.yaw * Math.PI) / 180;
  // the model stands in the middle of its footprint and is scaled to fill it: the old items are about one tile wide
  const b = poiBounds(poi);
  const s = poi.size;
  const scaleXYZ: [number, number, number] = [spec.scaleXYZ[0] * s, spec.scaleXYZ[1] * s, spec.scaleXYZ[2] * s];
  return { model: spec.model, x: tileToWorldX(b.x0) + (s * TILE_SIZE) / 2, y: base, z: tileToWorldZ(b.y0) - (s * TILE_SIZE) / 2, rotY, scale: spec.scale * s, scaleXYZ };
}
