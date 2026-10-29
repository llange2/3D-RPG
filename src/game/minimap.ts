import { trapElementOf } from "../actions/registry";
import type { ActionKind, MapContent } from "../actions/types";
import { CELL, type Facing, type InteriorMap } from "../interiors/types";
import { MAP_ITEMS, talentInfo } from "../data/tables";
import { BIOME, DECO, GROUND, poiBounds, wrapDelta, type Poi, type TileInfo } from "../world/types";
import type { World } from "../world/world";
import { placeGroundOf } from "./minimapIcons";
import type { DrawingName, GroundName, MinimapIcons, PlaceGround, PlaceName, SymbolName } from "./minimapIcons";
import type { Explored } from "./state";

const BIOME_COLOR: Record<number, string> = {
  [BIOME.MEADOW]: "#4f9a3a",
  [BIOME.FOREST]: "#2f6b2a",
  [BIOME.DESERT]: "#d3b564",
  [BIOME.SNOW]: "#e6eef5",
  [BIOME.SWAMP]: "#566b3a",
  [BIOME.LAVA]: "#9a7a52",
  [BIOME.OCEAN]: "#2c5fa0",
};

/** Dark brown, so that road, pass and bridge differ from dirt (`#9a7a52`) on the map and in the legend. */
const ROAD_COLOR = "#6f4f2c";

function tileColor(t: TileInfo): string {
  switch (t.ground) {
    case GROUND.WATER:
      return "#2c5fa0";
    case GROUND.SHALLOW:
      return "#5a95d0";
    case GROUND.MOUNTAIN:
      return t.biome === BIOME.LAVA ? "#a04030" : "#6c6860";
    case GROUND.ROAD:
    case GROUND.PASS:
    case GROUND.BRIDGE:
      return ROAD_COLOR;
    case GROUND.POI_BLOCK:
      return "#ffd54a";
    case GROUND.LAVA_POOL:
      return "#ff6a1a";
    default:
      return t.deco === 1 ? "#1f4a1c" : t.deco === 5 ? "#a07a4a" : t.dirt ? "#9a7a52" : (BIOME_COLOR[t.biome] ?? "#4f9a3a");
  }
}

/** Campaign actions worth a mark on the map: shops, ways out, chests, doors, people with something to say. Traps and puzzles stay hidden. */
const LEGACY_COLOR: Record<number, string> = {
  1: "#ffb0ff", 2: "#ffb0ff", 3: "#ffb0ff", 4: "#ffb0ff", 5: "#ffb0ff", 6: "#ffb0ff", 7: "#ffb0ff",
  11: "#7ed0ff", 28: "#7ed0ff", 27: "#7ed0ff", 51: "#7ed0ff",
  12: "#ffd54a", 21: "#ffd54a",
  14: "#c9884a", 16: "#c9884a", 18: "#c9884a",
  13: "#9be28a", 15: "#9be28a", 19: "#9be28a", 20: "#9be28a", 29: "#9be28a", 37: "#9be28a", 53: "#9be28a",
  36: "#b98aff", 44: "#b98aff",
};

const ACTION_COLOR: Partial<Record<ActionKind, string>> = {
  treasure: "#ffd54a",
  door: "#c9884a",
  transfer: "#7ed0ff",
  service: "#ffb0ff",
  talent: "#9be28a",
  shrine: "#b98aff",
  fountain: "#7ed0ff",
};

/** Cells across the small map at the top right (the 176 px canvas shows 16 px per cell); the big map zooms on its own. */
export const MINIMAP_CELLS = 11;
/** Cells across the big map when it opens (the user's wish: 25 x 25); the wheel zooms from there. */
export const MAP_OPEN_CELLS = 25;

function arrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, facing: Facing, size: number): void {
  const a = { N: 0, E: Math.PI / 2, S: Math.PI, W: (3 * Math.PI) / 2 }[facing];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.75, size * 0.8);
  ctx.lineTo(0, size * 0.35);
  ctx.lineTo(-size * 0.75, size * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export interface MiniMonster {
  x: number;
  y: number;
}

/** The part of a map the big map shows: its middle cell, which need not be where the party stands once the map was moved. */
export interface MapView {
  x: number;
  y: number;
}

/** The ground a tile of the overworld stands on, for the sheet's tinted tiles. */
function groundName(t: TileInfo): GroundName {
  // bare earth in the grass, and the cleared ground on a lava island, is dirt; only the rock of a lava island is the red ground of the volcano
  if (t.dirt) return "dirt";
  switch (t.biome) {
    case BIOME.FOREST: return "forest";
    case BIOME.DESERT: return "desert";
    case BIOME.SNOW: return "snow";
    case BIOME.SWAMP: return "swamp";
    case BIOME.LAVA: return t.ground === GROUND.MOUNTAIN ? "volcanic" : "dirt";
    case BIOME.OCEAN: return "shore";
    default: return "grass";
  }
}

/** Something to meet on the open land (a mascot, a monster hut, a talent trader's caravan): where it stands in the world and what the mouse-over calls it. */
export interface MapEvent {
  x: number;
  y: number;
  label: string;
}

/** The painted symbol of each kind of place: a cave and a dungeon entrance share one, a pyramid is a dungeon of size 3. */
const POI_SYMBOL: Record<string, PlaceName> = { town: "town", castle: "castle", dungeon: "dungeon", cave: "dungeon", pyramid: "pyramid" };
const poiSymbolOf = (p: { kind: string; size: number }): PlaceName => POI_SYMBOL[p.kind === "dungeon" && p.size === 3 ? "pyramid" : p.kind] ?? "dungeon";

/** The painted ground a place or an event stands on: the ground of its tile, so that the symbol says which region it lies in (a lava island's is the painted lava ground). */
const placeGroundAt = (world: World, x: number, y: number): PlaceGround => {
  const t = world.tile(x, y);
  return placeGroundOf(t.biome === BIOME.LAVA ? "volcanic" : groundName(t));
};

/** One tile of the overworld as a picture of the sheet: ground (tinted), a drawing on it, or a symbol. Null for a tile of a place, which is drawn as a whole. */
function drawOverworldTile(ctx: CanvasRenderingContext2D, icons: MinimapIcons, t: TileInfo, x: number, y: number, w: number): void {
  const ground = groundName(t);
  switch (t.ground) {
    case GROUND.WATER:
      icons.drawSymbol(ctx, "water", x, y, w);
      return;
    case GROUND.SHALLOW:
      icons.drawSymbol(ctx, "water", x, y, w);
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.fillRect(x, y, w, w);
      return;
    case GROUND.MOUNTAIN:
      icons.drawGround(ctx, ground, "mountain", x, y, w);
      return;
    case GROUND.ROAD:
    case GROUND.PASS:
    case GROUND.BRIDGE:
      icons.drawGround(ctx, "road", undefined, x, y, w);
      return;
    case GROUND.LAVA_POOL:
      icons.drawGround(ctx, "lava", undefined, x, y, w);
      return;
    case GROUND.POI_BLOCK:
      icons.drawGround(ctx, ground, undefined, x, y, w);
      return;
    default:
      if (t.deco === DECO.TREE) icons.drawGround(ctx, ground, t.biome === BIOME.DESERT ? "palms" : "trees", x, y, w);
      else if (t.deco === DECO.LANDMARK) icons.drawSymbol(ctx, "info", x, y, w);
      else icons.drawGround(ctx, ground, undefined, x, y, w);
  }
}

/**
 * Draws the surroundings of the party, or of `view` when the map has been moved. `cells` is the number of tiles shown across the canvas. `icons`: the symbols of the
 * old game; without them the map is coloured squares. The world is a globe: the small map goes on round the seam, the big map (the one given a `view`) shows the world
 * once, tiles beyond its edge stay dark, and the party, places and monsters stand at their place in the world (the party's arrow jumps to the other side at the edge).
 */
export function drawOverworldMap(canvas: HTMLCanvasElement, world: World, explored: Explored, px: number, py: number, facing: Facing, monsters: MiniMonster[], cells = MINIMAP_CELLS, revealAll = false, view?: MapView, icons?: MinimapIcons | null, detect = false, events: readonly MapEvent[] = []): void {
  const ctx = canvas.getContext("2d")!;
  const s = canvas.width / cells;
  const half = Math.floor(cells / 2);
  const once = view !== undefined;
  if (once) {
    px = world.wrapX(px);
    py = world.wrapY(py);
  }
  const mx = view?.x ?? px;
  const my = view?.y ?? py;
  ctx.fillStyle = "#0a0705";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  /** The places on the map, drawn once as a whole after the ground: a town of 2 x 2 tiles is one symbol over four tiles. */
  const places = new Map<string, Poi>();
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const x = mx + dx;
      const y = my + dy;
      if (once && (x < 0 || y < 0 || x >= world.width || y >= world.height)) continue;
      if (!revealAll && !explored.hasOverworld(x, y)) continue;
      const t = world.tile(x, y);
      if (icons) {
        drawOverworldTile(ctx, icons, t, (dx + half) * s, (dy + half) * s, Math.ceil(s));
        if (t.poiId && !places.has(t.poiId)) {
          const poi = world.poiById(t.poiId);
          if (poi) places.set(t.poiId, poi);
        }
      } else {
        ctx.fillStyle = tileColor(t);
        ctx.fillRect((dx + half) * s, (dy + half) * s, Math.ceil(s), Math.ceil(s));
      }
    }
  }
  if (icons) {
    for (const poi of places.values()) {
      const b = poiBounds(poi);
      // the world is a globe: the place is drawn where its copy nearest to the middle of the map stands
      const shiftX = once ? 0 : wrapDelta(mx, poi.x, world.width) - (poi.x - mx);
      const shiftY = once ? 0 : wrapDelta(my, poi.y, world.height) - (poi.y - my);
      const left = (b.x0 + shiftX - mx + half) * s;
      const top = (b.y0 + shiftY - my + half) * s;
      icons.drawPlace(ctx, poiSymbolOf(poi), placeGroundAt(world, poi.x, poi.y), left, top, poi.size * s);
    }
  }
  // the events of the open land get the old question mark of the chests and fountains in the places, once their tile has been seen
  for (const ev of events) {
    const dx = once ? world.wrapX(ev.x) - mx : wrapDelta(mx, ev.x, world.width);
    const dy = once ? world.wrapY(ev.y) - my : wrapDelta(my, ev.y, world.height);
    if (Math.abs(dx) > half || Math.abs(dy) > half) continue;
    if (!revealAll && !explored.hasOverworld(ev.x, ev.y)) continue;
    const left = (dx + half) * s;
    const top = (dy + half) * s;
    if (icons) icons.drawPlace(ctx, "event", placeGroundAt(world, ev.x, ev.y), left, top, Math.ceil(s));
    else {
      ctx.fillStyle = "#ffd54a";
      ctx.font = `bold ${Math.ceil(s)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", left + s / 2, top + s / 2);
    }
  }
  ctx.fillStyle = "#ff3a2a";
  for (const m of monsters) {
    const mxw = once ? world.wrapX(m.x) : m.x;
    const myw = once ? world.wrapY(m.y) : m.y;
    const dx = mxw - mx;
    const dy = myw - my;
    if (Math.abs(dx) > half || Math.abs(dy) > half) continue;
    // a monster on ground the party has not seen would show what lies behind a mountain or a wood
    // Detect Monster shows them wherever they are; Wizard's Eye shows the ground, not who stands on it
    if (!detect && !explored.hasOverworld(m.x, m.y)) continue;
    if (icons) icons.drawSymbol(ctx, "pos2", (dx + half) * s + s * 0.1, (dy + half) * s + s * 0.1, s * 0.8);
    else ctx.fillRect((dx + half) * s + s * 0.2, (dy + half) * s + s * 0.2, s * 0.6, s * 0.6);
  }
  if (Math.abs(px - mx) <= half && Math.abs(py - my) <= half) party(ctx, (px - mx + half + 0.5) * s, (py - my + half + 0.5) * s, facing, s, icons);
}

/** The party: the old game's red arrow turned the way the party looks, or the white arrow without the sheet. `cell` is the side of one map cell: the arrow fills exactly one. */
function party(ctx: CanvasRenderingContext2D, cx: number, cy: number, facing: Facing, cell: number, icons?: MinimapIcons | null): void {
  if (!icons) {
    // the white arrow spans 1.8 times its size from tip to tail
    arrow(ctx, cx, cy, facing, cell / 1.8);
    return;
  }
  // the old arrow points east
  const a = { N: -Math.PI / 2, E: 0, S: Math.PI / 2, W: Math.PI }[facing];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  icons.drawSymbol(ctx, "pos1", -cell / 2, -cell / 2, cell);
  ctx.restore();
}

/** A trap the Crow gave away: a diamond in this colour on the floor, so that it cannot be taken for a chest or a door. */
const TRAP_COLOR = "#ff9a2a";

/** What symbol an action puts on its cell of an interior map, or null for the ones the map keeps to itself (traps, ambushes, scenery, plain messages). */
function actionSymbol(a: { kind: ActionKind; uid: string; params: Record<string, unknown>; legacy?: { id: number } }, opened: ReadonlySet<string>): SymbolName | null {
  if (a.kind === "legacy") {
    const id = a.legacy?.id ?? -1;
    if (id >= 1 && id <= 7) return SERVICE_SYMBOLS[id - 1]!;
    if (id === 11 || id === 27 || id === 28 || id === 51) return "exit";
    if (id === 12 || id === 21 || id === 36 || id === 44) return "event";
    if (id === 14 || id === 16 || id === 18) return opened.has(a.uid) ? "door_open" : "door";
    if (id === 13 || id === 15 || id === 19 || id === 20 || id === 29 || id === 37 || id === 53) return "persona";
    return null;
  }
  switch (a.kind) {
    case "treasure": return "event";
    case "door": return opened.has(a.uid) ? "door_open" : "door";
    case "transfer": return "exit";
    case "service": return typeof a.params.service === "string" ? (SERVICE_SYMBOL[a.params.service] ?? "inn") : "inn";
    case "talent": case "work": return "persona";
    case "portal": return "teleporter_city";
    case "lore": return typeof a.params.persona === "number" ? "persona" : null;
    case "shrine": case "fountain": return "event";
    case "riddle": case "gong": case "lever": case "head": case "chalice": return "info";
    case "qportal": return "teleporter_city";
    default: return null;
  }
}

/** The shops in the order of the old action ids 1 to 7, and by name. */
const SERVICE_SYMBOLS: SymbolName[] = ["inn", "training", "tavern", "smith", "temple", "bank", "guild"];
const SERVICE_SYMBOL: Record<string, SymbolName> = { inn: "inn", training: "training", tavern: "tavern", smith: "smith", temple: "temple", bank: "bank", guild: "guild" };

/**
 * An object whose use is not written on it: a fountain that heals, a shrine that blesses, a barrel or a gravestone with something in it. The map
 * shows it only once it has been used, or while Wizard's Eye is on. What the story hangs on (real chests, a quest chest, levers, doors, people, shops) is
 * always on the map.
 */
export function hasHiddenUse(a: { kind: string; params: Record<string, unknown> }): boolean {
  if (a.kind === "fountain" || a.kind === "shrine") return true;
  if (a.kind === "treasure") {
    if (typeof a.params.quest === "string") return false;
    const chest = Number(a.params.chest);
    return !MAP_ITEMS[chest]?.name.startsWith("Chest");
  }
  return false;
}

/** The actions of a level that the map may show: the hidden ones only when `eye` is on or the party has used them (`opened` holds the uid of the object, or the uid followed by `@` and what happened). */
export function knownContent(content: MapContent, opened: ReadonlySet<string>, eye: boolean): MapContent {
  if (eye) return content;
  const used = new Set<string>();
  for (const key of opened) {
    const at = key.indexOf("@");
    used.add(at > 0 ? key.slice(0, at) : key);
  }
  return { ...content, actions: content.actions.filter((a) => !hasHiddenUse(a) || used.has(a.uid)) };
}

/**
 * Draws an interior. `traps` (keys `x,y`) are the traps to mark: the map hides them unless the party has Wizard's Eye and the Crow
 * (see `Game.trapsShown`). `eye`: Wizard's Eye is on, the whole map shows (not the monsters: `detect`, Detect Monster, shows those wherever they are). `icons`: the symbols of the old game; without them the map is coloured squares.
 */
export function drawInteriorMap(canvas: HTMLCanvasElement, map: InteriorMap, content: MapContent, explored: Explored, opened: Set<string>, px: number, py: number, facing: Facing, monsters: MiniMonster[], cells = MINIMAP_CELLS, traps: ReadonlySet<string> = new Set(), view?: MapView, icons?: MinimapIcons | null, eye = false, detect = false): void {
  const ctx = canvas.getContext("2d")!;
  const s = canvas.width / cells;
  const half = Math.floor(cells / 2);
  const mx = view?.x ?? px;
  const my = view?.y ?? py;
  const key = `in:${map.key}`;
  content = knownContent(content, opened, eye);
  ctx.fillStyle = "#0a0705";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const actionAt = new Map<string, ActionKind>();
  const symbolAt = new Map<string, { symbol: SymbolName; used: boolean }>();
  const legacyColor = new Map<string, string>();
  for (const a of content.actions) {
    const symbol = actionSymbol(a, opened);
    // a wall that can be broken is a wall: it keeps its brick picture (the party with the Perceptive talent learns it from the pointer)
    if (symbol && a.kind !== "breakable_wall") symbolAt.set(`${a.x},${a.y}`, { symbol, used: opened.has(a.uid) && symbol !== "door_open" });
    if (a.kind === "legacy") {
      const color = a.legacy ? LEGACY_COLOR[a.legacy.id] : undefined;
      if (color) legacyColor.set(`${a.x},${a.y}`, color);
      continue;
    }
    if (!(a.kind === "trap" || a.kind === "ambush" || a.kind === "lore")) actionAt.set(`${a.x},${a.y}`, a.kind);
  }
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const x = mx + dx;
      const y = my + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      // Wizard's Eye shows the whole map for as long as it lasts, without marking anything as explored
      if (!eye && !explored.has(key, y * map.width + x)) continue;
      const cell = map.cells[y * map.width + x]!;
      const left = (dx + half) * s;
      const top = (dy + half) * s;
      if (icons) {
        const style = cell === CELL.LOW ? map.styles?.list[map.styles.cell[y * map.width + x]!] : undefined;
        if (cell === CELL.FLOOR) icons.drawSymbol(ctx, "floor", left, top, Math.ceil(s));
        else if (cell === CELL.LOW) {
          if (style?.water) icons.drawSymbol(ctx, "water", left, top, Math.ceil(s));
          else if (style?.glow) icons.drawGround(ctx, "lava", undefined, left, top, Math.ceil(s));
          else icons.drawSymbol(ctx, "unknown", left, top, Math.ceil(s));
        } else icons.drawSymbol(ctx, "wall", left, top, Math.ceil(s));
        const mark = cell === CELL.FLOOR || cell === CELL.SOLID ? symbolAt.get(`${x},${y}`) : undefined;
        if (mark) icons.drawSymbol(ctx, mark.symbol, left, top, Math.ceil(s), Math.ceil(s), mark.used ? 0.4 : 1);
        if (x === map.exit.x && y === map.exit.y) icons.drawSymbol(ctx, "exit", left, top, Math.ceil(s));
        if (traps.has(`${x},${y}`)) icons.drawSymbol(ctx, "trap", left, top, Math.ceil(s));
        continue;
      }
      let color = cell === CELL.FLOOR ? "#8a7a5a" : cell === CELL.BUILDING ? "#5a4a3a" : "#2a2420";
      if (cell === CELL.LOW) color = map.styles?.list[map.styles.cell[y * map.width + x]!]?.water ? "#2c5fa0" : "#4a4238";
      const mark = legacyColor.get(`${x},${y}`);
      if (mark && (cell === CELL.FLOOR || cell === CELL.SOLID)) color = mark;
      const act = cell === CELL.FLOOR ? actionAt.get(`${x},${y}`) : undefined;
      if (act) {
        const a = content.actions.find((c) => c.x === x && c.y === y);
        color = (a && opened.has(a.uid) ? "#555" : ACTION_COLOR[act]) ?? color;
      }
      if (x === map.exit.x && y === map.exit.y) color = "#7ed0ff";
      ctx.fillStyle = color;
      ctx.fillRect(left, top, Math.ceil(s), Math.ceil(s));
      if (traps.has(`${x},${y}`)) {
        const cx = (dx + half + 0.5) * s;
        const cy = (dy + half + 0.5) * s;
        const r = s * 0.46;
        ctx.fillStyle = TRAP_COLOR;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  // the way out lies beyond the edge of the map: a marker on the edge points to it (the party came in there, so it is known)
  const ex = map.exit.x - mx;
  const ey = map.exit.y - my;
  if ((Math.abs(ex) > half || Math.abs(ey) > half) && (eye || explored.has(key, map.exit.y * map.width + map.exit.x))) {
    const k = half / Math.max(Math.abs(ex), Math.abs(ey));
    const cx = (Math.round(ex * k) + half + 0.5) * s;
    const cy = (Math.round(ey * k) + half + 0.5) * s;
    if (icons) {
      const r = Math.max(3, s * 0.7);
      icons.drawSymbol(ctx, "exit", cx - r, cy - r, r * 2);
    } else {
      ctx.fillStyle = "#7ed0ff";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3, s * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#ff3a2a";
  for (const m of monsters) {
    const dx = m.x - mx;
    const dy = m.y - my;
    if (Math.abs(dx) > half || Math.abs(dy) > half) continue;
    if (!detect && !explored.has(key, m.y * map.width + m.x)) continue;
    if (icons) icons.drawSymbol(ctx, "pos2", (dx + half) * s + s * 0.08, (dy + half) * s + s * 0.08, s * 0.84);
    else ctx.fillRect((dx + half) * s + s * 0.15, (dy + half) * s + s * 0.15, s * 0.7, s * 0.7);
  }
  if (Math.abs(px - mx) <= half && Math.abs(py - my) <= half) party(ctx, (px - mx + half + 0.5) * s, (py - my + half + 0.5) * s, facing, s, icons);
}

// ---------------------------------------------------------------- legend and mouse-over of the big map

/** The picture of a legend row: a symbol of the sheet, a painted place or a ground with a drawing on it. */
export type LegendIcon = { symbol: SymbolName; veil?: boolean } | { place: PlaceName; ground?: PlaceGround } | { ground: GroundName; drawing?: DrawingName };

export interface LegendEntry {
  color: string;
  label: string;
  icon?: LegendIcon;
}

const MONSTER_COLOR = "#ff3a2a";

/** What the colours and symbols of the overworld map mean. */
export const OVERWORLD_LEGEND: LegendEntry[] = [
  { color: BIOME_COLOR[BIOME.MEADOW]!, label: "Meadow", icon: { ground: "grass" } },
  { color: "#1f4a1c", label: "Trees", icon: { ground: "grass", drawing: "trees" } },
  { color: "#a07a4a", label: "Landmark (well, stone head)", icon: { symbol: "info" } },
  { color: "#ffd54a", label: "Something to meet (mascot, monster hut, caravan)", icon: { place: "event", ground: "meadow" } },
  { color: BIOME_COLOR[BIOME.DESERT]!, label: "Desert (palms)", icon: { ground: "desert", drawing: "palms" } },
  { color: BIOME_COLOR[BIOME.SNOW]!, label: "Snow", icon: { ground: "snow" } },
  { color: BIOME_COLOR[BIOME.SWAMP]!, label: "Swamp", icon: { ground: "swamp" } },
  { color: "#9a7a52", label: "Dirt", icon: { ground: "dirt" } },
  { color: "#a04030", label: "Lava mountains", icon: { ground: "volcanic", drawing: "mountain" } },
  { color: "#6c6860", label: "Mountains", icon: { ground: "grass", drawing: "mountain" } },
  { color: "#2c5fa0", label: "Deep water", icon: { symbol: "water" } },
  { color: "#5a95d0", label: "Shallow water", icon: { symbol: "water", veil: true } },
  { color: ROAD_COLOR, label: "Road, pass or bridge", icon: { ground: "road" } },
  { color: "#ff6a1a", label: "Lava", icon: { ground: "lava" } },
  { color: "#ffd54a", label: "Town", icon: { place: "town", ground: "meadow" } },
  { color: "#c8d0e0", label: "Castle", icon: { place: "castle", ground: "meadow" } },
  { color: "#b070ff", label: "Dungeon or cave", icon: { place: "dungeon", ground: "meadow" } },
  { color: "#ff8a3a", label: "Pyramid", icon: { place: "pyramid", ground: "meadow" } },
  { color: MONSTER_COLOR, label: "Monster", icon: { symbol: "pos2" } },
  { color: "#fff", label: "You", icon: { symbol: "pos1" } },
];

/** Which meaning a colour of an interior map has, for the legend (only what the map actually shows). */
const INTERIOR_LEGEND: (LegendEntry & { when: (map: InteriorMap, content: MapContent, traps: boolean) => boolean })[] = [
  { color: "#8a7a5a", label: "Floor", icon: { symbol: "floor" }, when: () => true },
  { color: "#2a2420", label: "Wall", icon: { symbol: "wall" }, when: () => true },
  { color: "#5a4a3a", label: "House", icon: { symbol: "wall" }, when: (m) => m.kind === "town" && m.lots.length > 0 },
  { color: "#4a4a50", label: "Pillars", icon: { symbol: "floor" }, when: (m) => (m.pillars?.length ?? 0) > 0 },
  { color: "#2c5fa0", label: "Water", icon: { symbol: "water" }, when: (m) => !!m.styles?.list.some((s) => s.water) },
  { color: "#4a4238", label: "Ground that cannot be entered", icon: { symbol: "unknown" }, when: (m) => m.cells.includes(CELL.LOW) },
  { color: "#7ed0ff", label: "Way out or way to another place", icon: { symbol: "exit" }, when: () => true },
  { color: "#7ed0ff", label: "Portal to the other towns", icon: { symbol: "teleporter_city" }, when: (_, c) => c.actions.some((a) => a.kind === "portal") },
  { color: "#ffd54a", label: "Chest, fountain or something to find", icon: { symbol: "event" }, when: (_, c) => c.actions.some((a) => a.kind === "treasure" || a.kind === "fountain" || LEGACY_COLOR[a.legacy?.id ?? -1] === "#ffd54a") },
  { color: "#c9884a", label: "Door or gate", icon: { symbol: "door" }, when: (_, c) => c.actions.some((a) => a.kind === "door" || LEGACY_COLOR[a.legacy?.id ?? -1] === "#c9884a") },
  ...(["inn", "training", "tavern", "smith", "temple", "bank", "guild"] as const).map((service, i) => ({
    color: "#ffb0ff",
    label: { inn: "Inn", training: "Training grounds", tavern: "Tavern", smith: "Smithy", temple: "Temple", bank: "Bank", guild: "Guild" }[service],
    icon: { symbol: service } as LegendIcon,
    when: (_m: InteriorMap, c: MapContent) => c.actions.some((a) => (a.kind === "service" && a.params.service === service) || (a.legacy?.id === i + 1)),
  })),
  { color: "#9be28a", label: "Person, quest or talent", icon: { symbol: "persona" }, when: (_, c) => c.actions.some((a) => a.kind === "talent" || a.kind === "work" || (a.kind === "lore" && typeof a.params.persona === "number") || LEGACY_COLOR[a.legacy?.id ?? -1] === "#9be28a") },
  { color: "#b98aff", label: "Shrine or blessing", icon: { symbol: "event" }, when: (_, c) => c.actions.some((a) => a.kind === "shrine" || LEGACY_COLOR[a.legacy?.id ?? -1] === "#b98aff") },
  { color: "#555", label: "Used up (dimmed)", when: () => true },
  { color: TRAP_COLOR, label: "Trap in sight (Wizard's Eye and the Crow)", icon: { symbol: "trap" }, when: (_m, _c, traps) => traps },
  { color: MONSTER_COLOR, label: "Monster", icon: { symbol: "pos2" }, when: () => true },
  { color: "#fff", label: "You", icon: { symbol: "pos1" }, when: () => true },
];

/** `traps`: the map marks traps just now (Wizard's Eye and the Crow), so the legend names them. */
export function interiorLegend(map: InteriorMap, content: MapContent, traps = false, opened: ReadonlySet<string> = new Set(), eye = false): LegendEntry[] {
  const known = knownContent(content, opened, eye);
  return INTERIOR_LEGEND.filter((e) => e.when(map, known, traps)).map(({ color, label, icon }) => ({ color, label, ...(icon ? { icon } : {}) }));
}

/** What a trap is called on the map. */
function trapLabel(a: { uid: string; kind: string; params: Record<string, unknown>; legacy?: { id: number } }): string {
  const kind = a.legacy ? ({ 17: "spring", 23: "pit", 24: "guillotine" } as Record<number, string>)[a.legacy.id] : String(a.params.trap);
  switch (kind) {
    case "spring": return "Spear trap";
    case "pit": return "Pit";
    case "guillotine": return "Guillotine trap";
    // a generated generic trap throws one fixed element; the campaign's picks it per trap in its editor data
    case "generic": return `${trapElementOf(a)[0]!.toUpperCase()}${trapElementOf(a).slice(1)} trap`;
    default: return "Trap";
  }
}

const SERVICE_NAME = ["Inn", "Training grounds", "Tavern", "Smithy", "Temple", "Bank", "Guild"];

/** Names of the old actions that the map marks, for the mouse-over. */
function legacyLabel(id: number): string | null {
  if (id >= 1 && id <= 7) return SERVICE_NAME[id - 1]!;
  switch (id) {
    case 11: return "Way to another place";
    case 27: return "Teleporter";
    case 28: return "Portal";
    case 51: return "Way out";
    case 12: return "Something to find";
    case 21: return "Treasure";
    case 14: return "Door";
    case 16: case 18: return "Gate";
    case 13: return "Mascot";
    case 15: return "Talent for sale";
    case 19: return "Work for gold";
    case 20: return "Quest";
    case 29: return "Trader";
    case 37: return "Quest";
    case 53: return "Throne";
    case 36: case 44: return "Blessing";
    default: return null;
  }
}

/** What is on a tile of the overworld map (only for tiles the party has seen). */
export function describeOverworldTile(world: World, explored: Explored, x: number, y: number, monsters: MiniMonster[], events: readonly MapEvent[] = []): string | null {
  if (!explored.hasOverworld(x, y)) return null;
  const t = world.tile(x, y);
  if (monsters.some((m) => m.x === x && m.y === y)) return "Monster";
  const wx = world.wrapX(x);
  const wy = world.wrapY(y);
  const event = events.find((e) => world.wrapX(e.x) === wx && world.wrapY(e.y) === wy);
  if (event) return event.label;
  if (t.poiId) {
    const poi = world.poiById(t.poiId);
    if (poi) return `${poi.name} (${poi.kind === "castle" ? "castle" : poi.kind === "town" ? "town" : poi.kind === "cave" ? "cave" : "dungeon"})`;
  }
  switch (t.ground) {
    case GROUND.WATER: return "Deep water";
    case GROUND.SHALLOW: return "Shallow water";
    case GROUND.MOUNTAIN: return t.biome === BIOME.LAVA ? "Lava mountains" : "Mountains";
    case GROUND.ROAD:
    case GROUND.BRIDGE: return "Road";
    case GROUND.PASS: return "Mountain pass";
    case GROUND.LAVA_POOL: return "Lava";
  }
  if (t.deco === 1) return "Trees";
  if (t.deco === 5) return "Well, hut or other landmark";
  if (t.dirt) return "Dirt";
  return ["Meadow", "Forest floor", "Desert", "Snow", "Swamp", "Dirt", "Shore"][t.biome] ?? "Open ground";
}

/** What is in a cell of an interior map (only for cells the party has seen). */
export function describeInteriorCell(map: InteriorMap, content: MapContent, explored: Explored, opened: Set<string>, x: number, y: number, monsters: MiniMonster[], traps: ReadonlySet<string> = new Set(), perceptive = false, eye = false): string | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  if (!eye && !explored.has(`in:${map.key}`, y * map.width + x)) return null;
  content = knownContent(content, opened, eye);
  if (monsters.some((m) => m.x === x && m.y === y)) return "Monster";
  const a = content.actions.find((c) => c.x === x && c.y === y);
  if (a && traps.has(`${x},${y}`)) return trapLabel(a);
  if (a) {
    const used = opened.has(a.uid) ? " (used)" : "";
    if (a.legacy) {
      const label = legacyLabel(a.legacy.id);
      if (label) return label + used;
    } else {
      switch (a.kind) {
        case "treasure": return `Chest${used}`;
        case "door": return `Door${used}`;
        case "transfer": return "Way out";
        case "service": return `${typeof a.params.service === "string" ? a.params.service[0]!.toUpperCase() + a.params.service.slice(1) : "Service"}`;
        case "shrine": return `Shrine${used}`;
        case "fountain": return "Fountain";
        case "talent": return `Talent for sale: ${talentInfo(String(a.params.talent)).name}`;
        // it looks like any other wall to a party without the Perceptive talent
        case "breakable_wall": return map.cells[y * map.width + x] !== CELL.SOLID ? "Broken wall" : perceptive ? "Wall that looks weak" : "Wall";
        case "riddle": return `Statue${used}`;
        case "gong": return `Gong${used}`;
        case "lever": return "Lever";
        case "head": return "Stone head";
        case "chalice": return `Chalice${used}`;
        case "rune": return "Magic runes";
        case "qportal": return "Portal back to the entrance";
        case "portal": return "Portal";
        case "work": return "Job master: work a week for gold";
        default: break;
      }
    }
  }
  if (x === map.exit.x && y === map.exit.y) return "Way out";
  const cell = map.cells[y * map.width + x]!;
  if (cell === CELL.FLOOR) return map.pillars?.some((p) => p.x === x && p.y === y) ? "Floor between pillars" : "Floor";
  if (cell === CELL.BUILDING) return "House";
  if (cell === CELL.LOW) return map.styles?.list[map.styles.cell[y * map.width + x]!]?.water ? "Water" : "Ground that cannot be entered";
  return "Wall";
}
