import { headFacing, ringHeadPresent, runeActive } from "../actions/quests";
import { WALL_HUNG_ITEMS } from "../actions/rules";
import { DECO_MODELS, DECO_PLATE, DECO_SCALE } from "../data/wall-deco";
import { BROKEN_CRYSTAL_ITEM, CONSOLE_ITEM, CONSOLE_SCALE, CRATE_ITEM, ENGINE_CRYSTAL_FLAG, LIFE_FLAG, POWER_CRYSTAL_ITEM, STAIRCASE_ITEM } from "../data/quest-table";
import type { ActionInstance, MapContent } from "../actions/types";
import type { StaticModelInfo } from "./assets";
import { isGlbItem, itemModelKey, itemProp } from "./itemProps";
import { CELL_SIZE, TOWER_STOREY } from "./interiorMesher";
import type { PropInstance } from "./terrainMesher";

/**
 * The objects of a themed cave or dungeon are old map items (docs/DUNGEON_THEMES.md): a chest is item 1, 74, 72 or 96, a shrine a
 * crystal, altar or well, and the style of the place adds barrels, bones, banners and the like. The chests, altars and wells have
 * models of their own in the interior view (`obj_*`); every other item is drawn from its old model (`ci_<id>`) in the pose of the
 * item table, the way the campaign draws it.
 */

/** The altar (item 35) is 60 % of the size the wells have (31st playtest, point 6); a prop rests its lowest point on the floor whatever its scale. */
export const ALTAR_SCALE = 0.9;

/**
 * The wall reliefs hang with their middle 2.0 above the floor (the moose king's carving), and their back lies 0.03 inside the wall. They lay 0.1 inside it (a hand's breadth), which put
 * the plate behind the figure (its front lies 0.13 to 0.16 in front of the back, times the scale) a hair behind the wall's face: the wall's stones showed through the frame (48th playtest, "see
 * through the wall", `.ignore/screen.png`).
 */
const DECO_LIFT = 2.0 - 0.95 * DECO_SCALE;
const DECO_BURY = 0.03;
/** How far the plane of a relief's backing plate stands in front of the wall's face: a hair, so that plate and wall do not fight for the same pixels (53rd playtest, point 4). */
const DECO_FLUSH = 0.01;
/** The share of its depth (backing plate to the front-most point) that a relief is sunk into the wall (54th playtest, point 3). */
export const DECO_SINK_SHARE = 1 / 3;
/** Half the width of a cell (`CELL_SIZE` 3): where the wall stands. */
const WALL_AT = 1.5;

/** Old item id -> the interior view's own model and its scale, for the objects it has had since before the themes. */
export const OWN_MODELS: Record<number, { model: string; scale: number; scale3?: [number, number, number]; lift?: number }> = {
  1: { model: "obj_chest", scale: 0.85 },
  74: { model: "obj_chest_iron", scale: 0.85 },
  72: { model: "obj_chest_noble", scale: 0.85 },
  96: { model: "obj_chest_sapphire", scale: 0.85 },
  35: { model: "obj_altar", scale: ALTAR_SCALE },
  37: { model: "obj_well_red", scale: 1.5 },
  88: { model: "obj_well_yellow", scale: 1.5 },
  // the user's models of the spaceship (quest document 1.5). The prop renderer rests a model's lowest point on the floor whatever the file's origin is, so none needs a `lift`
  // (the first version lifted them by half their height and they hovered)
  // (the crates are 20 % bigger than the first version's 1.6)
  [CRATE_ITEM]: { model: "obj_futuristic_box", scale: 1.92 },
  // the broken crystal is as big as the intact one it turns into (item 67, 0.87 x 2.0 x 0.86 in the original set; the file is 0.43 x 0.95 x 0.43), and it rests on the floor the same way
  [BROKEN_CRYSTAL_ITEM]: { model: "obj_power_crystal_broken", scale: 2.03, scale3: [2.03, 2.1, 2.0] },
  [CONSOLE_ITEM]: { model: "obj_spaceship_console", scale: CONSOLE_SCALE },
  // the wooden stairs of a tower (quest document 1.7, 49th playtest): the file (the user's second version of 8. 11. 2026, 50th playtest) is 0.97 x 1.26 x 1.9; `stairsScale` stretches them over a whole cell and one storey of the tower
  [STAIRCASE_ITEM]: { model: "obj_wooden_stairs", scale: 1 },
  // the wall reliefs of the dungeons (45th playtest, point 4): the files are 1.3 x 1.9 around their middle, as big as the moose king's carving (scale 1.2); the middle hangs at the height of the
  // moose's (2.0), so the lowest point is 2.0 - 0.95 * 1.2 above the floor
  ...Object.fromEntries(Object.entries(DECO_MODELS).map(([item, model]) => [item, { model, scale: DECO_SCALE, lift: DECO_LIFT }])),
};

