import { hash2 } from "../core/noise";
import { coveredFaces, roundCorners } from "../interiors/roundCorners";
import { CELL, FACING_DELTA, type Facing, type InteriorKind, type InteriorMap } from "../interiors/types";
import { BROKEN_PIECES, ceilingModelOfTexture, floorModelOfTexture, hasWallModels, wallModelOfTexture, type Environment } from "./environment";
import { campaignGroundOf, resolveCorner, type CampaignGround, type FlatTileSet } from "./flatGround";

/** Geometry of an interior, grouped by (material, 16x16 section) so the engine can cull sections individually. */
export interface InteriorGeometry {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  /**
   * `material` is one of: floor, ceiling, wall, wall_cracked, door, building. Maps with per-cell styles use
   * `floor:<n>`, `ceiling:<n>` and `wall:<n>` with n the index into the style list.
   */
  groups: { material: string; section: number; start: number; count: number }[];
  wallHeight: number;
  /** The wall faces that have a 3D wall piece in front of them (`options.models` has the model); the flat face stays behind as the far view. */
  panels: WallPanel[];
}

export const CELL_SIZE = 3;
const SECTION = 16;
/** No 3D model is wanted: the default of `meshInterior`. */
const NO_MODELS: ReadonlySet<string> = new Set();
/** How much of the water texture one campaign cell covers (a texture per two cells); the endless world's water runs at a third of that, see `WATER_UV_SCALE`. */
const WATER_CELL_UV = 0.5;
/** How far the painted ground tiles of a campaign map lie above its floor quads (the material also pulls them forward, `FLAT_Z_OFFSET`). */
const FLAT_LIFT = 0.02;

/**
 * Wall height per kind of interior, from entities.py add_block (blocksize 3): dungeon and cyber walls are cubes of
 * blocksize * 1.5, fortress walls blocksize * 1.4, while the city and cave walls are models about one cell high. The
 * textures were drawn for these proportions (tex_dungeon_wall is 341 x 512 px, tex_fortress_wall 357 x 512), so a wall
 * shows its texture once over the full height, like the old cubes (uv v = 1). Cyber maps are `dungeon` here.
 */
/** The wall of a dungeon (and so of a tower): the height of one storey, which the stairs of a tower climb. */
export const TOWER_STOREY = CELL_SIZE * 1.5;
const WALL_HEIGHT: Record<InteriorKind, number> = { dungeon: TOWER_STOREY, fortress: CELL_SIZE * 1.4, cave: CELL_SIZE, town: CELL_SIZE };

export function wallHeightOf(map: InteriorMap): number {
  return WALL_HEIGHT[map.kind];
}

/**
 * How far the ceiling of a tower hangs below the top of its walls (48th playtest): the stone texture of the castle wall (357 x 512, drawn for 4.2) is stretched over the 4.5 of a
 * dungeon wall, and the top row of its stones was cut off at the ceiling; the wooden ceiling now covers it. No other place has this.
 */
export const TOWER_CEILING_DROP = 0.3;
export const ceilingDropOf = (map: InteriorMap): number => (map.dungeon?.tower ? TOWER_CEILING_DROP : 0);

/** A wall face that a 3D wall piece is drawn in front of: the cell it belongs to, the side the wall lies on and the model. */
export interface WallPanel {
  x: number;
  y: number;
  /** Direction of the wall seen from the cell (the face looks the other way, into the cell). */
  dir: Facing;
  model: string;
  /**
   * The ends of the piece (E or W; only on pieces of a wall that runs east to west) that grow by the piece's thickness: there the wall ends in a corner that sticks out into open ground, and the
   * piece on the side of that corner leaves a notch of its thickness unless this one reaches over it.
   */
  grow: Facing[];
}

const OPPOSITE: Record<Facing, Facing> = { N: "S", S: "N", E: "W", W: "E" };

