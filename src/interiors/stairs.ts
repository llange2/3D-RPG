import type { InteriorMap, TowerLayout } from "./types";

/** The floor (0 is the ground floor) of a tower that column `x` belongs to; the rock between two floors belongs half to either. 0 for a map that is no tower. */
export function towerFloorAt(tower: TowerLayout | undefined, x: number): number {
  if (!tower) return 0;
  let k = 0;
  tower.floors.forEach((f, i) => {
    const prev = tower.floors[i - 1];
    if (prev && x >= (prev.x + prev.size + f.x) / 2) k = i;
  });
  return k;
}

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
