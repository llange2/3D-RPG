import { wrapDist2 } from "./islands";
import type { World } from "./world";

/**
 * Within this many tiles of the first town, Starthaven, and of the spot in front of it where a new game begins, no monsters appear (wild groups and the
 * monsters of huts alike).
 */
export const SAFE_RADIUS = 3;

const homes = new WeakMap<World, { x: number; y: number }[]>();

/** The two spots the safe zone lies round: the first town and where the party begins. */
export function safeSpots(world: World): { x: number; y: number }[] {
  let spots = homes.get(world);
  if (!spots) {
    const town = world.anchorOf(0, 0);
    const begin = world.startPosition();
    homes.set(world, (spots = [{ x: town.x, y: town.y }, { x: begin.x, y: begin.y }]));
  }
  return spots;
}

/**
 * A group above level 1 keeps this far from the safe spots (`SAFE_RADIUS` plus the monsters' action radius of 7 and a margin): on a small world another island of level 4
 * can lie a few tiles from Starthaven, and its Paladins would shoot at the party across the water the moment it leaves the town (37th playtest, point 2).
 */
export const STRONG_KEEP_OFF = SAFE_RADIUS + 9;

/** Is the tile too near the town and the start for a monster stronger than level 1? */
export function inStrongKeepOff(world: World, x: number, y: number): boolean {
  return safeSpots(world).some((p) => wrapDist2(x, y, p.x, p.y, world.width, world.height) <= STRONG_KEEP_OFF * STRONG_KEEP_OFF);
}

/** Is the tile inside the safe zone? */
export function inSafeZone(world: World, x: number, y: number): boolean {
  return safeSpots(world).some((p) => wrapDist2(x, y, p.x, p.y, world.width, world.height) <= SAFE_RADIUS * SAFE_RADIUS);
}
