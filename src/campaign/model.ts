import type { ActionInstance, MapContent, SpawnPoint } from "../actions/types";
import { INTERIOR_THEMES } from "../data/interior-themes";
import { MAP_ITEMS } from "../data/tables";
import { CELL, type CellStyle, type Facing, type InteriorKind, type InteriorMap, type InteriorTheme } from "../interiors/types";
import { BLOCKS, BORDER_STYLE, type BlockDef, type BlockFamily } from "./blocks";
import { slabSide } from "./slabs";
import type { CampaignMapData, RawCell } from "./types";

/** One cell of a campaign map (the exported record without its coordinates). */
export type CampaignCell = Omit<RawCell, "x" | "y">;

/** Cells changed by the game, as full snapshots by `x,y`. `null` means the cell is empty now. Saved with the game. */
export type CellOverrides = Record<string, CampaignCell | null>;

const FACING_TO_DEG: Record<Facing, number> = { N: 0, E: 90, S: 180, W: 270 };
export const degOfFacing = (f: Facing): number => FACING_TO_DEG[f];

const FAMILY_KIND: Record<BlockFamily, InteriorKind> = { city: "town", outside: "town", dungeon: "dungeon", fortress: "fortress", cave: "cave", cyber: "dungeon" };
const FAMILY_THEME: Record<BlockFamily, string> = { city: "town", outside: "town", dungeon: "dungeon", fortress: "fortress", cave: "cave", cyber: "cyber" };

/** Actions that open or close things on their own cell are `interact`, the rest fires on entering. See `ActionKind` legacy. */
export const keyOf = (x: number, y: number): string => `${x},${y}`;

/**
 * A campaign map in the editor's absolute coordinates, with the changes the game makes to it (broken walls, opened
 * gates, moved chests, spawned monsters). `toInteriorMap` and `toContent` turn the current state into what the renderer and
 * the game loop already understand.
 */
export class CampaignMapModel {
  readonly slug: string;
  readonly name: string;
  readonly music: number;
  readonly origin: readonly [number, number];
  readonly width: number;
  readonly height: number;
  readonly start: CampaignMapData["start"];
  private readonly cells = new Map<string, CampaignCell>();
  private readonly overrides: CellOverrides = {};
  /** Bumped by every change of the layout, so views know when to rebuild. */
  version = 0;

