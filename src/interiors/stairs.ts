import type { InteriorMap } from "./types";

/**
 * The jumps of a tower's stairs as pairs of cell indices (from, to): the staircase to the cell before the Fort door above it, the door to the cell before the staircase. Every search for
 * what the party can reach (the topology, the rules, the validation) follows them like a step along the floor. Empty for any map that is not a tower.
 */
export function stairLinks(map: Pick<InteriorMap, "width" | "dungeon">): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of map.dungeon?.tower?.stairs ?? []) {
    out.set(s.up.y * map.width + s.up.x, s.land.y * map.width + s.land.x);
    out.set(s.down.y * map.width + s.down.x, s.front.y * map.width + s.front.x);
  }
  return out;
}
