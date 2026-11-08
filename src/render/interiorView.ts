import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { hash2 } from "../core/noise";
import { CRATE_ITEM, QUEST_PROP } from "../data/quest-table";
import { headFacing } from "../actions/quests";
import { heapGone } from "../actions/registry";
import type { ActionInstance, MapContent } from "../actions/types";
import { hasRoundWalls, roundCorners, ROUND_ITEM, type RoundCorner } from "../interiors/roundCorners";
import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import type { StaticModelInfo, TextureCache } from "./assets";
import { faceOpenYaw } from "./facing";
import { groundTexture, type FlatTileSet } from "./flatGround";
import { InteriorDoors } from "./interiorDoors";
import { BROKEN_PIECES, CEILING_RELIEF, hasGroundModels, hasWallModels, wallModelOfTexture, type Environment } from "./environment";
import { CELL_SIZE, cellCenterX, cellCenterZ, cellX, cellZ, ceilingModelAt, environmentModels, floorModelAt, meshInterior, modelCeilingCells, modelFloorCells, wallHeightOf, type WallPanel } from "./interiorMesher";
import { ALTAR_SCALE, shownItem, themedProp, WALL_HUNG } from "./interiorProps";
import { floatY, ITEM_MODELS, itemModelKey, itemProp, MAGIC_FLAMES_ITEM } from "./itemProps";
import { InteriorTraps } from "./interiorTraps";
import { GlowLines } from "./glowLines";
import { FLAT_Z_OFFSET, flatTileMaterial } from "./materials";
import type { PropRenderer } from "./props";
import type { PropInstance } from "./terrainMesher";
import type { Renderer } from "./engine";

/** The old game hung its shop signs at 0.55 of the model size. */
const SIGN_SCALE = 0.55;
/** The old items of the quest keys and key cards (what a quest chest shows), and how fast they turn: about 30 degrees a second. */
const SPINNING_ITEMS: ReadonlySet<number> = new Set(Object.values(QUEST_PROP));
const SPIN_SPEED = 0.5;

/** The old dungeon floor and its scale (add_block 10): a cobbled mesh, one model per cell. */
const FLOOR_MODEL = "blk_floor";
/** The floor of a cave in the flat environments: the painted dirt tile (the 3D environments put the old dirt model over it, `FLOOR_MODELS`). */
const CAVE_FLOOR = "terrain/flat/dirt_full";
const FLOOR_SCALE: [number, number, number] = [1.5, 1.473, 1.5];
/**
 * Cells around the party that get a floor model (a square of 17 x 17 at the most, a few thousand triangles each). The torch
 * reaches 7 cells and the dungeon fog (density 0.075) leaves under 10 % of what lies farther, so the rest is not worth its
 * triangles; the Light spell thins the fog a little, and the cells at the edge of the window are still in view then.
 */
const FLOOR_RADIUS = 8;
/** The city's tiles are seen in daylight and far through the thin fog, so their window is wider; beyond it the flat floor quad below shows the same tiles. */
const CITY_FLOOR_RADIUS = 10;
/** The ceiling hangs above the eyes and the torch hardly reaches it: a smaller window than the floor's. */
const CEILING_RADIUS = 6;
/** The wall pieces of "Full 3D" within this many cells of the party; farther off, the flat wall behind them shows. */
const PANEL_RADIUS = 10;
/** A floor tile of the user's lies a hair above the flat floor quad it covers; a ceiling hangs a hair under the flat one (no z-fighting at 1 cm). */
const TILE_LIFT = 0.012;
const CEILING_GAP = 0.01;
/** The tiles are cut to the cell and a little over, so that no seam of the background shows between two of them. */
const TILE_OVERLAP = 1.004;
/**
 * The cave's dirt tile (`gndx_dirt`) is a slab with rounded edges: its top bends down by 0.03 (model units) over the last bit and its sides fall 0.2 below the face, so two
 * neighbours leave a V-shaped groove whose bottom the flat quad cuts: the quad shone through as a light seam on every cell border, brightest under a crystal's light (4 Nov 2026).
 * Cut to the cell plus twice the bend (1.03), the flat tops of neighbours meet and nothing of the groove is left.
 */
const TILE_OVERLAP_BY_MODEL: Readonly<Record<string, number>> = { gndx_dirt: 1.05 };
/** Neighbours that overlap share their flat top: every other cell sits this much higher, so the two never fight for the same depth. */
const TILE_PARITY_LIFT = 0.004;
/** How far a wall piece stands out of its wall, in world units (the old piece was 0.175 thick: the banners and the gate were set for that). */
const PANEL_DEPTH = 0.175;
/** Yaw of a wall piece in front of its wall: the piece is turned so that its front, the side with the relief, looks into the cell. */
const PANEL_YAW = 0;

/**
 * The cave's walls and its way out are models of the old game (add_block 44 and 45: `Cave wall.glb` at scale 1.75 with its origin 1.5 up,
 * `Cave exit.glb` at 2.6 with its origin 1.6 up). Each is about a thousand triangles even reduced, so only the walls around the party are drawn.
 */
const CAVE_WALL = "blk_cave_wall";
const CAVE_EXIT = "blk_cave_exit";
const CAVE_WALL_RADIUS = 12;
/** Yaw of the exit model so that it faces north, towards the party. The first reading of the old maps (opening towards the floor, glTF turned by half a circle) had it the wrong way round: the user saw it turned by 180 degrees. */
const CAVE_EXIT_YAW = 0;

/** How many cells round the party the rounded corners of the spaceship are drawn (two models per corner, a few hundred corners in all). */
const ROUND_RADIUS = 14;

/** The models of the rounded corners of the spaceship (`Round inner corner.obj`, `Round outer corner.obj`). */
export function roundModelKeys(map: InteriorMap): string[] {
  return hasRoundWalls(map) ? [itemModelKey(ROUND_ITEM.inner), itemModelKey(ROUND_ITEM.outer)].filter((k): k is string => k !== null) : [];
}

/** The old item 100, `Castle Gate.glb` (scale 1.5): its origin is the middle of the cell in front of the gate, the slab stands on that cell's far edge. */
const CASTLE_GATE_ITEM = 100;

/** The model of the gate of a generated castle (the walls of the other places carry the door texture of their theme instead). */
export function castleGateModelKeys(map: InteriorMap): string[] {
  const key = map.castle && !map.styles ? itemModelKey(CASTLE_GATE_ITEM) : null;
  return key ? [key] : [];
}

/** The models a map needs beyond `INTERIOR_MODELS`: the rock pieces of a generated cave. */
export function caveModelKeys(map: InteriorMap): string[] {
  return map.kind === "cave" && !map.styles ? [CAVE_WALL, CAVE_EXIT] : [];
}

/**
 * The pillars of a generated level are the old game's "4 pillars" (four columns on the corners of one cell, fortress block 40), with the
 * texture of the place: the stone of the fortress wall in a dungeon, the pillar texture in a castle. A town uses the user's single column
 * (`blk_city_pillar`), four of which stand on the corners of a pillar cell (`SINGLE_PILLARS`).
 */
const PILLAR_MODELS: Partial<Record<InteriorMap["kind"], string>> = { dungeon: "blk_pillars_dungeon", fortress: "blk_pillars_castle", town: "blk_city_pillar" };

/** Pillar models that are one column (centred on their origin, 2 high and 0.6 wide) and not four: the view places one per corner of the cell. */
const SINGLE_PILLARS: ReadonlySet<string> = new Set(["blk_city_pillar"]);