/** Texture of a plain floor cell (a pit, a floorless cell and everything that is not floor have none). */
function floorTextureAt(map: InteriorMap, cx: number, cy: number): string | null {
  const i = cy * map.width + cx;
  if (map.cells[i] !== CELL.FLOOR) return null;
  if (!map.styles) return map.theme.floor;
  const style = map.styles.list[map.styles.cell[i]!];
  return style && style.cls === "floor" && !style.floorless ? (style.floor ?? null) : null;
}

/** The 3D floor model of this cell's floor, if its texture has one (`FLOOR_MODELS`): the old dungeon cobble, the city's tiles. */
export function floorModelAt(map: InteriorMap, cx: number, cy: number): string | null {
  return floorModelOfTexture(floorTextureAt(map, cx, cy))?.model ?? null;
}

/**
 * Does a 3D floor model take the place of the flat floor quad of this cell? Only a floor with a model of its own ground does (the old `Dungeon floor
 * and ceiling.glb`); the city's tiles lie over the quad. Caves, fortresses and cyber maps keep their textures. A pit is its own floor.
 */
export function hasModelFloor(map: InteriorMap, cx: number, cy: number, models?: ReadonlySet<string>): boolean {
  const floor = floorModelOfTexture(floorTextureAt(map, cx, cy));
  return !!floor && floor.replacesQuad && (!models || models.has(floor.model));
}

/** Floor cells (grid indices) a 3D floor model covers; `holes` (open pits) have no floor at all. `models` are the ones that are loaded and wanted (all, if left out). */
export function modelFloorCells(map: InteriorMap, holes: ReadonlySet<number> = new Set(), models?: ReadonlySet<string>): number[] {
  const out: number[] = [];
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      const model = floorModelAt(map, cx, cy);
      if (model && (!models || models.has(model)) && !holes.has(cy * map.width + cx)) out.push(cy * map.width + cx);
    }
  }
  return out;
}

const shaftCache = new WeakMap<InteriorMap, ReadonlyMap<number, Facing>>();

/**
 * The stair cells of a tower (49th playtest): grid index -> the side that is open, the one towards the cell in front of the stairs. Above such a cell is a shaft: the walls round it
 * and its ceiling are one storey higher, so the wooden stairs, which rise a storey to the Fort door at their top, have the room they climb through. Empty for every other map.
 */
export function towerShafts(map: InteriorMap): ReadonlyMap<number, Facing> {
  const known = shaftCache.get(map);
  if (known) return known;
  const out = new Map<number, Facing>();
  for (const s of map.dungeon?.tower?.stairs ?? []) {
    const dx = s.front.x - s.up.x;
    const dy = s.front.y - s.up.y;
    const open = (Object.keys(FACING_DELTA) as Facing[]).find((f) => FACING_DELTA[f].dx === dx && FACING_DELTA[f].dy === dy);
    if (open) out.set(s.up.y * map.width + s.up.x, open);
  }
  shaftCache.set(map, out);
  return out;
}

/** The 3D ceiling model over this cell, if it has a ceiling and its texture has a model (`CEILING_MODELS`). */
export function ceilingModelAt(map: InteriorMap, cx: number, cy: number): string | null {
  const i = cy * map.width + cx;
  if (map.cells[i] !== CELL.FLOOR) return null;
  // (the ceiling over the stairs of a tower is the flat one, a storey higher: the models hang at the height of the room's)
  if (towerShafts(map).has(i)) return null;
  if (!map.styles) return ceilingModelOfTexture(map.theme.ceiling) ?? null;
  const style = map.styles.list[map.styles.cell[i]!];
  return style && style.cls === "floor" && style.ceiling ? (ceilingModelOfTexture(style.ceiling) ?? null) : null;
}

/** Cells (grid indices) under a 3D ceiling model. */
export function modelCeilingCells(map: InteriorMap, models?: ReadonlySet<string>): number[] {
  const out: number[] = [];
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      const model = ceilingModelAt(map, cx, cy);
      if (model && (!models || models.has(model))) out.push(cy * map.width + cx);
    }
  }
  return out;
}

