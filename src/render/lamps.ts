import type { MapContent } from "../actions/types";
import { cellCenterX, cellCenterZ } from "./interiorMesher";
import { shownItem } from "./interiorProps";
import { TRAP_OBJECT, elementOf } from "./interiorTraps";

/** A kind of map object that gives light. `y` is the height of the light; `range` and `intensity` replace the usual ones for a lamp that shines further or stronger. */
export interface LampKind {
  y: number;
  color: [number, number, number];
  range?: number;
  intensity?: number;
}

/** A lamp on a map: where it hangs and what it gives (`Game.updateLamps` hands the lights of the pool to the nearest ones). */
export interface LampSource extends LampKind {
  x: number;
  z: number;
}

/** The crystals shine in their own colour, strongly, one to two cells around (30th playtest, point 5); the texture of both is a teal. */
export const CRYSTAL_LAMP: LampKind = { y: 1.4, color: [0.15, 0.85, 1], range: 7.5, intensity: 4.5 };

/** Crystals (117) and the power source crystal (67). */
export const CRYSTAL_LAMPS: Readonly<Record<number, LampKind>> = { 117: CRYSTAL_LAMP, 67: CRYSTAL_LAMP };

/** The lamp a cell of the old maps gives, or null. */
export function lampSource(kind: LampKind, x: number, z: number): LampSource {
  return { x, z, y: kind.y, color: kind.color, ...(kind.range !== undefined ? { range: kind.range } : {}), ...(kind.intensity !== undefined ? { intensity: kind.intensity } : {}) };
}

/** The crystals of a generated place (shrines, riddles, decoration and the crystals that mark an ice trap): each lights its cell. */
export function crystalLamps(content: MapContent): LampSource[] {
  const out: LampSource[] = [];
  for (const a of content.actions) {
    const item = elementOf(a) === "ice" ? TRAP_OBJECT.ice : shownItem(a);
    const kind = item === null ? undefined : CRYSTAL_LAMPS[item];
    if (kind) out.push(lampSource(kind, cellCenterX(a.x), cellCenterZ(a.y)));
  }
  return out;
}
