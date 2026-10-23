import { GROUNDED_ITEMS, tunedItemModels } from "../data/item-tuning";
import type { GateDirection, TrapKind } from "../campaign/types";
import type { StaticModelInfo } from "./assets";
import type { PropInstance } from "./terrainMesher";

export interface ItemModel {
  name: string;
  source: string | null;
  scale: number;
  /** Size per axis, as the old game set it. */
  scale3: [number, number, number];
  /** Pitch and roll in degrees, and what the old game adds to the rotation of the cell. */
  rotX: number;
  rotZ: number;
  yaw: number;
  y: number;
  persona: boolean;
}

const RAD = Math.PI / 180;

export const ITEM_MODELS = tunedItemModels<ItemModel>();

/** Static model key of a map item, or null when the old game drew it as a plain cube. */
export function itemModelKey(item: number): string | null {
  return ITEM_MODELS[String(item)]?.source ? `ci_${item}` : null;
}

/**
 * How a metal gate leaves its cell (action_handler.py `move_vertically`): a copy of the model slides to three times its height,
 * below the floor for the gate that drops and into the ceiling for the one that rises, at 0.8 seconds per started unit of travel.
 * `from` and `to` are heights of the model's origin.
 */
export function gateTravel(item: number, direction: GateDirection): { from: number; to: number; seconds: number } | null {
  const y = ITEM_MODELS[String(item)]?.y;
  if (y === undefined) return null;
  const to = direction === "down" ? y * -3 : y * 3;
  return { from: y, to, seconds: (Math.floor(Math.abs(to - y)) + 1) * 0.8 };
}

/** The map item that hangs in a guillotine trap. The old game animated a second item (9009) of the same model. */
export const GUILLOTINE_ITEM = 87;

/** The spear trap's model (the old item 9024, "Spear Trap.obj") and its size in the old game. */
export const SPEAR_MODEL = "obj_spear_trap";
const SPEAR_SCALE: [number, number, number] = [1.2, 0.8, 1];

/**
 * How the moving part of a trap travels (action_handler.py, actions 24 and 17). Heights are those of the model's origin:
 * it rests at `rest`, snaps to `struck` within `strike` seconds and is back at `rest` `back` seconds later. The old game
 * took 0.1 (guillotine) or 0.15 (spears) seconds per started unit of travel for the strike and 2.5 or 3.7 for the way back.
 */
export const TRAP_MOTION: Record<TrapKind, { rest: number; struck: number; strike: number; back: number }> = {
  // item 9009 sits 2.5 above the floor, the blade drops from 2.8 above that to 0.2 above it
  guillotine: { rest: 5.3, struck: 2.7, strike: 0.3, back: 7.5 },
  // item 9024 sits 0.9 above the floor, the spears come up from 1.6 below that to 0.2 below it, under the floor again at rest
  spear: { rest: -0.7, struck: 0.7, strike: 0.3, back: 7.4 },
};

/** Seconds a trap needs from the strike to its rest. */
export const trapSeconds = (kind: TrapKind): number => TRAP_MOTION[kind].strike + TRAP_MOTION[kind].back;

/** The moving part of a trap `t` seconds after it went off, or null when the model is missing. */
export function trapMover(kind: TrapKind, t: number, rotationDeg: number, px: number, pz: number, staticInfo: Record<string, StaticModelInfo>): PropInstance | null {
  const m = TRAP_MOTION[kind];
  const range = m.struck - m.rest;
  const origin = t < m.strike ? m.rest + (range * t) / m.strike : m.struck - (range * (t - m.strike)) / m.back;
  return kind === "guillotine"
    ? itemProp(GUILLOTINE_ITEM, rotationDeg, px, pz, staticInfo, origin)
    : { model: SPEAR_MODEL, x: px, y: origin, z: pz, rotY: rotationDeg * RAD, scale: SPEAR_SCALE[0], scaleXYZ: SPEAR_SCALE, atOrigin: true };
}

/**
 * A map item of the old game as a prop, or null when it has no model. `originY` replaces the height the old game gave the item
 * (the blade of a trap and the gate that opens move, everything else stays where its table row put it).
 */
/** Whether the old game's model of this item is a glTF file: Ursina mirrors those, so they stand turned by half a circle against the `ir` of their cell (the cave entrance, the block models). */
export function isGlbItem(item: number): boolean {
  return ITEM_MODELS[String(item)]?.source?.toLowerCase().endsWith(".glb") ?? false;
}

export function itemProp(item: number, rotationDeg: number, px: number, pz: number, staticInfo: Record<string, StaticModelInfo>, originY?: number): PropInstance | null {
  const key = itemModelKey(item);
  const info = ITEM_MODELS[String(item)];
  if (!key || !info) return null;
  const bounds = staticInfo[key]?.bounds;
  const [, sy] = info.scale3;
  // things that stand on the ground rest their lowest point on it, whatever size the model has now (see `GROUNDED_ITEMS`)
  const bottom = bounds ? bounds[1] * sy : 0;
  const grounded = GROUNDED_ITEMS.has(item) && info.rotX === 0 && info.rotZ === 0;
  const y = originY ?? (grounded ? -bottom : info.y);
  // the old game put the model's origin at `y`; the prop renderer rests the model's lowest point on `y`
  const lift = y + bottom;
  const inst: PropInstance = { model: key, x: px, y: lift, z: pz, rotY: ((rotationDeg + info.yaw) % 360) * RAD, scale: info.scale, scaleXYZ: info.scale3 };
  if (info.rotX !== 0 || info.rotZ !== 0) {
    // tipped over (a trap door lies flat, a metal gate hangs upside down): the old game placed the origin at `y`, and
    // a rolled model's lowest point is no longer the bottom of the model. Ursina negates yaw and pitch but not roll
    // (`Entity.rotation_directions = (-1, -1, 1)`), so its roll turns the other way round than Babylon's: the trap
    // door's 270 has to become -270, otherwise its handle side ends up facing the floor
    Object.assign(inst, { y, rotX: info.rotX * RAD, rotZ: -info.rotZ * RAD, atOrigin: true });
  }
  return inst;
}
