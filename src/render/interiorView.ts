import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { hash2 } from "../core/noise";
import { QUEST_PROP } from "../data/quest-table";
import type { ActionInstance, MapContent } from "../actions/types";
import { hasRoundWalls, roundCorners, ROUND_ITEM, type RoundCorner } from "../interiors/roundCorners";
import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import type { StaticModelInfo, TextureCache } from "./assets";
import { groundTexture, type FlatTileSet } from "./flatGround";
import { InteriorDoors } from "./interiorDoors";
import { CELL_SIZE, cellCenterX, cellCenterZ, meshInterior, modelFloorCells, wallHeightOf } from "./interiorMesher";
import { themedProp } from "./interiorProps";
import { itemModelKey, itemProp } from "./itemProps";
import { InteriorTraps } from "./interiorTraps";
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
const FLOOR_SCALE: [number, number, number] = [1.5, 1.473, 1.5];
/**
 * Cells around the party that get a floor model (a square of 17 x 17 at the most, a few thousand triangles each). The torch
 * reaches 7 cells and the dungeon fog (density 0.075) leaves under 10 % of what lies farther, so the rest is not worth its
 * triangles; the Light spell thins the fog a little, and the cells at the edge of the window are still in view then.
 */
const FLOOR_RADIUS = 8;

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

/** The models a map needs beyond `INTERIOR_MODELS`: the rock pieces of a generated cave. */
export function caveModelKeys(map: InteriorMap): string[] {
  return map.kind === "cave" && !map.styles ? [CAVE_WALL, CAVE_EXIT] : [];
}

/**
 * The pillars of a generated level are the old game's "4 pillars" (four columns on the corners of one cell, fortress block 40), with the
 * texture of the place: the stone of the fortress wall in a dungeon, the pillar texture in a castle, the columns of the city in a town.
 */
const PILLAR_MODELS: Partial<Record<InteriorMap["kind"], string>> = { dungeon: "blk_pillars_dungeon", fortress: "blk_pillars_castle", town: "blk_pillars_city" };

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

const brokenWallLook = (map: InteriorMap) => (map.theme.id === "cyber" ? undefined : BROKEN_WALL[map.kind]);

/** The model a map needs for its broken walls (loaded with the others, before the first frame). */
export function brokenWallModelKeys(map: InteriorMap, content: MapContent): string[] {
  const look = brokenWallLook(map);
  return look && content.actions.some((a) => a.kind === "breakable_wall") ? [look.model] : [];
}

/** Chest models by hash, so a map has a mix. */
const CHESTS = ["obj_chest", "obj_chest_iron", "obj_chest_noble", "obj_chest_sapphire"];
const SHRINES = ["obj_well_red", "obj_well_yellow", "obj_altar"];

