import type { CellStyle } from "../interiors/types";

/**
 * The 47 block types of the old editor (BLOCKS table, entities.py add_block) mapped to the look of the new renderer.
 * The old game placed one 3D model per block; here floors and walls come from the textures of the old models and
 * the outdoor tiles (mountains, forests) reuse the tile models of the overworld.
 */
export type BlockFamily = "city" | "dungeon" | "fortress" | "cave" | "cyber" | "outside";

export interface BlockDef {
  id: number;
  family: BlockFamily;
  /** floor: walkable; wall: tall solid; low: flat and closed (water, mountains, forests). */
  cls: CellStyle["cls"];
  /** Walkable although it is `low` for the renderer: the party wades through lava and walks between palm trees. */
  walkable: boolean;
  /** Water that needs a talent: `seafarer` for the sea, `swimmer` for rivers. */
  water?: "seafarer" | "swimmer";
  /** Breakable wall: becomes `replacement` when broken (the old editor names the replacement in the action). */
  breakable?: boolean;
  /**
   * A floor cell with a wall piece on one border (`slabSide`): monsters and shots treat it as shut (`walkable` is false), but the
   * party can step into it from the opposite side to see the wall up close, and can never pass the wall piece.
   */
  slab?: boolean;
  /** Door block: closed until opened by an action. */
  door?: boolean;
  /** Sound under the feet. */
  step?: "water" | "snow" | "swamp";
  style: CellStyle;
}

const T = (name: string) => `tex/${name}`;
const G = (name: string) => `terrain/${name}`;

const wall = (tex: string): CellStyle => ({ cls: "wall", floor: null, wall: tex, ceiling: null });
const floor = (tex: string, ceiling: string | null = null, extra: Partial<CellStyle> = {}): CellStyle => ({ cls: "floor", floor: tex, wall: null, ceiling, ...extra });
const low = (tex: string, extra: Partial<CellStyle> = {}): CellStyle => ({ cls: "low", floor: tex, wall: null, ceiling: null, ...extra });
const tile = (key: string, sx: number, sy: number, sz: number): NonNullable<CellStyle["model"]> => ({ key, scale: sx, scaleXYZ: [sx, sy, sz] });
/**
 * A model of a block that the old game loaded from a glTF file (the doors, frames and walls). Ursina mirrors glTF files in z and
 * Babylon in x, so the same file stands turned by half a circle: the side of a brittle wall that faces the party, the way a
 * door swings, which side of a gate frame the groove is on. The cell's rotation from the map is meant for the old orientation.
 */
const GLTF_YAW = 180;
const glb = (model: NonNullable<CellStyle["model"]>): NonNullable<CellStyle["model"]> => ({ ...model, yaw: GLTF_YAW });
/** A door frame model of the cell's size (the old game scales them by 1 to 1.5 so that they fill the cell). */
const frame = (key: string, sx = 1, sy = 1, sz = 1): NonNullable<CellStyle["model"]> => tile(key, sx, sy, sz);

/**
 * A dungeon block the old game built from one model of a cell (add_block 15 to 18 and 20) instead of a textured cube. The models are
 * 2 x 3 x 2 units, so the old scale of 1.5 x 1.473 x 1.5 fills the 4.5 high cell of a dungeon (`wallHeightOf`).
 */
const cellModel = (key: string) => glb(frame(key, 1.5, 1.473, 1.5));
/** A floor cell with a ceiling, in the dungeon texture, that holds one of those models. */
const dungeonCell = (key: string, extra: Partial<CellStyle> = {}): CellStyle => floor(T("tex_dungeon_floor"), T("tex_dungeon_ceiling"), { model: cellModel(key), ...extra });

const def = (id: number, family: BlockFamily, style: CellStyle, rest: Partial<Omit<BlockDef, "id" | "family" | "style">> = {}): BlockDef => ({
  id,
  family,
  cls: style.cls,
  walkable: style.cls === "floor",
  style,
  ...rest,
});

