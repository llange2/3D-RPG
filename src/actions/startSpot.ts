import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import { blocksCell } from "./registry";
import type { MapContent } from "./types";

const SIDES: Facing[] = ["N", "E", "S", "W"];

/**
 * Where the party appears when a portal brings it to a town: on a free street cell next to the portal, looking at it. Falls back to the way in
 * when the town has no portal or it has no free neighbour.
 */
export function portalStart(map: InteriorMap, content: MapContent): { x: number; y: number; facing: Facing } {
  const portal = content.actions.find((a) => a.kind === "portal");
  if (!portal) return map.spawn;
  const taken = new Set(content.actions.filter((a) => blocksCell(a)).map((a) => a.y * map.width + a.x));
  for (const f of SIDES) {
    const x = portal.x + FACING_DELTA[f].dx;
    const y = portal.y + FACING_DELTA[f].dy;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height || map.cells[y * map.width + x] !== CELL.FLOOR || taken.has(y * map.width + x)) continue;
    return { x, y, facing: ({ N: "S", S: "N", E: "W", W: "E" } as const)[f] };
  }
  return map.spawn;
}

/**
 * Where a new game begins: on the street in front of the inn of the start town, with the back to its door. The inn is a street cell with
 * its door in the wall behind it (stepping onto the cell enters it), so the party stands one cell out and looks away from it.
 * The cell straight out from the door is the one; if something stands there, any other free neighbour of the inn will do.
 * Falls back to the way in when the town has no inn.
 */
export function innStart(map: InteriorMap, content: MapContent): { x: number; y: number; facing: Facing } {
  const inn = content.actions.find((a) => a.kind === "service" && a.params.service === "inn");
  if (!inn) return map.spawn;
  const lot = map.lots.find((l) => l.door.x === inn.x && l.door.y === inn.y);
  const taken = new Set(content.actions.filter((a) => blocksCell(a)).map((a) => a.y * map.width + a.x));
  const free = (f: Facing): boolean => {
    const x = inn.x + FACING_DELTA[f].dx;
    const y = inn.y + FACING_DELTA[f].dy;
    return x >= 0 && y >= 0 && x < map.width && y < map.height && map.cells[y * map.width + x] === CELL.FLOOR && !taken.has(y * map.width + x);
  };
  const order = lot ? [lot.door.facing, ...SIDES.filter((f) => f !== lot.door.facing)] : SIDES;
  const out = order.find(free);
  if (!out) return map.spawn;
  return { x: inn.x + FACING_DELTA[out].dx, y: inn.y + FACING_DELTA[out].dy, facing: out };
}