/** The model of a map's pillars, if it has any. */
export function pillarModelKeys(map: InteriorMap): string[] {
  const key = PILLAR_MODELS[map.kind];
  return key && (map.pillars?.length ?? 0) > 0 ? [key] : [];
}

/** Mean luma of the wall textures (measured on the files: `tex_dungeon_wall` 0.160, ...), for `PropRenderer.setReference`. */
const WALL_MEAN: Record<string, number> = { tex_dungeon_wall: 0.16, tex_fortress_wall: 0.439, tex_cave: 0.276, tex_city_wall: 0.659, tex_cyber_wall: 0.257 };

/** How bright the walls of a map are under the party's light: the wall texture times the tint of the place. */
function wallBrightness(map: InteriorMap): number {
  const a = Color3.FromHexString(map.theme.ambient);
  return (WALL_MEAN[map.theme.wall] ?? 0.2) * (0.299 * a.r + 0.587 * a.g + 0.114 * a.b);
}

/** Objects of the `object` param of town lore actions. */
const TOWN_OBJECTS: Record<string, { model: string; scale: number }> = {
  statue: { model: "obj_statue", scale: 1.15 },
};

/**
 * What a broken wall leaves behind, as in the old maps: the brittle dungeon wall (block 17) becomes the cracked one (block 18) and the
 * brittle city wall (block 5) block 6, models that fill the cell and stand in the passage. A castle's wall (block 42) becomes plain floor
 * (block 43), and a cave or the cyber theme has no such model: the gap is just open. Until it is broken a wall that can be broken looks
 * like every other wall (the user's call), so there is nothing to draw for it.
 */
const BROKEN_WALL: Partial<Record<InteriorMap["kind"], { model: string; scale: [number, number, number]; glb: boolean }>> = {
  dungeon: { model: "blk_cracked_wall", scale: [1.5, 1.473, 1.5], glb: true },
  town: { model: "blk_city_cracked", scale: [1, 1, 1], glb: true },
};

/** How deep the old models of a broken wall stand (they are 0.3 to 0.45 deep as modelled): across the cell's edge, so that both sides are flush with the walls. */
const BROKEN_SLAB_DEPTH = 0.08;

const brokenWallLook =(map: InteriorMap) => (map.theme.id === "cyber" ? undefined : BROKEN_WALL[map.kind]);

/** The model a map needs for its broken walls (loaded with the others, before the first frame). */
export function brokenWallModelKeys(map: InteriorMap, content: MapContent): string[] {
  const look = brokenWallLook(map);
  return look && content.actions.some((a) => a.kind === "breakable_wall") ? [look.model] : [];
}

/** Chest models by hash, so a map has a mix. */
const CHESTS = ["obj_chest", "obj_chest_iron", "obj_chest_noble", "obj_chest_sapphire"];
const SHRINES = ["obj_well_red", "obj_well_yellow", "obj_altar"];

/** Models the interior view may ask for; loaded on demand. `ci_87` is the blade that hangs in a guillotine trap (map item 87). */
export const INTERIOR_MODELS = [...CHESTS, ...SHRINES, "obj_sign_inn", "obj_sign_bank", "obj_sign_guild", "obj_sign_smith", "obj_sign_tavern", "obj_sign_temple", "obj_sign_training", "obj_fountain", "obj_statue", "obj_spear_trap", "obj_pit", "obj_guillotine", "ci_87", "obj_lantern"];

/**
 * Renders one interior: floor, ceiling and wall mesh in sections, doors and gates and object instances (chests, shrines,
 * shop signs). Rebuild after the layout changes (breakable wall broken).
 */
export class InteriorView {
  private mesh: Mesh | null = null;
  private multi: MultiMaterial | null = null;
  private materials = new Map<string, StandardMaterial>();
  private readonly doors: InteriorDoors;
  private readonly traps: InteriorTraps;
  /** Lines of light over the floor (so far only the debug showcase has them). */
  private readonly glow: GlowLines;
  private owner = "";
  private map: InteriorMap | null = null;
  private content: MapContent | null = null;
  private brokenWalls = new Set<string>();
  /** The game's set of used-up actions (the same object, so it is always current): a key that was taken is no longer drawn. */
  private opened: ReadonlySet<string> = new Set();
  /** Theme the cached materials belong to; they are cached by role (floor, wall, ...), so a new theme needs new ones. */
  private materialTheme = "";
  /** The player's choice (Options > Graphics > Environment). A model only takes effect when it is loaded. */
  private environment: Environment = "flat";
  /** Floor cells (grid indices) a 3D floor model covers on the current map, the cells under a 3D ceiling, the wall faces with a wall piece and the cell the party last stood on. */
  private floorCells: number[] = [];
  private ceilingCells: number[] = [];
  private panelList: WallPanel[] = [];
  private floorFocus: { x: number; y: number } | null = null;
  private floorShown: { x: number; y: number } | null = null;
  private ceilingShown: { x: number; y: number } | null = null;
  private panelShown: { x: number; y: number } | null = null;
  /** Wall cells of a generated cave that touch the floor (grid indices), the cell last drawn around, and whether the cave's walls are models. */
  private caveWalls: number[] = [];
  private caveShown: { x: number; y: number } | null = null;
  private caveModels = false;
  private roundList: RoundCorner[] = [];
  private roundShown: { x: number; y: number } | null = null;
  private roundModels = false;

  constructor(
    private readonly r: Renderer,
    private readonly textures: TextureCache,
    private readonly props: PropRenderer,
    private readonly staticInfo: Record<string, StaticModelInfo>,
  ) {
    this.doors = new InteriorDoors(props, staticInfo);
    this.traps = new InteriorTraps(props, staticInfo);
    this.glow = new GlowLines(r.scene);
  }

  private styleMaterial(key: string, map: InteriorMap): StandardMaterial {
    const [kind, index] = key.split(":") as [string, string];
    const style = map.styles!.list[Number(index)]!;
    const file = kind === "floor" ? style.floor : kind === "ceiling" ? style.ceiling : style.wall;
    const m = new StandardMaterial(`interior:${key}`, this.r.scene);
    const tex = this.textures.get(`${kind === "floor" && file?.endsWith("tex_cave") ? CAVE_FLOOR : groundTexture(file ?? "tex/tex_black")}.webp`);
    m.diffuseTexture = tex;
    m.specularColor = Color3.Black();
    m.diffuseColor = Color3.FromHexString(map.theme.ambient);
    if (style.glow) m.emissiveColor = new Color3(0.9, 0.35, 0.1);
    // the water texture is shared with the overworld's water and scrolled by `TerrainMaterials`, its scale lives in the UVs
    if (style.water) m.diffuseColor = new Color3(0.6, 0.78, 0.95);
    if (kind === "floor" && map.kind === "cave") m.diffuseColor = m.diffuseColor.scale(0.75);
    return m;
  }