/**
 * Old items that hang on a wall (the banners and the moose king's carving): the model's cloth or plaque lies a cell's wall distance behind its origin,
 * so it is turned like the old game's, not like the standing GLB objects. The carving floated in the room with its back to it (30th playtest, point 3).
 */
export const WALL_HUNG: ReadonlySet<number> = new Set(WALL_HUNG_ITEMS);

/** Old items whose model has its working side (the lectern's sloping top) where the others have their back: turned by this many degrees on top of the rule above. */
// (13, the storage equipment, was in this list since the 36th playtest, point 10; the sacks then stood behind the crate, toward the wall, in the Vault of Itha 23/59: 53rd playtest, point 21, turned back by half a circle)
const FRONT_TURN: Readonly<Record<number, number>> = { 119: 180 };

/** The stone coffins (old items 127 and 128) and the turns they get on top of the wall rule: 90 or 135 degrees, clockwise or against it. */
const SARCOPHAGI: ReadonlySet<number> = new Set([127, 128]);
const SARCOPHAGUS_TURNS: readonly number[] = [90, 135, -90, -135];

/** The kinds of action whose `item` param is an old item they stand on their cell as (a statue, a gong, a lever, a head, a rune on the floor). */
const SHOWS_ITEM: ReadonlySet<string> = new Set(["shrine", "decor", "riddle", "gong", "lever", "head", "lore", "teleporter", "talent", "portal", "rune", "qportal", "chalice", "tube", "stairs"]);

/** The old item an action shows on its cell, or null (plain chests and shrines of a place without a theme, and every other kind of action). */
export function shownItem(a: Pick<ActionInstance, "kind" | "params">): number | null {
  const id = a.kind === "treasure" ? a.params.chest : SHOWS_ITEM.has(a.kind) ? a.params.item : undefined;
  return typeof id === "number" ? id : null;
}

/** Has this lever been pulled? An airlock lever stays pulled for good (`<airlock>@<side>`), every other one flips with each pull (its uid). */
export function leverPulled(a: Pick<ActionInstance, "uid" | "params">, opened: ReadonlySet<string>): boolean {
  return typeof a.params.airlock === "string" ? opened.has(`${a.params.airlock}@${String(a.params.side)}`) : opened.has(a.uid);
}

/** Static model keys that a map's themed objects need besides the interior view's own models. */
export function themeModelKeys(content: MapContent): string[] {
  const keys = new Set<string>();
  for (const a of content.actions) {
    const item = shownItem(a);
    if (item === null) continue;
    const key = OWN_MODELS[item]?.model ?? itemModelKey(item);
    if (key) keys.add(key);
    // a broken crystal that is mended is the intact one
    if (item === BROKEN_CRYSTAL_ITEM) {
      const whole = itemModelKey(POWER_CRYSTAL_ITEM);
      if (whole) keys.add(whole);
    }
  }
  return [...keys];
}

/**
 * The scale that stretches the wooden stairs (rising towards -z in the file, centred on the origin) over one cell and one storey: the width and the length of the cell, the height of a
 * tower's wall. Without the register's bounds (a test without assets) the file's size is taken from the measure of the file.
 */
export function stairsScale(bounds: readonly number[] | undefined): [number, number, number] {
  const b = bounds ?? [-0.488, -0.63, -0.952, 0.483, 0.625, 0.95];
  return [CELL_SIZE / (b[3]! - b[0]!), TOWER_STOREY / (b[4]! - b[1]!), CELL_SIZE / (b[5]! - b[2]!)];
}