export const BLOCKS: Record<number, BlockDef> = Object.fromEntries(
  [
    // city
    def(1, "city", wall(T("tex_city_door"))),
    def(2, "city", wall(T("tex_city_wall"))),
    def(3, "city", floor(T("tex_city_floor"))),
    def(4, "city", floor(T("tex_city_floor"))),
    // the wall that can be broken looks like every other city wall until it is broken (its model has the wall piece at one edge of a
    // floor cell); the party can step into the cell but not past the wall piece, so a bump against it does not give the wall away
    def(5, "city", floor(T("tex_city_floor"), null, { model: glb(frame("blk_city_brittle", 1, 1, 1)) }), { breakable: true, walkable: false, slab: true }),
    def(6, "city", floor(T("tex_city_floor"), null, { model: glb(frame("blk_city_cracked", 1, 1, 1)) })),
    // outside
    def(7, "outside", { ...floor(T("tex_lava")), glow: true }),
    // the ground tiles are the old game's models (lumps of bushes, stones and tufts, simplified) on the flat ground texture
    def(8, "outside", floor(G("meadow"), null, { model: tile("gnd_grass", 1.7, 1, 1.7) })),
    def(9, "outside", floor(G("cobble"), null, { model: tile("gnd_cobble", 1.5, 2, 1.5) })),
    def(11, "outside", low(T("tex_water"), { water: true }), { water: "seafarer", step: "water" }),
    def(12, "outside", floor(G("road"), null, { model: tile("gnd_dirt", 1.54, 1, 1.54) })),
    // dungeon
    def(10, "dungeon", floor(T("tex_dungeon_floor"), T("tex_dungeon_ceiling"))),
    def(13, "dungeon", wall(T("tex_dungeon_wall"))),
    def(14, "dungeon", wall(T("tex_dungeon_door"))),
    // the open and the closed door, the wall that can be broken and what it leaves are models; the closed door and the brittle wall
    // are floor cells for the renderer that monsters cannot enter (`walkable: false`, the game blocks them like an item); the
    // party can step into the brittle wall's cell (`slab`), never into the closed door's
    def(15, "dungeon", dungeonCell("blk_door_open")),
    def(16, "dungeon", dungeonCell("blk_door_closed"), { door: true, walkable: false }),
    def(17, "dungeon", dungeonCell("blk_brittle_wall"), { breakable: true, walkable: false, slab: true }),
    def(18, "dungeon", dungeonCell("blk_cracked_wall")),
    // a wall piece with the doorway, as the old game's City door frame model; the metal gate (item 80) is made to fit into it
    def(19, "city", floor(T("tex_city_floor"), null, { model: glb(frame("frame_city")) })),
    def(20, "dungeon", dungeonCell("blk_gate2")),
    // outside tiles with models, at the sizes of entities.py add_block (a mountain is 2.3 high at 1.7 wide, so the party cannot see over it)
    def(21, "outside", low(G("rock"), { model: tile("mtn_mountain", 1.7, 2.3, 1.7) })),
    def(22, "outside", low(G("lava_ground"), { model: tile("mtn_lava", 2.55, 3, 2.55) })),
    def(23, "outside", low(G("forest"), { model: tile("veg_forest_tile", 2.2, 2.2, 2.2) })),
    def(24, "outside", floor(G("snow"), null, { model: tile("gnd_snow", 1.7, 1, 1.7) }), { step: "snow" }),
    def(25, "outside", floor(G("swamp"), null, { model: tile("gnd_swamp", 1.7, 1, 1.7) }), { step: "swamp" }),
    def(26, "outside", floor(G("desert"), null, { model: tile("gnd_desert", 1.65, 1, 1.65) })),
    def(27, "outside", low(G("snow"), { model: tile("veg_snowy_forest", 2.2, 2.2, 2.2) })),
    def(28, "outside", floor(G("desert"), null, { model: tile("veg_palms", 1.65, 2, 1.65) })),
    def(29, "outside", low(G("desert"), { model: tile("mtn_desert", 1.65, 2, 1.65) })),
    def(30, "outside", low(G("snow"), { model: tile("mtn_snowy", 1.65, 2, 1.65) })),
    def(31, "outside", low(G("swamp"), { model: tile("mtn_swamp", 1.65, 2, 1.65) })),
    def(32, "outside", low(G("meadow"), { model: tile("veg_trees", 1.7, 1.7, 1.7) })),
    def(33, "outside", low(T("tex_water"), { water: true }), { water: "swimmer", step: "water" }),
    // cyber
    def(34, "cyber", wall(T("tex_cyber_wall"))),
    def(35, "cyber", floor(T("tex_cyber_floor"), T("tex_cyber_ceiling"))),
    // the pit trap: the model is the floor with a hole in it (the old block has no floor of its own, only the ceiling)
    def(36, "dungeon", floor(T("tex_dungeon_floor"), T("tex_dungeon_ceiling"), { floorless: true, model: { key: "obj_pit", scale: 1.52, scaleXYZ: [1.52, 1, 1.52], y: 0.05 } })),
    def(37, "dungeon", wall(T("tex_black"))),
    // fortress: floors and walls without a ceiling (add_block 38 to 43 have none): a castle lies under the open sky
    def(38, "fortress", wall(T("tex_fortress_wall"))),
    def(39, "fortress", floor(T("tex_fortress_floor"))),
    def(40, "fortress", floor(T("tex_fortress_floor"))),
    // the fortress gate frame is scaled by 1.5 (add_block case 41); metal gate 80 fits into it
    def(41, "fortress", floor(T("tex_fortress_floor"), null, { model: frame("frame_fortress", 1.5, 1.5, 1.5) })),
    def(42, "fortress", wall(T("tex_fortress_wall")), { breakable: true }),
    def(43, "fortress", floor(T("tex_fortress_floor"))),
    // cave
    // the wall and the way out are glTF models in the old game (Cave wall 1.75, Cave exit 2.6, origins 1.5 and 1.6 up): the wall faces of
    // the mesh give way to them (`meshInterior`), only the cells next to open ground are drawn (`CampaignView.collect`)
    def(44, "cave", { ...wall(T("tex_cave")), model: glb({ ...tile("blk_cave_wall", 1.75, 1.75, 1.75), y: 1.5 }) }),
    def(45, "cave", { ...wall(T("tex_cave")), model: { ...tile("blk_cave_exit", 2.6, 2.6, 2.6), y: 1.6 } }),
    def(46, "cave", floor(T("tex_cave"), T("tex_cave_ceiling"))),
    // the old game scales this frame by 1.5 wide and 1.473 high (add_block case 47) and fits metal gate 81 into it
    def(47, "dungeon", floor(T("tex_dungeon_floor"), T("tex_dungeon_ceiling"), { model: glb(frame("frame_dungeon", 1.5, 1.473, 1.5)) })),
  ].map((b) => [b.id, b]),
);

/** Style used for the map border and for cells without a block. */
export const BORDER_STYLE: CellStyle = wall(T("tex_black"));

/** Texture files the campaign needs beyond the interior themes (so they can be preloaded). */
export function campaignTextures(): string[] {
  const set = new Set<string>();
  for (const b of Object.values(BLOCKS)) for (const t of [b.style.floor, b.style.wall, b.style.ceiling]) if (t) set.add(t);
  return [...set];
}

/** Blocks the old actions swap in when a wall breaks or a door opens. */
export const BLOCK_OPEN_DOOR = 15;
export const BLOCK_PIT = 36;