/** The 3D wall piece for a wall material of the mesh (`wall` of a generated map, `wall:<style>` of a campaign map), if its texture has one. */
function wallModelOfMaterial(map: InteriorMap, material: string): string | undefined {
  // the walls of a town's houses and its outer wall are one texture (the houses' tinted), so the same piece
  if (material === "wall" || material === "building") return map.styles ? undefined : wallModelOfTexture(map.theme.wall);
  if (!material.startsWith("wall:") || !map.styles) return undefined;
  return wallModelOfTexture(map.styles.list[Number(material.slice(5))]?.wall);
}

/**
 * Every model the environment draws on this map, by the textures the map uses: loaded with the others before the first frame (a dungeon needs no city
 * floor). The flat environment draws none.
 */
export function environmentModels(map: InteriorMap, environment: Environment): string[] {
  if (environment === "flat") return [];
  const floors = new Set<string | null | undefined>();
  const ceilings = new Set<string | null | undefined>();
  const walls = new Set<string | null | undefined>();
  if (map.styles) {
    for (const style of map.styles.list) {
      if (style.cls === "floor" && !style.floorless) {
        floors.add(style.floor);
        ceilings.add(style.ceiling);
      }
      if (style.cls === "wall") walls.add(style.wall);
    }
  } else {
    floors.add(map.theme.floor);
    ceilings.add(map.theme.ceiling);
    walls.add(map.theme.wall);
  }
  const keys = new Set<string>();
  for (const f of floors) {
    const m = floorModelOfTexture(f);
    if (m) keys.add(m.model);
  }
  for (const c of ceilings) {
    const m = ceilingModelOfTexture(c);
    if (m) keys.add(m);
  }
  if (hasWallModels(environment)) {
    for (const w of walls) {
      const m = wallModelOfTexture(w);
      if (m) keys.add(m);
      if (m && BROKEN_PIECES[m]) keys.add(BROKEN_PIECES[m]!);
    }
  }
  return [...keys];
}

/** World position of the west/north edge of a cell. x grows east, z grows north (so z = -cellY * 3). */
export const cellX = (cx: number): number => cx * CELL_SIZE;
export const cellZ = (cy: number): number => -cy * CELL_SIZE;
export const cellCenterX = (cx: number): number => cx * CELL_SIZE + CELL_SIZE / 2;
export const cellCenterZ = (cy: number): number => -cy * CELL_SIZE - CELL_SIZE / 2;

class Bucket {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  vertex(p: [number, number, number], n: [number, number, number], uv: [number, number], shade: number): number {
    this.positions.push(...p);
    this.normals.push(...n);
    this.uvs.push(...uv);
    this.colors.push(shade, shade, shade, 1);
    return this.positions.length / 3 - 1;
  }
}

/**
 * The doorway of a door of the dungeons (48th playtest, tower optimisation): the opening of the user's `Dungeon_Door_Frame.glb` as the game scales it (measured on its triangles:
 * 1.875 wide and 2.78 high; the leaf `blk_dungeon_door` fills it), in a frame that is as thick as that model (0.48).
 */
export const DOOR_OPENING_WIDTH = 1.875;
export const DOOR_OPENING_HEIGHT = 2.78;
export const DOOR_FRAME_DEPTH = 0.48;

/** A doorway of a cell: `axis` is the direction the party walks through it ("x": east to west, the door's plane runs north to south). */
export interface DoorFrame {
  x: number;
  y: number;
  axis: "x" | "y";
}

/**
 * Three boxes round a doorway: a post on either side and a lintel over it, as tall as the wall and textured like it (the wall's picture once over the height and across the cell's
 * width, so that the stones carry on from the walls beside it). Only the faces that show are built: both sides, the faces that look into the opening and the underside of the lintel.
 */