/** The prop for a themed object, or null when the action shows nothing of the theme (then the view picks a chest or well by chance). `bearing` is degrees, 0 = north. */
export function themedProp(a: ActionInstance, x: number, z: number, bearing: number, staticInfo: Record<string, StaticModelInfo>, opened: ReadonlySet<string> = new Set(), content?: MapContent): PropInstance | null {
  let item = shownItem(a);
  if (item === null) return null;
  // the broken crystal of the engine room or of life support is the intact one once the party has mended it
  if (item === BROKEN_CRYSTAL_ITEM && opened.has(a.params.reactor === "life" ? LIFE_FLAG : ENGINE_CRYSTAL_FLAG)) item = POWER_CRYSTAL_ITEM;
  // a head of the ring is there while its lever says so; a head of the row looks the way it was turned
  // the statues of a castle stand in a corner of the keep and face the inside at an angle of 45 degrees
  if (typeof a.params.bearing === "number") bearing = a.params.bearing;
  // the runes of quest 3 appear with the last gong; the middle of the field of quest 1 stays bare
  if (a.kind === "rune") {
    if (a.params.need === "moan" || !content) return null;
    if (!runeActive(a, content, opened)) return null;
  }
  if (a.kind === "head") {
    if (a.params.mode === "ring" || a.params.mode === "moan") {
      if (!ringHeadPresent(a, opened)) return null;
    } else bearing = headFacing(a, opened) * 90;
  }
  // glTF items look the other way than OBJ ones (Ursina mirrors them): the bone pile showed its skull to the wall, 15th playtest. The hand-built maps
  // keep what they had (`itemProp` is shared); the objects here are turned to face the room, so they need the half circle
  // The banners (items 103 to 105) are the exception: the model is a flat cloth at z = -0.9 (1.35 units with its scale), which the old maps hang on the wall behind
  // the cell, emblem to the room. The half circle moved the cloth to the room side, 2.85 units from the wall and with its emblem to the wall (21st playtest, point 7).
  if (isGlbItem(item) && !OWN_MODELS[item] && !WALL_HUNG.has(item)) bearing += 180;
  bearing += FRONT_TURN[item] ?? 0;
  // a sarcophagus does not stand squared to the wall: it is turned a quarter or three eighths of a circle, one way or the other (36th playtest, point 14; the cell decides, so it stays put)
  if (SARCOPHAGI.has(item)) bearing += SARCOPHAGUS_TURNS[(a.x * 7 + a.y * 13) % SARCOPHAGUS_TURNS.length]!;
  // a pulled lever has turned half a circle, so that its handle lies on the other side (the campaign turns its levers the same way)
  if (a.kind === "lever" && leverPulled(a, opened)) bearing += 180;
  const own = OWN_MODELS[item];
  if (own && item === STAIRCASE_ITEM) {
    // the stairs fill their cell from the front edge to the back edge and rise a storey, whatever the file's size (the bounds are in the register)
    return { model: own.model, x, y: 0, z, rotY: (bearing * Math.PI) / 180, scale: 1, scaleXYZ: stairsScale(staticInfo[own.model]?.bounds) };
  }
  if (own && item in DECO_MODELS) {
    // the files are centred on their middle: the relief is pushed back so that its back plane lies in the wall (the moose's carving has its origin in front of it)
    const back = (staticInfo[own.model]?.bounds?.[2] ?? -0.2) * own.scale;
    // 53rd playtest, point 4: the plane of the relief's backing plate lies `DECO_FLUSH` in front of the wall, whatever the model's depth (a relief whose plate is thick stood far out). In "Full 3D"
    // the view moves the relief out by the depth of the wall pieces afterwards (`buildObjects`). A model without a measured plate keeps the old rule.
    const plate = DECO_PLATE[own.model];
    // 54th playtest, point 3 (Undercroft of Siletha 31/60): the figure still looked too far out of the wall, so the relief sinks by a third of its depth (plate to the front-most point) into it
    const front = (staticInfo[own.model]?.bounds?.[5] ?? 0.2) * own.scale;
    const sink = (front - (plate !== undefined ? plate * own.scale : back)) * DECO_SINK_SHARE;
    const push = (plate !== undefined ? WALL_AT - DECO_FLUSH + plate * own.scale : WALL_AT + DECO_BURY + back) + Math.max(0, sink);
    const rotY = (bearing * Math.PI) / 180;
    return { model: own.model, x: x - Math.sin(rotY) * push, y: own.lift ?? 0, z: z - Math.cos(rotY) * push, rotY, scale: own.scale };
  }
  if (own) return { model: own.model, x, y: own.lift ?? 0, z, rotY: (bearing * Math.PI) / 180, scale: own.scale, ...(own.scale3 ? { scaleXYZ: own.scale3 } : {}) };
  return itemProp(item, bearing, x, z, staticInfo);
}
