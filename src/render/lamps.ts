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

/** Lava, acid and magic fire glow in their own colour like the crystals, a little weaker (31st playtest, point 1); the puddles lie on the floor, the flames stand higher. */
export const LAVA_LAMP: LampKind = { y: 0.9, color: [1, 0.42, 0.12], range: 6.5, intensity: 3.2 };
export const ACID_LAMP: LampKind = { y: 0.9, color: [0.45, 1, 0.15], range: 6.5, intensity: 3.2 };
export const MAGIC_FIRE_LAMP: LampKind = { y: 1.2, color: [0.68, 0.38, 1], range: 6.5, intensity: 3.2 };

/** Crystals (117), the power source crystal (67), the lava puddle (120), the acid puddle (92) and the magic flames (121). */
export const CRYSTAL_LAMPS: Readonly<Record<number, LampKind>> = {
  117: CRYSTAL_LAMP,
  67: CRYSTAL_LAMP,
  120: LAVA_LAMP,
  92: ACID_LAMP,
  121: MAGIC_FIRE_LAMP,
};

/** The lamp a cell of the old maps gives, or null. */
export function lampSource(kind: LampKind, x: number, z: number): LampSource {
  return { x, z, y: kind.y, color: kind.color, ...(kind.range !== undefined ? { range: kind.range } : {}), ...(kind.intensity !== undefined ? { intensity: kind.intensity } : {}) };
}

/** The glowing objects of a generated place (crystals of shrines, riddles and decoration, the objects of the elemental traps): each lights its cell. */
export function crystalLamps(content: MapContent): LampSource[] {
  const out: LampSource[] = [];
  for (const a of content.actions) {
    const element = elementOf(a);
    const item = element !== null ? TRAP_OBJECT[element] : shownItem(a);
    const kind = item === null ? undefined : CRYSTAL_LAMPS[item];
    if (kind) out.push(lampSource(kind, cellCenterX(a.x), cellCenterZ(a.y)));
  }
  return out;
}
