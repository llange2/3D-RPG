import type { Facing } from "../interiors/types";

/**
 * The brittle walls (blocks 5 and 17) are floor cells with a thin wall piece on one border, the "slab". The party can step into the
 * cell from the other side and then stands in front of the slab, as in the old game (where the question "The wall in front of you
 * looks brittle" came up inside the cell); it can never pass the slab, in either direction.
 */

const COMPASS: Facing[] = ["N", "E", "S", "W"];
const STEPS: Record<string, Facing> = { "0,-1": "N", "1,0": "E", "0,1": "S", "-1,0": "W" };

export const oppositeOf = (f: Facing): Facing => COMPASS[(COMPASS.indexOf(f) + 2) % 4]!;

/**
 * The border the slab stands on. The models have it on their west side; the cell's rotation (degrees, clockwise seen from above)
 * turns it, once the half turn of the glTF import is taken into account (see `GLTF_YAW` in blocks.ts): 0 west, 90 north, 180 east, 270 south.
 * Compass names mean the same in the editor's coordinates and in the grid (only the y axis runs the other way).
 */
export function slabSide(rotation = 0): Facing {
  return COMPASS[(((Math.round(rotation / 90) + 3) % 4) + 4) % 4]!;
}

/** The compass direction of a step between two neighbouring cells, null for anything else. */
export function stepFacing(dx: number, dy: number): Facing | null {
  return STEPS[`${dx},${dy}`] ?? null;
}

/** Slab sides by cell index (`y * width + x`). */
export type SlabMap = ReadonlyMap<number, Facing>;

/** Does a slab stand on the border between two neighbouring cells (on either of their sides)? */
export function slabBetween(slabs: SlabMap | undefined, width: number, ax: number, ay: number, bx: number, by: number): boolean {
  if (!slabs || slabs.size === 0) return false;
  const toB = stepFacing(bx - ax, by - ay);
  if (!toB) return false;
  return slabs.get(ay * width + ax) === toB || slabs.get(by * width + bx) === oppositeOf(toB);
}

/** Does a straight move of one or two cells (a step or a jump) cross a slab on its way? */
export function crossesSlab(slabs: SlabMap | undefined, width: number, ax: number, ay: number, bx: number, by: number): boolean {
  if (!slabs || slabs.size === 0) return false;
  const sx = Math.sign(bx - ax);
  const sy = Math.sign(by - ay);
  let x = ax;
  let y = ay;
  // a jump passes over the cell in between: both of its borders count
  for (let guard = 0; guard < 4 && (x !== bx || y !== by); guard++) {
    if (slabBetween(slabs, width, x, y, x + sx, y + sy)) return true;
    x += sx;
    y += sy;
  }
  return false;
}