  private material(key: string, map: InteriorMap): StandardMaterial {
    let m = this.materials.get(key);
    if (m) return m;
    if (key.startsWith("flat:")) {
      m = flatTileMaterial(this.r.scene, this.textures, key.slice(5), FLAT_Z_OFFSET);
      this.materials.set(key, m);
      return m;
    }
    if (map.styles && key.includes(":")) {
      m = this.styleMaterial(key, map);
      this.materials.set(key, m);
      return m;
    }
    const t = map.theme;
    const file =
      key === "floor" ? t.floor : key === "ceiling" ? (t.ceiling ?? t.floor) : key === "door" ? t.door : t.wall;
    m = new StandardMaterial(`interior:${key}`, this.r.scene);
    m.diffuseTexture = this.textures.get(key === "floor" && map.kind === "cave" ? `${CAVE_FLOOR}.webp` : `tex/${file}.webp`);
    m.specularColor = Color3.Black();
    m.diffuseColor = Color3.FromHexString(t.ambient);
    if (key === "building") m.diffuseColor = Color3.FromHexString(t.ambient).multiply(new Color3(0.9, 0.82, 0.72));
    if (key === "floor" && map.kind === "cave") m.diffuseColor = Color3.FromHexString(t.ambient).scale(0.75);
    this.materials.set(key, m);
    return m;
  }

  show(map: InteriorMap, content: MapContent, opened: Set<string>, broken: Set<string>): void {
    this.dispose();
    // style indices mean something different in every campaign map, so their materials are not shared between maps;
    // the role materials (floor, wall, ...) are only shared inside one theme: a town opened after a dungeon would
    // otherwise keep the dungeon's floor and walls
    const sameTheme = this.materialTheme === map.theme.id;
    for (const [k, m] of this.materials) {
      if (!sameTheme || k.includes(":")) {
        m.dispose();
        this.materials.delete(k);
      }
    }
    this.materialTheme = map.theme.id;
    this.map = map;
    this.content = content;
    // the objects are lit like the walls around them (`PropRenderer.setReference`); the hand-built maps mix their own blocks and keep the old levels
    this.props.setReference(map.styles ? null : wallBrightness(map));
    this.brokenWalls = new Set(broken);
    this.opened = opened;
    this.owner = `interior:${map.key}`;
    this.floorFocus = null;
    this.caveShown = null;
    this.roundShown = null;
    this.ceilingShown = null;
    this.panelShown = null;
    // the traps come first: an open pit has no floor, so the mesh needs to know about it
    this.traps.show(map, content, opened, this.owner);
    this.buildMesh();
    this.buildObjects();
    this.doors.show(map, content, opened, this.owner);
    this.pushCastleGate();
    this.glow.show(map.showcase?.lines ?? []);
  }

  /** The gate of a generated castle stands on the exit cell, its slab on the edge towards the wall behind it (where the other places have a door texture). */
  private pushCastleGate(): void {
    const map = this.map;
    const key = map ? castleGateModelKeys(map)[0] : undefined;
    if (!map || !key || !this.props.has(key)) return;
    const info = ITEM_MODELS[String(CASTLE_GATE_ITEM)]!;
    const bearing = (Math.atan2(map.exit.x - map.spawn.x, map.spawn.y - map.exit.y) + 2 * Math.PI) % (2 * Math.PI);
    this.props.setInstances(`${this.owner}:gate`, [{ model: key, x: cellCenterX(map.exit.x), y: 0, z: cellCenterZ(map.exit.y), rotY: bearing, scale: info.scale, scaleXYZ: info.scale3 }]);
    this.props.flush();
  }

  /** The view distance's share of the windows of floor and rock models around the party (1 = the full radius). */
  setViewShare(share: number): void {
    this.viewShare = share;
    if (!this.map) return;
    this.caveShown = null;
    this.roundShown = null;
    this.pushFloor(true);
    this.pushCeiling(true);
    this.pushPanels(true);
    if (this.floorFocus) {
      this.pushCaveWalls(this.floorFocus.x, this.floorFocus.y);
      this.pushRoundCorners(this.floorFocus.x, this.floorFocus.y);
    }
  }

  private viewShare = 1;

  /** The 3D models of the environment on this map that are wanted and loaded: floors and ceilings from "3D Floor/Ceiling" on, wall pieces in "Full 3D". */
  private enabledModels(): Set<string> {
    const map = this.map;
    return new Set(map ? environmentModels(map, this.environment).filter((k) => this.props.has(k)) : []);
  }

  /** The player's choice of environment; takes effect at once on the map that is shown (the models it needs have to be loaded: `Game` asks for `environmentModels`). */
  setEnvironment(environment: Environment): void {
    if (this.environment === environment) return;
    this.environment = environment;
    if (this.map) this.buildMesh();
  }

  /** The models the environment wants on the map that is shown (empty when it is flat), for `Game` to load before it switches. */
  environmentKeys(environment: Environment): string[] {
    return this.map ? environmentModels(this.map, environment) : [];
  }

  /** The painted ground tiles of the flat mode for the outdoor parts of campaign maps (null: the textured floor quads alone). Takes effect at once. */
  setFlatTiles(tiles: FlatTileSet | null): void {
    if (this.flatTiles === tiles) return;
    this.flatTiles = tiles;
    if (this.map) this.buildMesh();
  }

  private flatTiles: FlatTileSet | null = null;

  /**
   * The party stands on this cell: the floor models around it are the ones drawn. A floor model is a few thousand triangles, so
   * a whole dungeon of them would be far too much; the window moves with the party.
   */
  focus(cx: number, cy: number): void {
    this.floorFocus = { x: cx, y: cy };
    this.pushFloor(false);
    this.pushCeiling(false);
    this.pushPanels(false);
    this.pushCaveWalls(cx, cy);
    this.pushRoundCorners(cx, cy);
  }

  /** The rounded corners of the spaceship within `ROUND_RADIUS` cells of the party. */
  private pushRoundCorners(cx: number, cy: number): void {
    const map = this.map;
    const owner = `${this.owner}:round`;
    if (!map || !this.roundModels) return;
    if (this.roundShown && this.roundShown.x === cx && this.roundShown.y === cy) return;
    this.roundShown = { x: cx, y: cy };
    const radius = Math.max(4, Math.round(ROUND_RADIUS * this.viewShare));
    const list: PropInstance[] = [];
    for (const c of this.roundList) {
      if (Math.abs(c.x - cx) > radius || Math.abs(c.y - cy) > radius) continue;
      const inst = itemProp(ROUND_ITEM[c.kind], c.yaw, cellCenterX(c.x), cellCenterZ(c.y), this.staticInfo);
      if (inst) list.push(inst);
    }
    this.props.setInstances(owner, list);
    this.props.flush();
  }

  /** The cave's rock pieces within `CAVE_WALL_RADIUS` cells of the party, and the way out. */
  private pushCaveWalls(cx: number, cy: number): void {
    const map = this.map;
    const owner = `${this.owner}:walls`;
    if (!map || !this.caveModels) return;
    if (this.caveShown && this.caveShown.x === cx && this.caveShown.y === cy) return;
    this.caveShown = { x: cx, y: cy };
    const list: PropInstance[] = [];
    // the way out stands in the wall behind the exit cell and opens towards it: no rock piece on that cell
    const dx = map.exit.x - map.spawn.x;
    const dy = map.exit.y - map.spawn.y;
    const exitCell = (map.exit.y + dy) * map.width + map.exit.x + dx;
    const wallRadius = Math.max(4, Math.round(CAVE_WALL_RADIUS * this.viewShare));
    for (const i of this.caveWalls) {
      if (i === exitCell) continue;
      const x = i % map.width;
      const y = (i - x) / map.width;
      if (Math.abs(x - cx) > wallRadius || Math.abs(y - cy) > wallRadius) continue;
      // the rock is the same on every side: turned in steps of 90 degrees by the cell, so neighbours do not repeat
      list.push({ model: CAVE_WALL, x: cellCenterX(x), y: 1.5, z: cellCenterZ(y), rotY: (((hash2(0x3a, x, y) >>> 8) % 4) * Math.PI) / 2, scale: 1.75, atOrigin: true });
    }
    list.push({ model: CAVE_EXIT, x: cellCenterX(map.exit.x + dx), y: 1.6, z: cellCenterZ(map.exit.y + dy), rotY: CAVE_EXIT_YAW, scale: 2.6, atOrigin: true });
    this.props.setInstances(owner, list);
    this.props.flush();
  }