function addDoorFrame(b: Bucket, frame: DoorFrame, H: number): void {
  const cx = cellCenterX(frame.x);
  const cz = cellCenterZ(frame.y);
  // `s` runs across the doorway (north for a door that is walked through east to west, else east), `t` through it
  const sDir: [number, number] = frame.axis === "x" ? [0, 1] : [1, 0];
  const tDir: [number, number] = frame.axis === "x" ? [1, 0] : [0, 1];
  const at = (s: number, t: number): [number, number] => [cx + sDir[0] * s + tDir[0] * t, cz + sDir[1] * s + tDir[1] * t];
  const half = CELL_SIZE / 2;
  const open = DOOR_OPENING_WIDTH / 2;
  const depth = DOOR_FRAME_DEPTH / 2;
  /**
   * A vertical face with the normal `n`, `width` wide, its middle at (`s`, `t`): bottom left and right are the viewer's, as for the wall faces. `u0` and `u1` are the texture's
   * coordinate at the left and right edge, the picture runs once over the wall's height.
   */
  const face = (s: number, t: number, n: [number, number], width: number, y0: number, y1: number, u0: number, u1: number, shade: number): void => {
    const c = at(s, t);
    const left: [number, number] = [n[1], -n[0]];
    const bl: [number, number] = [c[0] + left[0] * (width / 2), c[1] + left[1] * (width / 2)];
    const br: [number, number] = [c[0] - left[0] * (width / 2), c[1] - left[1] * (width / 2)];
    const nn: [number, number, number] = [n[0], 0, n[1]];
    const a = b.vertex([bl[0], y0, bl[1]], nn, [u0, y0 / H], shade);
    const t1 = b.vertex([bl[0], y1, bl[1]], nn, [u0, y1 / H], shade);
    const t2 = b.vertex([br[0], y1, br[1]], nn, [u1, y1 / H], shade);
    const d = b.vertex([br[0], y0, br[1]], nn, [u1, y0 / H], shade);
    b.indices.push(a, t2, t1, a, d, t2);
  };
  /** A face on one side of the frame (normal along `t`): its picture is the wall's across the cell, so the left edge is where the viewer's left lies in `s`. */
  const side = (s: number, toward: 1 | -1, width: number, y0: number, y1: number): void => {
    const n: [number, number] = [tDir[0] * toward, tDir[1] * toward];
    // (the viewer's left is `n` turned a quarter: along `s` if that is its direction, else against it)
    const leftIsPlus = n[1] * sDir[0] + -n[0] * sDir[1] > 0;
    const sLeft = s + (leftIsPlus ? width / 2 : -width / 2);
    const sRight = s + (leftIsPlus ? -width / 2 : width / 2);
    face(s, toward * depth, n, width, y0, y1, (sLeft + half) / CELL_SIZE, (sRight + half) / CELL_SIZE, 1);
  };
  for (const sign of [1, -1]) {
    // the post: both sides, and the face that looks into the opening (its picture is the wall's, over the depth of the frame)
    side((sign * (open + half)) / 2, 1, half - open, 0, H);
    side((sign * (open + half)) / 2, -1, half - open, 0, H);
    face(sign * open, 0, [-sign * sDir[0], -sign * sDir[1]], DOOR_FRAME_DEPTH, 0, DOOR_OPENING_HEIGHT, 0, DOOR_FRAME_DEPTH / CELL_SIZE, 0.93);
  }
  // the lintel: both sides, and its underside
  side(0, 1, DOOR_OPENING_WIDTH, DOOR_OPENING_HEIGHT, H);
  side(0, -1, DOOR_OPENING_WIDTH, DOOR_OPENING_HEIGHT, H);
  // (the underside is a ceiling quad: the same corners in the same order, here for the box's rectangle)
  const [x0, x1] = frame.axis === "x" ? [cx - depth, cx + depth] : [cx - open, cx + open];
  const [z0, z1] = frame.axis === "x" ? [cz - open, cz + open] : [cz - depth, cz + depth];
  const y = DOOR_OPENING_HEIGHT;
  const ua = b.vertex([x0, y, z1], [0, -1, 0], [0, 0], 0.93);
  const ub = b.vertex([x1, y, z1], [0, -1, 0], [1, 0], 0.93);
  const uc = b.vertex([x1, y, z0], [0, -1, 0], [1, 1], 0.93);
  const ud = b.vertex([x0, y, z0], [0, -1, 0], [0, 1], 0.93);
  b.indices.push(ua, ub, uc, ua, uc, ud);
}