  constructor(data: CampaignMapData, overrides: CellOverrides = {}) {
    this.slug = data.slug;
    this.name = data.name;
    this.music = data.music;
    this.origin = data.origin;
    this.width = data.width;
    this.height = data.height;
    this.start = data.start;
    for (const c of data.cells) {
      const { x, y, ...rest } = c;
      this.cells.set(keyOf(x, y), rest);
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) this.cells.delete(k);
      else this.cells.set(k, { ...v });
      this.overrides[k] = v === null ? null : { ...v };
    }
  }

  // ------------------------------------------------------------ coordinates

  /** Editor coordinates to grid cell. The old y axis points north, the grid's points south. */
  toLocal(x: number, y: number): { x: number; y: number } {
    return { x: x - this.origin[0], y: this.origin[1] + this.height - 1 - y };
  }

  toAbsolute(cx: number, cy: number): { x: number; y: number } {
    return { x: cx + this.origin[0], y: this.origin[1] + this.height - 1 - cy };
  }

  // ------------------------------------------------------------ reading

  get(x: number, y: number): CampaignCell | undefined {
    return this.cells.get(keyOf(x, y));
  }

  has(x: number, y: number): boolean {
    return this.cells.has(keyOf(x, y));
  }

  blockDef(x: number, y: number): BlockDef | undefined {
    const b = this.get(x, y)?.b;
    return b === undefined ? undefined : BLOCKS[b];
  }

  /** Cells in editor coordinates. */
  entries(): [number, number, CampaignCell][] {
    const out: [number, number, CampaignCell][] = [];
    for (const [k, c] of this.cells) {
      const [x, y] = k.split(",").map(Number) as [number, number];
      out.push([x, y, c]);
    }
    return out;
  }

  /** Can the party stand here? Water and the like are handled by the caller (talents, spells). */
  isWalkable(x: number, y: number): boolean {
    return this.blockDef(x, y)?.walkable === true;
  }

  /** An item that blocks the cell (chest, statue, lever), as the ITEMS table says. */
  hasObstacleItem(x: number, y: number, obstacle: (item: number) => boolean): boolean {
    const i = this.get(x, y)?.i;
    return i !== undefined && obstacle(i);
  }

  /** Is there an item on the cell that blocks it (chest, statue, gate)? */
  hasObstacle(x: number, y: number): boolean {
    const i = this.get(x, y)?.i;
    return i !== undefined && MAP_ITEMS[i]?.obstacle === true;
  }

  /** Walkable ground nobody blocks. */
  isFree(x: number, y: number): boolean {
    return this.isWalkable(x, y) && !this.hasObstacle(x, y);
  }

  /** The border a brittle wall's wall piece stands on, or null for any other cell (see `BlockDef.slab`). */
  slabAt(x: number, y: number): Facing | null {
    return this.blockDef(x, y)?.slab ? slabSide(this.get(x, y)?.br) : null;
  }

  /** Free ground, or the cell of a brittle wall that the party may stand in (monsters may not). */
  isEnterable(x: number, y: number): boolean {
    return this.isFree(x, y) || (this.slabAt(x, y) !== null && !this.hasObstacle(x, y));
  }

  /** The free cell closest to an editor cell (breadth-first over the 4-neighbourhood), or null within `radius` steps. */
  nearestFree(x: number, y: number, radius = 8): { x: number; y: number } | null {
    if (this.isFree(x, y)) return { x, y };
    const seen = new Set<string>([keyOf(x, y)]);
    let frontier: [number, number][] = [[x, y]];
    for (let d = 0; d < radius; d++) {
      const next: [number, number][] = [];
      for (const [cx, cy] of frontier) {
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          const k = keyOf(nx, ny);
          if (seen.has(k)) continue;
          seen.add(k);
          if (this.isFree(nx, ny)) return { x: nx, y: ny };
          next.push([nx, ny]);
        }
      }
      frontier = next;
    }
    return null;
  }

  /** Cells the party can pass once doors and gates are opened: free ground, door blocks and doors. */
  private passable(x: number, y: number): boolean {
    const c = this.get(x, y);
    if (!c || c.b === undefined) return false;
    return this.isFree(x, y) || c.b === 16 || [14, 16, 18].includes(c.a ?? 0) || (this.isWalkable(x, y) && this.hasObstacle(x, y));
  }

  /** The start of the map as the editor stored it, moved onto free ground of the largest walkable region when it lies in the void. */
  safeStart(): { x: number; y: number; facing: Facing } {
    if (this.isFree(this.start.x, this.start.y)) return { ...this.start };
    // flood the map once: the biggest region reachable through doors is the part the party is meant to walk
    const regions: [number, number][][] = [];
    const seen = new Set<string>();
    for (const [x, y] of this.entries()) {
      if (seen.has(keyOf(x, y)) || !this.passable(x, y)) continue;
      const region: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      seen.add(keyOf(x, y));
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        region.push([cx, cy]);
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
          const k = keyOf(cx + dx, cy + dy);
          if (seen.has(k) || !this.passable(cx + dx, cy + dy)) continue;
          seen.add(k);
          stack.push([cx + dx, cy + dy]);
        }
      }
      regions.push(region);
    }
    regions.sort((a, b) => b.length - a.length);
    const free = (regions[0] ?? []).filter(([x, y]) => this.isFree(x, y));
    free.sort((a, b) => Math.abs(a[0] - this.start.x) + Math.abs(a[1] - this.start.y) - (Math.abs(b[0] - this.start.x) + Math.abs(b[1] - this.start.y)));
    const at = free[0] ?? [this.start.x, this.start.y];
    return { x: at[0], y: at[1], facing: this.start.facing };
  }

  // ------------------------------------------------------------ changing

  private touch(x: number, y: number): CampaignCell {
    const k = keyOf(x, y);
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = {}));
    return c;
  }

  private commit(x: number, y: number): void {
    const k = keyOf(x, y);
    const c = this.cells.get(k);
    if (c && Object.keys(c).length === 0) {
      this.cells.delete(k);
      this.overrides[k] = null;
    } else this.overrides[k] = c ? { ...c, ax: c.ax ? { ...c.ax } : undefined } : null;
    if (this.overrides[k] && this.overrides[k]!.ax === undefined) delete this.overrides[k]!.ax;
    this.version++;
  }

  setBlock(x: number, y: number, block: number, rotation = 0): void {
    const c = this.touch(x, y);
    c.b = block;
    if (rotation) c.br = rotation;
    else delete c.br;
    this.commit(x, y);
  }

  removeBlock(x: number, y: number): void {
    const c = this.get(x, y);
    if (!c) return;
    delete c.b;
    delete c.br;
    this.commit(x, y);
  }

  setItem(x: number, y: number, item: number, rotation = 0): void {
    const c = this.touch(x, y);
    c.i = item;
    if (rotation) c.ir = rotation;
    else delete c.ir;
    this.commit(x, y);
  }

  rotateItem(x: number, y: number, rotation: number): void {
    const c = this.touch(x, y);
    if (rotation) c.ir = rotation;
    else delete c.ir;
    this.commit(x, y);
  }

  removeItem(x: number, y: number): void {
    const c = this.get(x, y);
    if (!c) return;
    delete c.i;
    delete c.ir;
    this.commit(x, y);
  }

  setAction(x: number, y: number, action: number, param?: number | string, extra?: Record<string, unknown>): void {
    const c = this.touch(x, y);
    c.a = action;
    if (param !== undefined) c.ap = param;
    else delete c.ap;
    if (extra) c.ax = { ...extra };
    else delete c.ax;
    this.commit(x, y);
  }

  removeAction(x: number, y: number): void {
    const c = this.get(x, y);
    if (!c) return;
    delete c.a;
    delete c.ap;
    delete c.ax;
    this.commit(x, y);
  }

  /** Changes one parameter of an action in place (levers remember that they were pulled). */
  setActionParam(x: number, y: number, key: string, value: unknown): void {
    const c = this.get(x, y);
    if (!c) return;
    c.ax = { ...(c.ax ?? {}), [key]: value };
    this.commit(x, y);
  }

  setMonster(x: number, y: number, monster: number, rotation = 0): void {
    const c = this.touch(x, y);
    c.m = monster;
    if (rotation) c.mr = rotation;
    this.commit(x, y);
  }

  removeMonster(x: number, y: number): void {
    const c = this.get(x, y);
    if (!c) return;
    delete c.m;
    delete c.mp;
    delete c.mh;
    delete c.mr;
    this.commit(x, y);
  }

  /** The changes made so far, for the save file. */
  exportOverrides(): CellOverrides {
    return JSON.parse(JSON.stringify(this.overrides)) as CellOverrides;
  }

  // ------------------------------------------------------------ for the game and the renderer

  /** The family that most cells with a block belong to. Decides theme, fog and wall height. */
  dominantFamily(): BlockFamily {
    const count = new Map<BlockFamily, number>();
    for (const c of this.cells.values()) {
      const def = c.b === undefined ? undefined : BLOCKS[c.b];
      if (def) count.set(def.family, (count.get(def.family) ?? 0) + 1);
    }
    let best: BlockFamily = "dungeon";
    let n = -1;
    for (const [f, v] of count) {
      if (v > n) {
        best = f;
        n = v;
      }
    }
    return best;
  }

  theme(): InteriorTheme {
    const family = this.dominantFamily();
    const base = INTERIOR_THEMES[FAMILY_THEME[family]]!;
    // outdoor maps get the music of the old outside zone
    // the open country is a big map: a little more haze keeps the far mountains from filling the screen
    const fog = family === "outside" ? { ...base.fog, density: 0.012 } : base.fog;
    // towns, castles and the open country lie under the sky (the old game's fortress blocks have no ceiling)
    return { ...base, id: `campaign_${family}`, fog, music: this.music || base.music, open: base.open };
  }

  /** Grid for the renderer and the movement code. Cell types follow the block table. */
  toInteriorMap(): InteriorMap {
    const w = this.width;
    const h = this.height;
    const cells = new Uint8Array(w * h);
    const styleCell = new Uint8Array(w * h);
    const list: CellStyle[] = [BORDER_STYLE];
    const index = new Map<CellStyle, number>([[BORDER_STYLE, 0]]);
    const styleIndex = (s: CellStyle): number => {
      let i = index.get(s);
      if (i === undefined) {
        i = list.length;
        list.push(s);
        index.set(s, i);
      }
      return i;
    };
    for (const [x, y, c] of this.entries()) {
      const def = c.b === undefined ? undefined : BLOCKS[c.b];
      if (!def) continue;
      const { x: cx, y: cy } = this.toLocal(x, y);
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      const i = cy * w + cx;
      cells[i] = def.cls === "floor" ? CELL.FLOOR : def.cls === "low" ? CELL.LOW : CELL.SOLID;
      styleCell[i] = styleIndex(def.style);
    }
    const family = this.dominantFamily();
    const safe = this.safeStart();
    const start = this.toLocal(safe.x, safe.y);
    return {
      kind: FAMILY_KIND[family],
      key: `campaign:${this.slug}`,
      width: w,
      height: h,
      cells,
      rooms: [],
      roomOf: new Int16Array(w * h).fill(-1),
      exit: { x: start.x, y: start.y },
      spawn: { x: start.x, y: start.y, facing: safe.facing },
      lots: [],
      theme: this.theme(),
      tier: 1,
      styles: { list, cell: styleCell },
    };
  }

  /** Legacy actions as action instances in grid coordinates, plus one spawn per monster. */
  toContent(): MapContent {
    const actions: ActionInstance[] = [];
    const spawns: SpawnPoint[] = [];
    for (const [x, y, c] of this.entries()) {
      const { x: cx, y: cy } = this.toLocal(x, y);
      if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) continue;
      if (c.a !== undefined) {
        actions.push({ uid: `c:${this.slug}:${x},${y}`, kind: "legacy", x: cx, y: cy, params: {}, legacy: { id: c.a, ap: c.ap ?? null, ax: c.ax ?? {}, ex: x, ey: y } });
      }
      if (c.m !== undefined && this.blockDef(x, y)?.walkable) {
        spawns.push({ uid: `c:${this.slug}:${x},${y}:m`, x: cx, y: cy, monsterIds: [c.m], boss: false });
      }
    }
    return { mapKey: `campaign:${this.slug}`, tier: 1, actions, spawns };
  }
}