  private pushFloor(force: boolean): void {
    const map = this.map;
    const owner = `${this.owner}:floor`;
    if (!map || this.floorCells.length === 0 || !this.floorFocus) {
      this.props.removeOwner(owner);
      this.floorShown = null;
      this.props.flush();
      return;
    }
    const at = this.floorFocus;
    // a few hundred matrices per step cost next to nothing, so the window follows the party cell by cell
    if (!force && this.floorShown && this.floorShown.x === at.x && this.floorShown.y === at.y) return;
    this.floorShown = { ...at };
    const list: PropInstance[] = [];
    for (const i of this.floorCells) {
      const x = i % map.width;
      const y = (i - x) / map.width;
      const model = floorModelAt(map, x, y);
      if (!model) continue;
      const near = Math.max(3, Math.round((model === FLOOR_MODEL ? FLOOR_RADIUS : CITY_FLOOR_RADIUS) * this.viewShare));
      if (Math.abs(x - at.x) > near || Math.abs(y - at.y) > near) continue;
      if (model === FLOOR_MODEL) {
        // the old game set the model 0.05 above the origin of its block; 0.02 keeps the model's ceiling plane under the real one
        list.push({ model, x: cellCenterX(x), y: 0.02, z: cellCenterZ(y), rotY: 0, scale: FLOOR_SCALE[0], scaleXYZ: FLOOR_SCALE, atOrigin: true });
        continue;
      }
      const fit = this.tileFit(model);
      // the face of the tile (not the tip of its highest engraving) lies a hair above the flat quad: set by the tips, the face lay under the quad and only the engravings showed
      if (fit) list.push({ model, x: cellCenterX(x), y: TILE_LIFT + ((x + y) & 1) * TILE_PARITY_LIFT - fit.face * fit.scale[1], z: cellCenterZ(y), rotY: 0, scale: fit.scale[0], scaleXYZ: fit.scale, atOrigin: true });
    }
    this.props.setInstances(owner, list);
    this.props.flush();
  }

  /**
   * How a slab model of the user's is scaled to fill one cell (the files are normalised to about 1.9 units), and the heights of its top and bottom above its
   * origin and of its face, the plane that holds most of its area (model units; the register's `surface`, the top without it). `relief` flattens the slab.
   */
  private tileFit(model: string, relief = 1): { scale: [number, number, number]; top: number; bottom: number; face: number } | null {
    const info = this.staticInfo[model];
    const b = info?.bounds;
    if (!b) return null;
    const overlap = TILE_OVERLAP_BY_MODEL[model] ?? TILE_OVERLAP;
    const sx = (CELL_SIZE * overlap) / (b[3] - b[0]);
    const sz = (CELL_SIZE * overlap) / (b[5] - b[2]);
    return { scale: [sx, ((sx + sz) / 2) * relief, sz], top: b[4], bottom: b[1], face: info?.surface ?? info?.groundTop ?? b[4] };
  }

