import { hash2 } from "../core/noise";
import { coveredFaces, roundCorners } from "../interiors/roundCorners";
import { CELL, FACING_DELTA, type Facing, type InteriorKind, type InteriorMap } from "../interiors/types";
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
}

export const CELL_SIZE = 3;
const SECTION = 16;
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
const WALL_HEIGHT: Record<InteriorKind, number> = { dungeon: CELL_SIZE * 1.5, fortress: CELL_SIZE * 1.4, cave: CELL_SIZE, town: CELL_SIZE };

export function wallHeightOf(map: InteriorMap): number {
  return WALL_HEIGHT[map.kind];
}

/** Texture of the dungeon floor; a floor cell with it can be drawn by the 3D floor model (`blk_floor`) instead of a flat quad. */
const DUNGEON_FLOOR = "tex_dungeon_floor";

/**
 * Does the 3D floor model replace the flat floor quad of this cell? Only the dungeon's own floor has such a model (the old
 * `Dungeon floor and ceiling.glb`); caves, fortresses, cyber maps and towns keep their textures. A pit is its own floor.
 */
export function hasModelFloor(map: InteriorMap, cx: number, cy: number): boolean {
  const i = cy * map.width + cx;
  if (map.cells[i] !== CELL.FLOOR) return false;
  if (!map.styles) return map.theme.floor === DUNGEON_FLOOR;
  const style = map.styles.list[map.styles.cell[i]!];
  return !!style && style.cls === "floor" && !style.floorless && style.floor === `tex/${DUNGEON_FLOOR}`;
}

/** Floor cells (grid indices) the 3D floor model covers; `holes` (open pits) have no floor at all. */
export function modelFloorCells(map: InteriorMap, holes: ReadonlySet<number> = new Set()): number[] {
  const out: number[] = [];
  for (let cy = 0; cy < map.height; cy++) for (let cx = 0; cx < map.width; cx++) if (hasModelFloor(map, cx, cy) && !holes.has(cy * map.width + cx)) out.push(cy * map.width + cx);
  return out;
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
 * Builds floors, ceilings and wall faces. Only faces that border a floor cell exist, so a 96x96 dungeon stays at a few
 * thousand quads. `cracked` lists wall cells (as `x,y`) that hide a breakable wall and get the cracked texture. `holes` are
 * grid indices of floor cells without a floor: the open pits of a generated map, which the pit model fills.
 */
export function meshInterior(map: InteriorMap, cracked: Set<string> = new Set(), options: { modelFloor?: boolean; holes?: ReadonlySet<number>; modelWalls?: boolean; roundWalls?: boolean; flatTiles?: FlatTileSet } = {}): InteriorGeometry {
  const H = wallHeightOf(map);
  // the rounded corners of the spaceship are models that stand where the wall faces would be (`interiors/roundCorners.ts`)
  const corners = options.roundWalls ? roundCorners(map) : [];
  const covered = coveredFaces(corners);
  const w = map.width;
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

  // door niches of town buildings: the cell behind the doorway gets the door texture
  const doorFaces = new Set<string>();
  for (const lot of map.lots) {
    const [dx, dy] = [FACING_DELTA[lot.door.facing].dx, FACING_DELTA[lot.door.facing].dy];
    doorFaces.add(`${lot.door.x - dx},${lot.door.y - dy}|${lot.door.x},${lot.door.y}`);
  }
  {
    // the way out of every place is marked by the door texture of its theme on the wall behind the exit cell: the gate of a town (a
    // niche in the city wall, so the wall lies outside the map), the door of a dungeon, a castle, a cave or a cyber complex
    const dx = map.exit.x - map.spawn.x;
    const dy = map.exit.y - map.spawn.y;
    doorFaces.add(`${map.exit.x + dx},${map.exit.y + dy}|${map.exit.x},${map.exit.y}`);
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
      if (!(styles && styles.list[style]!.floorless) && !options.holes?.has(cy * w + cx) && !(options.modelFloor && hasModelFloor(map, cx, cy))) {
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

      if (styles ? styles.list[style]!.ceiling : map.theme.ceiling) {
        const c = bucket(styles ? `ceiling:${style}` : "ceiling", cx, cy);
        const ca = c.vertex([x0, H, z1], [0, -1, 0], [0, 0], shade);
        const cb = c.vertex([x1, H, z1], [0, -1, 0], [1, 0], shade);
        const cc = c.vertex([x1, H, z0], [0, -1, 0], [1, 1], shade);
        const cd = c.vertex([x0, H, z0], [0, -1, 0], [0, 1], shade);
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
        if (kind === CELL.FLOOR) continue;
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
        const b = bucket(material, cx, cy);
        const s = shade * (dir === "N" || dir === "S" ? 1 : 0.93);
        const a = b.vertex([bl[0], 0, bl[1]], n, [0, 0], s);
        const t1 = b.vertex([bl[0], H, bl[1]], n, [0, 1], s);
        const t2 = b.vertex([br[0], H, br[1]], n, [1, 1], s);
        const d = b.vertex([br[0], 0, br[1]], n, [1, 0], s);
        // front face toward the cell (checked in the browser: the order bottom-left, bottom-right, top-right faces the other way)
        b.indices.push(a, t2, t1, a, d, t2);
      }
    }
  }

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
  const out: InteriorGeometry = {
    positions: new Float32Array(vCount * 3),
    normals: new Float32Array(vCount * 3),
    uvs: new Float32Array(vCount * 2),
    colors: new Float32Array(vCount * 4),
    indices: new Uint32Array(iCount),
    groups: [],
    wallHeight: H,
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
