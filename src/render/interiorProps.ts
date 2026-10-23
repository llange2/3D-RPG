import { headFacing, ringHeadPresent } from "../actions/quests";
import type { ActionInstance, MapContent } from "../actions/types";
import type { StaticModelInfo } from "./assets";
import { isGlbItem, itemModelKey, itemProp } from "./itemProps";
import type { PropInstance } from "./terrainMesher";

/**
 * The objects of a themed cave or dungeon are old map items (docs/DUNGEON_THEMES.md): a chest is item 1, 74, 72 or 96, a shrine a
 * crystal, altar or well, and the style of the place adds barrels, bones, banners and the like. The chests, altars and wells have
 * models of their own in the interior view (`obj_*`); every other item is drawn from its old model (`ci_<id>`) in the pose of the
 * item table, the way the campaign draws it.
 */

/** Old item id -> the interior view's own model and its scale, for the objects it has had since before the themes. */
export const OWN_MODELS: Record<number, { model: string; scale: number }> = {
  1: { model: "obj_chest", scale: 0.85 },
  74: { model: "obj_chest_iron", scale: 0.85 },
  72: { model: "obj_chest_noble", scale: 0.85 },
  96: { model: "obj_chest_sapphire", scale: 0.85 },
  35: { model: "obj_altar", scale: 1.5 },
  37: { model: "obj_well_red", scale: 1.5 },
  88: { model: "obj_well_yellow", scale: 1.5 },
};

/** Old items that hang on a wall: the model's cloth lies a cell's wall distance behind its origin, so it is turned like the old game's, not like the standing GLB objects. */
export const WALL_HUNG: ReadonlySet<number> = new Set([103, 104, 105]);

/** Old items whose model has its working side (the lectern's sloping top) where the others have their back: turned by this many degrees on top of the rule above. */
const FRONT_TURN: Readonly<Record<number, number>> = { 119: 180 };

/** The kinds of action whose `item` param is an old item they stand on their cell as (a statue, a gong, a lever, a head, a rune on the floor). */
const SHOWS_ITEM: ReadonlySet<string> = new Set(["shrine", "decor", "riddle", "gong", "lever", "head", "lore", "teleporter", "talent", "portal"]);

/** The old item an action shows on its cell, or null (plain chests and shrines of a place without a theme, and every other kind of action). */
export function shownItem(a: Pick<ActionInstance, "kind" | "params">): number | null {
  const id = a.kind === "treasure" ? a.params.chest : SHOWS_ITEM.has(a.kind) ? a.params.item : undefined;
  return typeof id === "number" ? id : null;
}

/** Static model keys that a map's themed objects need besides the interior view's own models. */
export function themeModelKeys(content: MapContent): string[] {
  const keys = new Set<string>();
  for (const a of content.actions) {
    const item = shownItem(a);
    if (item === null) continue;
    const key = OWN_MODELS[item]?.model ?? itemModelKey(item);
    if (key) keys.add(key);
  }
  return [...keys];
}

/** The prop for a themed object, or null when the action shows nothing of the theme (then the view picks a chest or well by chance). `bearing` is degrees, 0 = north. */
export function themedProp(a: ActionInstance, x: number, z: number, bearing: number, staticInfo: Record<string, StaticModelInfo>, opened: ReadonlySet<string> = new Set()): PropInstance | null {
  const item = shownItem(a);
  if (item === null) return null;
  // a head of the ring is there while its lever says so; a head of the row looks the way it was turned
  if (a.kind === "head") {
    if (a.params.mode === "ring") {
      if (!ringHeadPresent(a, opened)) return null;
    } else bearing = headFacing(a, opened) * 90;
  }
  // glTF items look the other way than OBJ ones (Ursina mirrors them): the bone pile showed its skull to the wall, 15th playtest. The hand-built maps
  // keep what they had (`itemProp` is shared); the objects here are turned to face the room, so they need the half circle
  // The banners (items 103 to 105) are the exception: the model is a flat cloth at z = -0.9 (1.35 units with its scale), which the old maps hang on the wall behind
  // the cell, emblem to the room. The half circle moved the cloth to the room side, 2.85 units from the wall and with its emblem to the wall (21st playtest, point 7).
  if (isGlbItem(item) && !OWN_MODELS[item] && !WALL_HUNG.has(item)) bearing += 180;
  bearing += FRONT_TURN[item] ?? 0;
  const own = OWN_MODELS[item];
  if (own) return { model: own.model, x, y: 0, z, rotY: (bearing * Math.PI) / 180, scale: own.scale };
  return itemProp(item, bearing, x, z, staticInfo);
}