  /** How far the flat ceiling is raised over the cells under each ceiling model that hangs above the room (`CEILING_RELIEF`): the depth of the flattened slab. */
  private ceilingLifts(models: ReadonlySet<string>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const model of models) {
      const relief = CEILING_RELIEF[model];
      const fit = relief === undefined ? null : this.tileFit(model, relief);
      if (fit) out[model] = (fit.top - fit.bottom) * fit.scale[1] + CEILING_GAP;
    }
    return out;
  }

  /** The 3D ceilings within `CEILING_RADIUS` cells: the flat back of each slab lies a hair under the flat ceiling, its relief hangs into the room. */
  private pushCeiling(force: boolean): void {
    const map = this.map;
    const owner = `${this.owner}:ceiling`;
    if (!map || this.ceilingCells.length === 0 || !this.floorFocus) {
      this.props.removeOwner(owner);
      this.ceilingShown = null;
      this.props.flush();
      return;
    }
    const at = this.floorFocus;
    if (!force && this.ceilingShown && this.ceilingShown.x === at.x && this.ceilingShown.y === at.y) return;
    this.ceilingShown = { ...at };
    const near = Math.max(2, Math.round(CEILING_RADIUS * this.viewShare));
    const height = wallHeightOf(map);
    const list: PropInstance[] = [];
    for (const i of this.ceilingCells) {
      const x = i % map.width;
      const y = (i - x) / map.width;
      if (Math.abs(x - at.x) > near || Math.abs(y - at.y) > near) continue;
      const model = ceilingModelAt(map, x, y);
      const relief = model ? CEILING_RELIEF[model] : undefined;
      const fit = model ? this.tileFit(model, relief) : null;
      if (!model || !fit) continue;
      // a flattened ceiling hangs above the room, its lowest point at the height of the flat ceiling (which `meshInterior` raised to its back); the others hang from the flat ceiling
      const y0 = relief === undefined ? height - CEILING_GAP - fit.top * fit.scale[1] : height - fit.bottom * fit.scale[1];
      list.push({ model, x: cellCenterX(x), y: y0, z: cellCenterZ(y), rotY: 0, scale: fit.scale[0], scaleXYZ: fit.scale, atOrigin: true });
    }
    this.props.setInstances(owner, list);
    this.props.flush();
  }

  /** The wall pieces of "Full 3D" within `PANEL_RADIUS` cells: each stands in the cell with its back on the wall, in front of the flat wall face. */
  private pushPanels(force: boolean): void {
    const map = this.map;
    const owner = `${this.owner}:panels`;
    if (!map || this.panelList.length === 0 || !this.floorFocus) {
      this.props.removeOwner(owner);
      this.panelShown = null;
      this.props.flush();
      return;
    }
    const at = this.floorFocus;
    if (!force && this.panelShown && this.panelShown.x === at.x && this.panelShown.y === at.y) return;
    this.panelShown = { ...at };
    const near = Math.max(3, Math.round(PANEL_RADIUS * this.viewShare));
    const height = wallHeightOf(map);
    const list: PropInstance[] = [];
    for (const p of this.panelList) {
      if (Math.abs(p.x - at.x) > near || Math.abs(p.y - at.y) > near) continue;
      const b = this.staticInfo[p.model]?.bounds;
      if (!b) continue;
      // the piece is about 0.7 wide, 0.95 high and 0.08 thick: stretched to the cell's width and the wall's height (the pieces keep their proportions), and pressed to `PANEL_DEPTH`
      // whatever its own relief (the banners hang a hand's breadth from the wall; a deeper piece cut through them). An end that closes a corner reaches over the notch (`WallPanel.grow`)
      const thick = PANEL_DEPTH;
      const sx = (CELL_SIZE + thick * p.grow.length) / (b[3] - b[0]);
      const sy = height / (b[4] - b[1]);
      const sz = thick / (b[5] - b[2]);
      // the face looks into the cell: its normal is the opposite of the direction of the wall
      const d = FACING_DELTA[p.dir];
      const nx = -d.dx;
      const nz = d.dy;
      const half = CELL_SIZE / 2;
      // the middle of the wall face (on the edge of the cell), moved into the cell by half the piece's thickness: its back lies on the wall
      let cx = cellCenterX(p.x) - nx * half + nx * thick * 0.5;
      let cz = cellCenterZ(p.y) - nz * half + nz * thick * 0.5;
      // the grown ends move the middle of the piece along the wall by half of what they grow
      for (const side of p.grow) {
        cx += FACING_DELTA[side].dx * thick * 0.5;
        cz -= FACING_DELTA[side].dy * thick * 0.5;
      }
      list.push({ model: p.model, x: cx, y: -b[1] * sy, z: cz, rotY: Math.atan2(nx, nz) + PANEL_YAW, scale: sx, scaleXYZ: [sx, sy, sz], atOrigin: true });
    }
    this.props.setInstances(owner, list);
    this.props.flush();
  }

  private buildMesh(): void {
    const map = this.map!;
    this.mesh?.dispose(false, false);
    this.multi?.dispose(false, false);
    const models = hasGroundModels(this.environment) ? this.enabledModels() : new Set<string>();
    const holes = this.traps.holes();
    this.floorCells = modelFloorCells(map, holes, models);
    this.ceilingCells = modelCeilingCells(map, models);
    // a cave's walls are the old game's rock models when they are loaded; the cells next to the floor are the ones that show
    this.caveModels = caveModelKeys(map).length > 0 && caveModelKeys(map).every((k) => this.props.has(k));
    // the spaceship's walls are round where the models of the corners are loaded
    const roundKeys = roundModelKeys(map);
    this.roundModels = roundKeys.length === 2 && roundKeys.every((k) => this.props.has(k));
    this.roundList = this.roundModels ? roundCorners(map) : [];
    this.props.removeOwner(`${this.owner}:round`);
    this.caveWalls = [];
    if (this.caveModels) {
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (map.cells[y * map.width + x] !== CELL.SOLID) continue;
          let touches = false;
          for (let dy = -1; dy <= 1 && !touches; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < map.width && y + dy < map.height && map.cells[(y + dy) * map.width + x + dx] === CELL.FLOOR) touches = true;
          if (touches) this.caveWalls.push(y * map.width + x);
        }
      }
    }
    const geo = meshInterior(map, new Set(), { models, holes, modelWalls: this.caveModels, roundWalls: this.roundModels, flatTiles: this.flatTiles ?? undefined, ceilingLift: this.ceilingLifts(models) });
    const mesh = new Mesh(`interior:${map.key}`, this.r.scene);
    const vd = new VertexData();
    vd.positions = geo.positions;
    vd.normals = geo.normals;
    vd.uvs = geo.uvs;
    vd.colors = geo.colors;
    vd.indices = geo.indices;
    vd.applyToMesh(mesh, false);
    mesh.hasVertexAlpha = false;
    const multi = new MultiMaterial("interior", this.r.scene);
    const index = new Map<string, number>();
    mesh.subMeshes = [];
    const vertexCount = geo.positions.length / 3;
    for (const g of geo.groups) {
      let i = index.get(g.material);
      if (i === undefined) {
        i = multi.subMaterials.length;
        multi.subMaterials.push(this.material(g.material, map));
        index.set(g.material, i);
      }
      new SubMesh(i, 0, vertexCount, g.start, g.count, mesh);
    }
    mesh.material = multi;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    this.mesh = mesh;
    this.multi = multi;
    // the wall pieces belong to the faces of this mesh: only "Full 3D" draws them
    this.panelList = hasWallModels(this.environment) ? geo.panels : [];
    this.pushFloor(true);
    this.pushCeiling(true);
    this.pushPanels(true);
    // the models of a cave's rock and of the round corners are chosen from the cells: a changed map (a wall that gave way) shows them again at once, not with the next step
    if (this.floorFocus) {
      this.caveShown = null;
      this.roundShown = null;
      this.pushCaveWalls(this.floorFocus.x, this.floorFocus.y);
      this.pushRoundCorners(this.floorFocus.x, this.floorFocus.y);
    }
  }

  /**
   * In "Full 3D" a wall that gave way is the user's broken wall piece (`BROKEN_PIECES`: the wall with a hole and its rubble) instead of the old model, stretched like
   * the other wall pieces to the cell's width and the wall's height and standing across the passage. False when the environment or the map has none.
   */
  /**
   * Where a broken wall's slab stands in its cell (7. 11. 2026): flush with the walls beside it, on the cell's edge, not in the middle of the passage. The edge is the one
   * towards the more open side (a street, not the one-cell pocket behind a brittle wall; a tie takes the lower coordinate). Returns the offset of the slab's middle from the
   * cell's middle for a slab `thick` deep: its outer face lies on the edge.
   */
  private brokenWallShift(map: InteriorMap, cx: number, cy: number, alongX: boolean, thick: number, out = 0): { dx: number; dz: number; sx: number; sz: number } {
    // the two cells the passage joins, the one at the lower coordinate first; `sign` is the way to it in the world (z runs against y)
    const sides = alongX
      ? [{ x: cx - 1, y: cy, sx: -1, sz: 0 }, { x: cx + 1, y: cy, sx: 1, sz: 0 }]
      : [{ x: cx, y: cy - 1, sx: 0, sz: 1 }, { x: cx, y: cy + 1, sx: 0, sz: -1 }];
    const open = (s: { x: number; y: number }) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ox, oy]) => {
      const nx = s.x + ox!;
      const ny = s.y + oy!;
      return !(nx === cx && ny === cy) && nx >= 0 && ny >= 0 && nx < map.width && ny < map.height && map.cells[ny * map.width + nx] === CELL.FLOOR;
    }).length;
    const pick = open(sides[1]!) > open(sides[0]!) ? sides[1]! : sides[0]!;
    // `out`: how far the slab's outer face stands beyond the edge, towards the open side (the wall pieces of "Full 3D" stand that far in front of the wall)
    const reach = CELL_SIZE / 2 + out - thick / 2;
    return { dx: pick.sx * reach, dz: pick.sz * reach, sx: pick.sx, sz: pick.sz };
  }

  private pushBrokenPiece(instances: PropInstance[], map: InteriorMap, alongX: boolean, x: number, z: number, cx: number, cy: number): boolean {
    const piece = hasWallModels(this.environment) ? BROKEN_PIECES[wallModelOfTexture(map.theme.wall) ?? ""] : undefined;
    const b = piece ? this.staticInfo[piece]?.bounds : undefined;
    if (!piece || !b || !this.props.has(piece)) return false;
    const sx = CELL_SIZE / (b[3] - b[0]);
    const sy = wallHeightOf(map) / (b[4] - b[1]);
    const sz = (PANEL_DEPTH * 2) / (b[5] - b[2]);
    const shift = this.brokenWallShift(map, cx, cy, alongX, PANEL_DEPTH * 2);
    instances.push({ model: piece, x: x + shift.dx, y: -b[1] * sy, z: z + shift.dz, rotY: alongX ? Math.PI / 2 : 0, scale: sx, scaleXYZ: [sx, sy, sz], atOrigin: true });
    return true;
  }

  /** Shows the layout of a changed map (campaign maps change when walls break, doors open or blocks move). */
  refresh(map: InteriorMap): void {
    this.map = map;
    this.buildMesh();
  }

  /** Rebuilds wall geometry after a wall was broken (the map cell must already be floor). */
  wallBroken(uid: string): void {
    this.brokenWalls.add(uid);
    this.buildMesh();
    this.buildObjects();
  }

  /** Cells (`y * width + x`) that look like wall although they are floor: closed doors and walls that can be broken. */
  private wallLike = new Set<number>();
  /** Cells (`y * width + x`) that an object stands on (a chest, a statue, a person): another object does not turn its front to them. */
  private objectCells = new Set<number>();

  /** The props of keys and key cards (before their turn) and how far they have turned. */
  private spinners: PropInstance[] = [];
  private spin = 0;
  /** Magic flames standing as objects (decoration, shrines): they float on the spot like static monsters. */
  private flames: PropInstance[] = [];
  private clock = 0;
  /** Quest 2's heads (42nd playtest, point 5): the facing each was last drawn with, the turns to start at the next redraw (seconds) and the turns under way. */
  private headFacings = new Map<string, number>();
  private turnPending = new Map<string, number>();
  private turning = new Map<string, { t: number; seconds: number; delta: number }>();
  private turners: { uid: string; prop: PropInstance }[] = [];

  /** The next redraw turns the head `uid` a quarter circle over `seconds` instead of setting it to its new facing at once. */
  startHeadTurn(uid: string, seconds: number): void {
    this.turnPending.set(uid, Math.max(0.2, seconds));
  }

  private buildObjects(): void {
    const map = this.map!;
    let instances: PropInstance[] = [];
    this.spinners = [];
    this.turners = [];
    this.wallLike = new Set(this.content!.actions.filter((a) => a.kind === "door" || (a.kind === "breakable_wall" && !this.brokenWalls.has(a.uid))).map((a) => a.y * map.width + a.x));
    this.objectCells = new Set(this.content!.actions.filter((a) => a.kind !== "service" && a.kind !== "trap" && a.kind !== "transfer" && a.kind !== "ambush" && !this.wallLike.has(a.y * map.width + a.x)).map((a) => a.y * map.width + a.x));
    for (const a of this.content!.actions) {
      const x = cellCenterX(a.x);
      const z = cellCenterZ(a.y);
      const h = hash2(0x51, a.x, a.y) >>> 0;
      // a key or key card that has been taken is gone from its chest
      if (a.kind === "treasure" && typeof a.params.quest === "string" && Number(a.params.chest) !== CRATE_ITEM && this.opened.has(a.uid)) continue;
      // so is an emptied heap of treasure
      if (heapGone(a, this.opened)) continue;
      // a themed place shows the old items of its style (a barrel, a bone pile, a banner) instead of a chest or well picked by chance
      const themed = themedProp(a, x, z, (this.faceOpen(map, a, h >>> 8) * 180) / Math.PI, this.staticInfo, this.opened, this.content ?? undefined);
      // a head of the ring that is not there leaves its cell empty
      if (!themed && a.kind === "head") continue;
      if (themed && a.kind === "head" && a.params.mode === "rotate") {
        const facing = headFacing(a, this.opened);
        const before = this.headFacings.get(a.uid);
        this.headFacings.set(a.uid, facing);
        const pending = this.turnPending.get(a.uid);
        this.turnPending.delete(a.uid);
        // always clockwise, a quarter at a time (`turnHead`): the way to the new facing is (new - old) mod 4 quarters
        if (pending !== undefined && before !== undefined && before !== facing) this.turning.set(a.uid, { t: 0, seconds: pending, delta: (((facing - before + 4) % 4) * Math.PI) / 2 });
        if (this.turning.has(a.uid)) {
          this.turners.push({ uid: a.uid, prop: themed });
          continue;
        }
      }
      if (themed) {
        // a banner or a carving hangs a hand's breadth from the flat wall: with the 3D wall pieces on it stands out of the wall by their depth too, or their stones cut through the cloth
        if (this.panelList.length > 0 && WALL_HUNG.has(shownItem(a) ?? -1)) {
          themed.x += Math.sin(themed.rotY) * PANEL_DEPTH;
          themed.z += Math.cos(themed.rotY) * PANEL_DEPTH;
        }
        (a.kind === "treasure" && typeof a.params.chest === "number" && SPINNING_ITEMS.has(a.params.chest) ? this.spinners : instances).push(themed);
        continue;
      }
      switch (a.kind) {
        case "treasure":
          instances.push({ model: CHESTS[h % CHESTS.length]!, x, y: 0, z, rotY: this.faceOpen(map, a, h >>> 8), scale: 0.85 });
          break;
        case "shrine": {
          const model = SHRINES[h % SHRINES.length]!;
          instances.push({ model, x, y: 0, z, rotY: this.faceOpen(map, a, h >>> 8), scale: model === "obj_altar" ? ALTAR_SCALE : 1.5 });
          break;
        }
        case "service": {
          const lot = map.lots.find((l) => l.door.x === a.x && l.door.y === a.y);
          instances.push(this.shopSign(map, `obj_sign_${String(a.params.service)}`, a, lot?.door.facing ?? "S", lot?.inline === true));
          break;
        }
        case "fountain":
          instances.push({ model: "obj_fountain", x, y: 0, z, rotY: 0, scale: 1.3 });
          break;
        case "lore": {
          const object = typeof a.params.object === "string" ? TOWN_OBJECTS[a.params.object] : undefined;
          // statues look at the fountain in the middle of the square
          if (object) instances.push({ model: object.model, x, y: 0, z, rotY: this.faceSquare(map, a), scale: object.scale });
          break;
        }
        case "breakable_wall": {
          if (this.brokenWalls.has(a.uid) && this.pushBrokenPiece(instances, map, a.params.axis === "x", x, z, a.x, a.y)) break;
          const look = brokenWallLook(map);
          if (!look || !this.brokenWalls.has(a.uid) || !this.props.has(look.model)) break;
          // In "Full 3D" the walls beside it wear wall pieces that stand `PANEL_DEPTH` in front of the wall: the slab is as deep as two of them and centred on the edge, so its
          // face is flush with them (from the side it showed a step, and the slab's blue edge, 7. 11. 2026, 47th playtest). Otherwise it is pressed flat across the edge.
          const panelled = hasWallModels(this.environment) && wallModelOfTexture(map.theme.wall) !== undefined;
          const slab = panelled ? PANEL_DEPTH * 2 : BROKEN_SLAB_DEPTH;
          const shift = this.brokenWallShift(map, a.x, a.y, a.params.axis === "x", panelled ? slab : 0, panelled ? PANEL_DEPTH : 0);
          // The slopes of its hole face the open side (the street), not the pocket: the glTF model's relief lies on its local -x, which has to point to the open side
          // (the first fix turned it by the axis alone, so it faced the pocket whenever the street lay on the other side; 47th playtest, point 9)
          const yaw = Math.atan2(shift.sz, -shift.sx) + (look.glb ? 0 : Math.PI);
          // the old block models hang off their origin (the city's slab lies 1.4 units beside it): they are put by their middle and then on the cell's edge
          // (`brokenWallShift`), flush with the walls beside. By the origin the broken wall stood a cell away from the one that gave way (7. 11. 2026). The register's bounds are
          // glTF's, and Babylon mirrors a glTF in x (`CellStyle.model.yaw`), so the middle of the model lies at (-middle x, middle z) here; `PropInstance.center` would take
          // the register's side and move it twice as far the wrong way
          // The slab (0.3 deep) is pressed flat to `BROKEN_SLAB_DEPTH` and stands across the edge itself: a deeper one was flush with the wall on one side only, and from the other its
          // edge and the end of the passage walls showed a step (the blue side of the slab, 7. 11. 2026)
          const b = this.staticInfo[look.model]?.bounds;
          const depth = b ? slab / (b[3] - b[0]) : look.scale[0];
          const mx = b ? (-(b[0] + b[3]) / 2) * depth : 0;
          const mz = b ? ((b[2] + b[5]) / 2) * look.scale[2] : 0;
          const mid = { x: mx * Math.cos(yaw) + mz * Math.sin(yaw), z: -mx * Math.sin(yaw) + mz * Math.cos(yaw) };
          instances.push({ model: look.model, x: x + shift.dx - mid.x, y: 0, z: z + shift.dz - mid.z, rotY: yaw, scale: look.scale[0], scaleXYZ: [depth, look.scale[1], look.scale[2]] });
          break;
        }
        default:
          break;
      }
    }
    const pillar = PILLAR_MODELS[map.kind];
    if (pillar && this.props.has(pillar)) {
      // the model is 2 high and 2.5 wide, its columns centred on the corners of the cell: 1.5 makes them one cell apart, and the height
      // reaches the ceiling (the old game used 2.05 for the 4.2 of its fortress walls)
      const height = wallHeightOf(map) / 2;
      // one column: the model is 2 high, so scale 1.5 reaches the town's wall height of 3 and makes it 0.9 wide; the columns sit where the four-pillar
      // model had them, on the corners of the cell
      if (SINGLE_PILLARS.has(pillar)) {
        const reach = CELL_SIZE / 2;
        for (const p of map.pillars ?? []) {
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
            instances.push({ model: pillar, x: cellCenterX(p.x) + sx * reach, y: 0, z: cellCenterZ(p.y) + sz * reach, rotY: 0, scale: height, scaleXYZ: [height, height, height] });
          }
        }
      } else for (const p of map.pillars ?? []) instances.push({ model: pillar, x: cellCenterX(p.x), y: 0, z: cellCenterZ(p.y), rotY: 0, scale: 1.5, scaleXYZ: [1.5, height, 1.5] });
    }
    // the models of the debug showcase that no old item stands for, turned to look south at the party
    for (const e of map.showcase?.extras ?? []) instances.push({ model: e.model, x: cellCenterX(e.x), y: e.lift ?? 0, z: cellCenterZ(e.y), rotY: Math.PI, scale: e.scale, ...(e.height ? { scaleXYZ: [e.scale, e.scale * e.height, e.scale] as [number, number, number] } : {}) });
    const flameModel = itemModelKey(MAGIC_FLAMES_ITEM);
    this.flames = flameModel ? instances.filter((p) => p.model === flameModel) : [];
    if (this.flames.length > 0) instances = instances.filter((p) => p.model !== flameModel);
    this.props.setInstances(this.owner, instances);
    this.pushSpinners();
    this.pushFlames();
    this.pushTurners();
    this.props.flush();
  }

  /** The heads that are turning: they have an owner of their own, redrawn every frame with the angle still to go. */
  private pushTurners(): void {
    this.props.setInstances(`${this.owner}:turn`, this.turners.map(({ uid, prop }) => {
      const turn = this.turning.get(uid)!;
      const k = Math.min(1, turn.t / turn.seconds);
      return { ...prop, rotY: prop.rotY - turn.delta * (1 - k * k * (3 - 2 * k)) };
    }));
  }

  /** Keys and key cards turn slowly about their own axis; they have an owner of their own, redrawn every frame. */
  private pushSpinners(): void {
    this.props.setInstances(`${this.owner}:spin`, this.spinners.map((p) => ({ ...p, center: true, rotY: p.rotY + this.spin })));
  }

  private pushFlames(): void {
    this.props.setInstances(`${this.owner}:float`, this.flames.map((p) => ({ ...p, y: p.y + floatY(this.clock, p.x * 7 + p.z * 13) })));
  }

  /** Draws the objects again, after one of them changed (a key was taken out of its chest). */
  refreshObjects(): void {
    if (this.map && this.content) this.buildObjects();
  }

  /**
   * A hanging shop sign, placed like the signs of the old Fountain Head: the model's origin is the middle of the street
   * cell next to the house wall, and the model reaches from there to the wall (its bracket is on the wall, the board
   * hangs 0.7 to 1.5 units out in the street). The sign goes on the wall beside the door niche, not in front of the door.
   */
  private shopSign(map: InteriorMap, model: string, door: ActionInstance, facing: Facing, inline = false): PropInstance {
    const out = FACING_DELTA[facing]; // grid delta of the outward direction
    const ox = out.dx;
    const oz = -out.dy; // world z grows north, grid y grows south
    // the side of the niche that has a house wall next to it (a niche at the corner of a house has the street on one side)
    let side = 1;
    const wallAt = (s: number) => map.cells[(door.y + s * -ox) * map.width + (door.x + s * -oz)] === CELL.BUILDING;
    if (!wallAt(1) && wallAt(-1)) side = -1;
    // a shop of the old ground plans is a cell of the street itself: the sign hangs over it
    let px = cellCenterX(door.x) + (inline ? 0 : (ox + side * -oz) * CELL_SIZE);
    let pz = cellCenterZ(door.y) + (inline ? 0 : (oz + side * ox) * CELL_SIZE);
    // lowest point of the board: 2.0 model units above the origin, which the original placed 0.9 above the floor;
    // the loaded model extends along -x from its origin, so +x of the model points away from the wall
    let rotY = Math.atan2(-oz, ox);
    if (inline) {
      // the bracket sits on a wall at the side of the street, so the board stands across the way and is read from the street; hung from the
      // wall that carries the door it would be seen edge-on by everyone who walks up to the shop (the sixteenth-playtest follow-up)
      const solidAt = (x: number, y: number) => map.cells[y * map.width + x] !== CELL.FLOOR;
      const beside = (s: number) => ({ x: door.x + s * -out.dy, y: door.y + s * out.dx });
      const walls = [1, -1].filter((s) => solidAt(beside(s).x, beside(s).y));
      if (walls.length > 0) {
        const wallSide = walls[(hash2(0x73, door.x, door.y) >>> 4) % walls.length]!;
        // grid delta of the side wall; the model's +x points away from it
        rotY = Math.atan2(-(wallSide * out.dx), -(wallSide * -out.dy));
      } else {
        // the street runs along the wall of the door: the bracket goes on that wall one cell along the street, beside the door, never on it
        // (the generator leaves the wall standing on both sides of its door, so the cell beside is a wall)
        const along = [1, -1].filter((s) => {
          const c = beside(s);
          return !solidAt(c.x, c.y) && solidAt(c.x - out.dx, c.y - out.dy);
        });
        if (along.length > 0) {
          const c = beside(along[(hash2(0x73, door.x, door.y) >>> 4) % along.length]!);
          px = cellCenterX(c.x);
          pz = cellCenterZ(c.y);
        }
      }
    }
    return { model, x: px, y: 0.9 + 2 * SIGN_SCALE, z: pz, rotY, scale: SIGN_SCALE };
  }

  /**
   * Yaw that puts an object's back to a wall and its front to the open room (the old maps turn their chests the same way). The
   * models face north at yaw 0 and the yaw is the compass bearing, as for the campaign's items. Where two sides qualify (a corner)
   * or none does (a pillar in the open), `pick` decides, so the choice stays stable.
   */
  private faceOpen(map: InteriorMap, a: ActionInstance, pick: number): number {
    return faceOpenYaw(map, { wallLike: this.wallLike, objectCells: this.objectCells }, a, pick, WALL_HUNG.has(shownItem(a) ?? -1));
  }

  /** Yaw that turns an object on a square toward the middle of that square. */
  private faceSquare(map: InteriorMap, a: ActionInstance): number {
    const p = map.plaza;
    if (!p) return 0;
    const dx = p.x + (p.w - 1) / 2 - a.x;
    const dz = -(p.y + (p.h - 1) / 2 - a.y);
    return Math.atan2(dx, dz);
  }

  /** Opens or closes a door: a wooden door swaps its model at once, a gate slides out of its frame (`update`). */
  setDoor(uid: string, open: boolean): void {
    this.doors.set(uid, open);
  }

  isDoorClosed(uid: string): boolean {
    return this.doors.isClosed(uid);
  }

  /** Can the party step into the cell of this door? A sliding door that is still opening cannot be walked through yet (`InteriorDoors.isPassable`). */
  isDoorPassable(uid: string): boolean {
    return this.doors.isPassable(uid);
  }

  /** Seconds a sliding door needs to open or close (the length of its sound). */
  set slideSeconds(seconds: number) {
    this.doors.slideSeconds = seconds;
  }

  /** Seconds a wooden door needs to swing open (the length of its sound). */
  set swingSeconds(seconds: number) {
    this.doors.swingSeconds = seconds;
  }

  /** A pit went off: the floor under it is cut out and the pit model takes its place. It stays open. */
  openPit(uid: string): void {
    if (this.traps.openPit(uid)) this.buildMesh();
  }

  /** A guillotine or spear trap went off (the old game's animations). */
  playTrap(uid: string): void {
    this.traps.play(uid);
  }

  trapJustSprung(uid: string): boolean {
    return this.traps.justSprung(uid);
  }

  update(dt: number): void {
    this.doors.update(dt);
    this.traps.update(dt);
    if (this.turners.length > 0) {
      let finished = false;
      for (const { uid } of this.turners) {
        const turn = this.turning.get(uid)!;
        turn.t += dt;
        if (turn.t >= turn.seconds) {
          this.turning.delete(uid);
          finished = true;
        }
      }
      // the finished head goes back among the ordinary objects
      if (finished) this.buildObjects();
      else {
        this.pushTurners();
        this.props.flush();
      }
    }
    if (this.spinners.length === 0 && this.flames.length === 0) return;
    if (this.spinners.length > 0) {
      this.spin = (this.spin + dt * SPIN_SPEED) % (2 * Math.PI);
      this.pushSpinners();
    }
    if (this.flames.length > 0) {
      this.clock += dt;
      this.pushFlames();
    }
    this.props.flush();
  }

  /** Wall cells that are sinking into the floor right now (`sinkWall`): the way to stop each of them. */
  private sinking = new Set<() => void>();

  /**
   * A wall cell that gives way (the seal of an end room): the map beneath is open already, the wall itself goes down into the floor over `seconds`, as long as
   * the sound of the stone (35th playtest: the wall used to stand there until the next step). A cave's rock is a model, every other wall a piece of the wall mesh,
   * so the piece that sinks is a box with the wall's texture or the rock model itself.
   */
  sinkWall(x: number, y: number, seconds: number): void {
    const map = this.map;
    if (!map || seconds <= 0) return;
    const h = wallHeightOf(map);
    const cx = cellCenterX(x);
    const cz = cellCenterZ(y);
    const scene = this.r.scene;
    const owner = `${this.owner}:sink`;
    let box: Mesh | null = null;
    if (!this.caveModels) {
      // the four faces with the texture of the wall once over the whole height, as `meshInterior` draws them (a stock box laid the picture on its side), and a cap for when the top sinks below the eyes
      const x0 = cellX(x);
      const x1 = x0 + CELL_SIZE;
      const z1 = cellZ(y);
      const z0 = z1 - CELL_SIZE;
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const face = (n: [number, number, number], bl: [number, number], br: [number, number]): void => {
        const base = positions.length / 3;
        positions.push(bl[0], 0, bl[1], bl[0], h, bl[1], br[0], h, br[1], br[0], 0, br[1]);
        for (let k = 0; k < 4; k++) normals.push(...n);
        uvs.push(0, 0, 0, 1, 1, 1, 1, 0);
        indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      };
      face([0, 0, -1], [x0, z0], [x1, z0]);
      face([0, 0, 1], [x1, z1], [x0, z1]);
      face([1, 0, 0], [x1, z0], [x1, z1]);
      face([-1, 0, 0], [x0, z1], [x0, z0]);
      const cap = positions.length / 3;
      positions.push(x0, h, z1, x1, h, z1, x1, h, z0, x0, h, z0);
      for (let k = 0; k < 4; k++) normals.push(0, 1, 0);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(cap, cap + 2, cap + 1, cap, cap + 3, cap + 2);
      box = new Mesh(`sinking-wall:${x},${y}`, scene);
      const data = new VertexData();
      data.positions = positions;
      data.normals = normals;
      data.uvs = uvs;
      data.indices = indices;
      data.applyToMesh(box, false);
      box.material = this.material("wall", map);
      box.isPickable = false;
    }
    const rotY = (((hash2(0x3a, x, y) >>> 8) % 4) * Math.PI) / 2;
    const started = performance.now();
    const stop = (): void => {
      scene.onBeforeRenderObservable.remove(observer);
      box?.dispose(false, false);
      if (!box) {
        this.props.removeOwner(owner);
        this.props.flush();
      }
      this.sinking.delete(stop);
    };
    const observer = scene.onBeforeRenderObservable.add(() => {
      const t = Math.min(1, (performance.now() - started) / (seconds * 1000));
      // the stone starts slowly, as if it had to break loose
      const drop = h * (t * t * (3 - 2 * t));
      if (box) box.position.y = -drop;
      else {
        this.props.setInstances(owner, [{ model: CAVE_WALL, x: cx, y: 1.5 - drop, z: cz, rotY, scale: 1.75, atOrigin: true }]);
        this.props.flush();
      }
      if (t >= 1) stop();
    });
    this.sinking.add(stop);
  }

  dispose(): void {
    for (const stop of [...this.sinking]) stop();
    this.props.setReference(null);
    if (this.owner) {
      this.props.removeOwner(this.owner);
      this.props.removeOwner(`${this.owner}:floor`);
      this.props.removeOwner(`${this.owner}:ceiling`);
      this.props.removeOwner(`${this.owner}:panels`);
      this.props.removeOwner(`${this.owner}:walls`);
      this.props.removeOwner(`${this.owner}:round`);
      this.props.removeOwner(`${this.owner}:spin`);
      this.props.removeOwner(`${this.owner}:float`);
      this.props.removeOwner(`${this.owner}:turn`);
      this.props.removeOwner(`${this.owner}:gate`);
    }
    this.headFacings.clear();
    this.turnPending.clear();
    this.turning.clear();
    this.turners = [];
    this.spinners = [];
    this.flames = [];
    this.caveWalls = [];
    this.caveShown = null;
    this.caveModels = false;
    this.roundList = [];
    this.roundShown = null;
    this.roundModels = false;
    this.floorCells = [];
    this.floorShown = null;
    this.ceilingCells = [];
    this.ceilingShown = null;
    this.panelList = [];
    this.panelShown = null;
    this.props.flush();
    this.mesh?.dispose(false, false);
    this.multi?.dispose(false, false);
    this.doors.dispose();
    this.traps.dispose();
    this.glow.dispose();
    this.mesh = null;
    this.multi = null;
    this.owner = "";
  }
}