/** Models the interior view may ask for; loaded on demand. `ci_87` is the blade that hangs in a guillotine trap (map item 87). */
export const INTERIOR_MODELS = [...CHESTS, ...SHRINES, "blk_floor", "obj_sign_inn", "obj_sign_bank", "obj_sign_guild", "obj_sign_smith", "obj_sign_tavern", "obj_sign_temple", "obj_sign_training", "obj_fountain", "obj_statue", "obj_spear_trap", "obj_pit", "obj_guillotine", "ci_87", "obj_lantern"];

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
  private owner = "";
  private map: InteriorMap | null = null;
  private content: MapContent | null = null;
  private brokenWalls = new Set<string>();
  /** The game's set of used-up actions (the same object, so it is always current): a key that was taken is no longer drawn. */
  private opened: ReadonlySet<string> = new Set();
  /** Theme the cached materials belong to; they are cached by role (floor, wall, ...), so a new theme needs new ones. */
  private materialTheme = "";
  /** The player's choice: dungeon floors as the 3D cobble model. Only takes effect when the model is loaded. */
  private modelFloorWanted = true;
  /** Floor cells (grid indices) the model covers on the current map, and the cell the party last stood on. */
  private floorCells: number[] = [];
  private floorFocus: { x: number; y: number } | null = null;
  private floorShown: { x: number; y: number } | null = null;
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
  }

  private styleMaterial(key: string, map: InteriorMap): StandardMaterial {
    const [kind, index] = key.split(":") as [string, string];
    const style = map.styles!.list[Number(index)]!;
    const file = kind === "floor" ? style.floor : kind === "ceiling" ? style.ceiling : style.wall;
    const m = new StandardMaterial(`interior:${key}`, this.r.scene);
    const tex = this.textures.get(`${groundTexture(file ?? "tex/tex_black")}.webp`);
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
    m.diffuseTexture = this.textures.get(`tex/${file}.webp`);
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
    // the traps come first: an open pit has no floor, so the mesh needs to know about it
    this.traps.show(map, content, opened, this.owner);
    this.buildMesh();
    this.buildObjects();
    this.doors.show(map, content, opened, this.owner);
  }

  /** The view distance's share of the windows of floor and rock models around the party (1 = the full radius). */
  setViewShare(share: number): void {
    this.viewShare = share;
    if (!this.map) return;
    this.caveShown = null;
    this.roundShown = null;
    this.pushFloor(true);
    if (this.floorFocus) {
      this.pushCaveWalls(this.floorFocus.x, this.floorFocus.y);
      this.pushRoundCorners(this.floorFocus.x, this.floorFocus.y);
    }
  }

  private viewShare = 1;

  /** Whether floors are drawn by the 3D model: wanted, and the model is loaded. */
  private get modelFloor(): boolean {
    return this.modelFloorWanted && this.props.has(FLOOR_MODEL);
  }

  /** The player's choice of 3D dungeon floors or flat ones; takes effect at once on the map that is shown. */
  setModelFloor(on: boolean): void {
    if (this.modelFloorWanted === on) return;
    this.modelFloorWanted = on;
    if (this.map) this.buildMesh();
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
    const near = Math.max(3, Math.round(FLOOR_RADIUS * this.viewShare));
    const list: PropInstance[] = [];
    for (const i of this.floorCells) {
      const x = i % map.width;
      const y = (i - x) / map.width;
      if (Math.abs(x - at.x) > near || Math.abs(y - at.y) > near) continue;
      // the old game set the model 0.05 above the origin of its block; 0.02 keeps the model's ceiling plane under the real one
      list.push({ model: FLOOR_MODEL, x: cellCenterX(x), y: 0.02, z: cellCenterZ(y), rotY: 0, scale: FLOOR_SCALE[0], scaleXYZ: FLOOR_SCALE, atOrigin: true });
    }
    this.props.setInstances(owner, list);
    this.props.flush();
  }

  private buildMesh(): void {
    const map = this.map!;
    this.mesh?.dispose(false, false);
    this.multi?.dispose(false, false);
    const modelFloor = this.modelFloor;
    const holes = this.traps.holes();
    this.floorCells = modelFloor ? modelFloorCells(map, holes) : [];
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
    const geo = meshInterior(map, new Set(), { modelFloor, holes, modelWalls: this.caveModels, roundWalls: this.roundModels, flatTiles: this.flatTiles ?? undefined });
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
    this.pushFloor(true);
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

  private buildObjects(): void {
    const map = this.map!;
    const instances: PropInstance[] = [];
    this.spinners = [];
    this.wallLike = new Set(this.content!.actions.filter((a) => a.kind === "door" || (a.kind === "breakable_wall" && !this.brokenWalls.has(a.uid))).map((a) => a.y * map.width + a.x));
    this.objectCells = new Set(this.content!.actions.filter((a) => a.kind !== "service" && a.kind !== "trap" && a.kind !== "transfer" && a.kind !== "ambush" && !this.wallLike.has(a.y * map.width + a.x)).map((a) => a.y * map.width + a.x));
    for (const a of this.content!.actions) {
      const x = cellCenterX(a.x);
      const z = cellCenterZ(a.y);
      const h = hash2(0x51, a.x, a.y) >>> 0;
      // a key or key card that has been taken is gone from its chest
      if (a.kind === "treasure" && typeof a.params.quest === "string" && this.opened.has(a.uid)) continue;
      // a themed place shows the old items of its style (a barrel, a bone pile, a banner) instead of a chest or well picked by chance
      const themed = themedProp(a, x, z, (this.faceOpen(map, a, h >>> 8) * 180) / Math.PI, this.staticInfo, this.opened, this.content ?? undefined);
      // a head of the ring that is not there leaves its cell empty
      if (!themed && a.kind === "head") continue;
      if (themed) {
        (a.kind === "treasure" && typeof a.params.chest === "number" && SPINNING_ITEMS.has(a.params.chest) ? this.spinners : instances).push(themed);
        continue;
      }
      switch (a.kind) {
        case "treasure":
          instances.push({ model: CHESTS[h % CHESTS.length]!, x, y: 0, z, rotY: this.faceOpen(map, a, h >>> 8), scale: 0.85 });
          break;
        case "shrine":
          instances.push({ model: SHRINES[h % SHRINES.length]!, x, y: 0, z, rotY: this.faceOpen(map, a, h >>> 8), scale: 1.5 });
          break;
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
          const look = brokenWallLook(map);
          if (!look || !this.brokenWalls.has(a.uid) || !this.props.has(look.model)) break;
          // the passage runs along the axis of the action; the glTF models stand turned by half a circle (see `GLTF_YAW` in blocks.ts)
          const yaw = (a.params.axis === "x" ? 0 : Math.PI / 2) + (look.glb ? Math.PI : 0);
          instances.push({ model: look.model, x, y: 0, z, rotY: yaw, scale: look.scale[0], scaleXYZ: look.scale });
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
      for (const p of map.pillars ?? []) instances.push({ model: pillar, x: cellCenterX(p.x), y: 0, z: cellCenterZ(p.y), rotY: 0, scale: 1.5, scaleXYZ: [1.5, height, 1.5] });
    }
    this.props.setInstances(this.owner, instances);
    this.pushSpinners();
    this.props.flush();
  }

  /** Keys and key cards turn slowly about their own axis; they have an owner of their own, redrawn every frame. */
  private pushSpinners(): void {
    this.props.setInstances(`${this.owner}:spin`, this.spinners.map((p) => ({ ...p, center: true, rotY: p.rotY + this.spin })));
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
    const bearings: [Facing, Facing, number][] = [["N", "S", 0], ["E", "W", 90], ["S", "N", 180], ["W", "E", 270]];
    // a closed door or a wall that can be broken is a floor cell in the map but looks like a wall: an object does not face it
    const floorCell = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.cells[y * map.width + x] === CELL.FLOOR && !this.wallLike.has(y * map.width + x);
    // the front looks at an empty cell if there is one: a lectern or chest facing a statue or a person is worse than one facing a bare street
    const sides = (empty: boolean) => {
      const openAt = (x: number, y: number) => floorCell(x, y) && !(empty && this.objectCells.has(y * map.width + x));
      const floorAt = (f: Facing) => openAt(a.x + FACING_DELTA[f].dx, a.y + FACING_DELTA[f].dy);
      return { openAt, floorAt };
    };
    const emptySides = sides(true);
    const { openAt, floorAt } = bearings.some(([front]) => emptySides.floorAt(front)) ? emptySides : sides(false);
    /** Open cells in a row from this one in a direction (up to 8). */
    const run = (f: Facing) => {
      let n = 0;
      while (n < 8 && openAt(a.x + FACING_DELTA[f].dx * (n + 1), a.y + FACING_DELTA[f].dy * (n + 1))) n++;
      return n;
    };
    let choices = bearings.filter(([front, back]) => floorAt(front) && !floorAt(back));
    if (choices.length === 0) choices = bearings.filter(([front]) => floorAt(front));
    if (choices.length === 0) choices = bearings;
    if (choices.length > 1) {
      // a corner, a corridor: it looks along the longer way and turns its back to the nearer wall
      const score = ([front, back]: [Facing, Facing, number]) => run(front) - run(back);
      const best = Math.max(...choices.map(score));
      choices = choices.filter((c) => score(c) === best);
    }
    return (choices[pick % choices.length]![2] * Math.PI) / 180;
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
    if (this.spinners.length === 0) return;
    this.spin = (this.spin + dt * SPIN_SPEED) % (2 * Math.PI);
    this.pushSpinners();
    this.props.flush();
  }

  dispose(): void {
    this.props.setReference(null);
    if (this.owner) {
      this.props.removeOwner(this.owner);
      this.props.removeOwner(`${this.owner}:floor`);
      this.props.removeOwner(`${this.owner}:walls`);
      this.props.removeOwner(`${this.owner}:round`);
      this.props.removeOwner(`${this.owner}:spin`);
    }
    this.spinners = [];
    this.caveWalls = [];
    this.caveShown = null;
    this.caveModels = false;
    this.roundList = [];
    this.roundShown = null;
    this.roundModels = false;
    this.floorCells = [];
    this.floorShown = null;
    this.props.flush();
    this.mesh?.dispose(false, false);
    this.multi?.dispose(false, false);
    this.doors.dispose();
    this.traps.dispose();
    this.mesh = null;
    this.multi = null;
    this.owner = "";
  }
}