/**
 * Builds floors, ceilings and wall faces. Only faces that border a floor cell exist, so a 96x96 dungeon stays at a few
 * thousand quads. `cracked` lists wall cells (as `x,y`) that hide a breakable wall and get the cracked texture. `holes` are
 * grid indices of floor cells without a floor: the open pits of a generated map, which the pit model fills.
 */
export function meshInterior(map: InteriorMap, cracked: Set<string> = new Set(), options: { models?: ReadonlySet<string>; holes?: ReadonlySet<number>; modelWalls?: boolean; roundWalls?: boolean; flatTiles?: FlatTileSet; ceilingLift?: Readonly<Record<string, number>>; doorFrames?: readonly DoorFrame[] } = {}): InteriorGeometry {
  const wallHeight = wallHeightOf(map);
  // a ceiling model that is hung above the room (`CEILING_RELIEF`) raises the flat ceiling behind it and the walls up to it, so that the slabs have a back to show against
  const liftAt = (cx: number, cy: number): number => {
    if (!options.ceilingLift) return 0;
    const model = ceilingModelAt(map, cx, cy);
    return model && options.models?.has(model) ? (options.ceilingLift[model] ?? 0) : 0;
  };
  const H = wallHeight;
  // the rounded corners of the spaceship are models that stand where the wall faces would be (`interiors/roundCorners.ts`)
  const corners = options.roundWalls ? roundCorners(map) : [];
  const covered = coveredFaces(corners);
  const w = map.width;
  const panels: WallPanel[] = [];
  const buckets = new Map<string, Bucket>(); // key = `${material}|${section}`
  const bucket = (material: string, cx: number, cy: number) => {
    const section = Math.floor(cy / SECTION) * 100 + Math.floor(cx / SECTION);
    const key = `${material}|${section}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = new Bucket()));
    return b;
  };
  const styles = map.styles;
  const cellAt = (x: number, y: number): number => (x < 0 || y < 0 || x >= map.width || y >= map.height ? CELL.SOLID : map.cells[y * w + x]!);
  const shafts = towerShafts(map);
  /** A wall face from `y0` to `y1` on one side of a cell, its texture once over that height; it points into the cell (`n`). */
  const wallQuad = (b: Bucket, bl: readonly [number, number], br: readonly [number, number], n: [number, number, number], s: number, y0: number, y1: number): void => {
    const a = b.vertex([bl[0], y0, bl[1]], n, [0, 0], s);
    const t1 = b.vertex([bl[0], y1, bl[1]], n, [0, 1], s);
    const t2 = b.vertex([br[0], y1, br[1]], n, [1, 1], s);
    const e = b.vertex([br[0], y0, br[1]], n, [1, 0], s);
    // front face toward the cell (checked in the browser: the order bottom-left, bottom-right, top-right faces the other way)
    b.indices.push(a, t2, t1, a, e, t2);
  };

  // door niches of town buildings: the cell behind the doorway gets the door texture
  const doorFaces = new Set<string>();
  let gateFace: string | null = null;
  for (const lot of map.lots) {
    const [dx, dy] = [FACING_DELTA[lot.door.facing].dx, FACING_DELTA[lot.door.facing].dy];
    doorFaces.add(`${lot.door.x - dx},${lot.door.y - dy}|${lot.door.x},${lot.door.y}`);
  }
  {
    // the way out of every place is marked by the door texture of its theme on the wall behind the exit cell: the gate of a town (a
    // niche in the city wall, so the wall lies outside the map), the door of a dungeon, a castle, a cave or a cyber complex
    const dx = map.exit.x - map.spawn.x;
    const dy = map.exit.y - map.spawn.y;
    // a generated castle has the Castle Gate model there instead (`InteriorView.pushCastleGate`), and no wall piece in front of it: the piece hid the gate's door
    const face = `${map.exit.x + dx},${map.exit.y + dy}|${map.exit.x},${map.exit.y}`;
    if (!(map.castle || map.dungeon?.tower) || styles) doorFaces.add(face);
    else gateFace = face;
  }

  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      const here = cellAt(cx, cy);
      if (here !== CELL.FLOOR && !(styles && here === CELL.LOW)) continue;
      const style = styles ? styles.cell[cy * w + cx]! : -1;
      const x0 = cellX(cx);
      const x1 = x0 + CELL_SIZE;
      const z1 = cellZ(cy); // north edge
      const z0 = z1 - CELL_SIZE; // south edge
      // a campaign map's water is one sheet: a brightness of its own per cell drew the cell grid over it
      const isWater = !!styles?.list[style]!.water;
      const shade = isWater ? 1 : 0.94 + (((hash2(0x77, cx, cy) >>> 6) % 100) / 100) * 0.1;

      // floor: facing up (front face order checked in the browser, same as the terrain)
      if (!(styles && styles.list[style]!.floorless) && !options.holes?.has(cy * w + cx) && !hasModelFloor(map, cx, cy, options.models ?? NO_MODELS)) {
        const f = bucket(styles ? `floor:${style}` : "floor", cx, cy);
        // water is one sheet: its texture runs on from cell to cell, scaled by the UVs (the texture is shared with the
        // overworld's water and keeps its own scale), where a cell of any other floor shows the whole texture
        const [u0, v0] = isWater ? [cx * WATER_CELL_UV, cy * WATER_CELL_UV] : [0, 0];
        const [u1, v1] = isWater ? [(cx + 1) * WATER_CELL_UV, (cy + 1) * WATER_CELL_UV] : [1, 1];
        const fa = f.vertex([x0, 0, z1], [0, 1, 0], [u0, v0], shade);
        const fb = f.vertex([x1, 0, z1], [0, 1, 0], [u1, v0], shade);
        const fc = f.vertex([x1, 0, z0], [0, 1, 0], [u1, v1], shade);
        const fd = f.vertex([x0, 0, z0], [0, 1, 0], [u0, v1], shade);
        f.indices.push(fa, fc, fb, fa, fd, fc);
      }
      if (here === CELL.LOW) continue; // no ceiling, no walls

      const shaft = shafts.get(cy * w + cx);
      // (above the stairs of a tower the room is one storey higher: walls and ceiling)
      const roof = shaft ? 2 * H : H + liftAt(cx, cy);
      if (styles ? styles.list[style]!.ceiling : map.theme.ceiling) {
        const c = bucket(styles ? `ceiling:${style}` : "ceiling", cx, cy);
        // (a tower's ceiling hangs a little lower than its walls end, so that the half stone at the top of the wall is hidden behind it)
        const lid = roof - ceilingDropOf(map);
        const ca = c.vertex([x0, lid, z1], [0, -1, 0], [0, 0], shade);
        const cb = c.vertex([x1, lid, z1], [0, -1, 0], [1, 0], shade);
        const cc = c.vertex([x1, lid, z0], [0, -1, 0], [1, 1], shade);
        const cd = c.vertex([x0, lid, z0], [0, -1, 0], [0, 1], shade);
        c.indices.push(ca, cb, cc, ca, cc, cd);
      }

      // walls on every side that does not lead to another floor cell. Each face points into this cell.
      const sides: [Facing, [number, number, number], [number, number], [number, number]][] = [
        // direction of the neighbour, normal pointing into the cell, bottom-left and bottom-right as seen from inside
        ["N", [0, 0, -1], [x0, z1], [x1, z1]],
        ["S", [0, 0, 1], [x1, z0], [x0, z0]],
        ["E", [-1, 0, 0], [x1, z1], [x1, z0]],
        ["W", [1, 0, 0], [x0, z0], [x0, z1]],
      ];
      for (const [dir, n, bl, br] of sides) {
        const nx = cx + FACING_DELTA[dir].dx;
        const ny = cy + FACING_DELTA[dir].dy;
        const kind = cellAt(nx, ny);
        if (kind === CELL.FLOOR) {
          // a wall between two floor cells would be a face of no thickness (50th playtest, point 2a: the stairs of the Tower of Ira stood beside a floor cell and showed one): there is
          // none, the stairs are open to the cell beside them. Only the shaft goes on above the ceiling of that cell, one storey of wall over the opening (seen from the shaft)
          if (shaft !== undefined) {
            if (!shafts.has(ny * w + nx)) wallQuad(bucket("wall", cx, cy), bl, br, n, shade * (dir === "N" || dir === "S" ? 1 : 0.93), H, 2 * H);
            continue;
          }
          continue;
        }
        if (covered.has(`${cx},${cy},${dir}`)) continue;
        if (styles && kind === CELL.LOW) continue; // open ground next door
        // the walls of a cave are models (the rock pieces of the old game) where the model is loaded: they stand on the wall cells and
        // cover what a wall face would show; the campaign's wall blocks with a model of their own do the same
        if (options.modelWalls && kind === CELL.SOLID) continue;
        if (styles && nx >= 0 && ny >= 0 && nx < map.width && ny < map.height) {
          const next = styles.list[styles.cell[ny * w + nx]!];
          if (next?.model && next.cls === "wall") continue;
        }
        let material = "wall";
        if (styles) {
          // the style of the wall cell decides the texture; style 0 is the map border
          material = `wall:${nx >= 0 && ny >= 0 && nx < map.width && ny < map.height ? styles.cell[ny * w + nx] : 0}`;
        } else if (doorFaces.has(`${nx},${ny}|${cx},${cy}`)) material = "door";
        else if (kind === CELL.BUILDING) material = "building";
        else if (cracked.has(`${nx},${ny}`)) material = "wall_cracked";
        const panel = options.models && `${nx},${ny}|${cx},${cy}` !== gateFace ? wallModelOfMaterial(map, material) : undefined;
        if (panel && options.models!.has(panel)) panels.push({ x: cx, y: cy, dir, model: panel, grow: [] });
        const b = bucket(material, cx, cy);
        const s = shade * (dir === "N" || dir === "S" ? 1 : 0.93);
        if (shaft !== undefined) {
          // a storey of wall under a storey of wall: the texture once over each
          wallQuad(b, bl, br, n, s, 0, H);
          wallQuad(b, bl, br, n, s, H, 2 * H);
        } else wallQuad(b, bl, br, n, s, 0, roof);
      }
    }
  }

  // the simple door frames of a tower: three boxes with the texture of the wall
  for (const frame of options.doorFrames ?? []) addDoorFrame(bucket("wall", frame.x, frame.y), frame, H);

  // the corner that an outer model cuts off leaves a gap in the floor and the ceiling of its wall cell: a quad each, the model covers the rest
  for (const c of corners) {
    if (c.kind !== "outer") continue;
    const x0 = cellX(c.x);
    const x1 = x0 + CELL_SIZE;
    const z1 = cellZ(c.y);
    const z0 = z1 - CELL_SIZE;
    const shade = 0.94 + (((hash2(0x77, c.x, c.y) >>> 6) % 100) / 100) * 0.1;
    const f = bucket("floor", c.x, c.y);
    const fa = f.vertex([x0, 0, z1], [0, 1, 0], [0, 0], shade);
    const fb = f.vertex([x1, 0, z1], [0, 1, 0], [1, 0], shade);
    const fc = f.vertex([x1, 0, z0], [0, 1, 0], [1, 1], shade);
    const fd = f.vertex([x0, 0, z0], [0, 1, 0], [0, 1], shade);
    f.indices.push(fa, fc, fb, fa, fd, fc);
    if (map.theme.ceiling) {
      const k = bucket("ceiling", c.x, c.y);
      const ca = k.vertex([x0, H, z1], [0, -1, 0], [0, 0], shade);
      const cb = k.vertex([x1, H, z1], [0, -1, 0], [1, 0], shade);
      const cc = k.vertex([x1, H, z0], [0, -1, 0], [1, 1], shade);
      const cd = k.vertex([x0, H, z0], [0, -1, 0], [0, 1], shade);
      k.indices.push(ca, cb, cc, ca, cc, cd);
    }
  }

  if (options.flatTiles && styles) {
    // the painted ground tiles (`flatGround.ts`) lie on the corners of the cells, a hair above the floor quads, which stay underneath for the
    // cells beside a floor that has no painted tile; where a floor has none, the corner is left out
    const h = map.height;
    const ground: CampaignGround[] = [];
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const here = cellAt(cx, cy);
        const i = cy * w + cx;
        ground.push(here === CELL.FLOOR || here === CELL.LOW ? (options.holes?.has(i) ? "other" : campaignGroundOf(styles.list[styles.cell[i]!]!)) : "inherit");
      }
    }
    const groundAt = (x: number, y: number): CampaignGround => (x < 0 || y < 0 || x >= w || y >= h ? "inherit" : ground[y * w + x]!);
    const half = CELL_SIZE / 2;
    for (let vy = 0; vy <= h; vy++) {
      for (let vx = 0; vx <= w; vx++) {
        const corner = resolveCorner([groundAt(vx - 1, vy - 1), groundAt(vx, vy - 1), groundAt(vx - 1, vy), groundAt(vx, vy)]);
        if (!corner) continue;
        const b = bucket(`flat:${options.flatTiles.pick(...corner)}`, Math.min(vx, w - 1), Math.min(vy, h - 1));
        const px = cellX(vx);
        const pz = cellZ(vy);
        const nw = b.vertex([px - half, FLAT_LIFT, pz + half], [0, 1, 0], [0, 1], 1);
        const ne = b.vertex([px + half, FLAT_LIFT, pz + half], [0, 1, 0], [1, 1], 1);
        const se = b.vertex([px + half, FLAT_LIFT, pz - half], [0, 1, 0], [1, 0], 1);
        const sw = b.vertex([px - half, FLAT_LIFT, pz - half], [0, 1, 0], [0, 0], 1);
        b.indices.push(nw, se, ne, nw, sw, se);
      }
    }
  }

  // pack: one contiguous index range per (material, section)
  const keys = [...buckets.keys()].sort();
  let vCount = 0;
  let iCount = 0;
  for (const k of keys) {
    vCount += buckets.get(k)!.positions.length / 3;
    iCount += buckets.get(k)!.indices.length;
  }
  // the corners of the pieces: where a wall ends in a corner that sticks out into open ground (the floor cell `c` beside the piece and the cell beyond the wall end are both floor, and that wall
  // face has a piece too), the piece of the wall running east to west reaches over the notch the two pieces would leave (their thickness is what lies between their ends)
  const placed = new Set(panels.map((p) => `${p.x},${p.y},${p.dir}`));
  for (const p of panels) {
    if (p.dir !== "N" && p.dir !== "S") continue;
    const d = FACING_DELTA[p.dir];
    for (const side of ["E", "W"] as const) {
      const e = FACING_DELTA[side];
      if (cellAt(p.x + e.dx, p.y + e.dy) === CELL.FLOOR && placed.has(`${p.x + d.dx + e.dx},${p.y + d.dy + e.dy},${OPPOSITE[side]}`)) p.grow.push(side);
    }
  }

  const out: InteriorGeometry = {
    positions: new Float32Array(vCount * 3),
    normals: new Float32Array(vCount * 3),
    uvs: new Float32Array(vCount * 2),
    colors: new Float32Array(vCount * 4),
    indices: new Uint32Array(iCount),
    groups: [],
    wallHeight: H,
    panels,
  };
  let v = 0;
  let ii = 0;
  for (const k of keys) {
    const b = buckets.get(k)!;
    const [material, section] = k.split("|") as [string, string];
    out.positions.set(b.positions, v * 3);
    out.normals.set(b.normals, v * 3);
    out.uvs.set(b.uvs, v * 2);
    out.colors.set(b.colors, v * 4);
    for (let i = 0; i < b.indices.length; i++) out.indices[ii + i] = b.indices[i]! + v;
    out.groups.push({ material, section: Number(section), start: ii, count: b.indices.length });
    v += b.positions.length / 3;
    ii += b.indices.length;
  }
  return out;
}
