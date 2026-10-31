import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import { blocksCell } from "./registry";
import type { MapContent } from "./types";

const SIDES: Facing[] = ["N", "E", "S", "W"];
const OPPOSITE: Record<Facing, Facing> = { N: "S", E: "W", S: "N", W: "E" };

type Spot = { x: number; y: number; facing: Facing };

/** How many free street cells lie in a straight line from (x, y) in direction `f` (at most `limit`): 0 means the party would look straight at a wall or an object. */
function openRun(map: InteriorMap, taken: Set<number>, x: number, y: number, f: Facing, limit = 4): number {
  let run = 0;
  for (let i = 1; i <= limit; i++) {
    const cx = x + FACING_DELTA[f].dx * i;
    const cy = y + FACING_DELTA[f].dy * i;
    if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height || map.cells[cy * map.width + cx] !== CELL.FLOOR || taken.has(cy * map.width + cx)) break;
    run++;
  }
  return run;
}

/** The street ahead that makes a view: with less the party would stand with its nose against a wall. */
const GOOD_VIEW = 2;

/**
 * Where the party stands next to `origin` (the inn, a portal) and which way it looks (37th playtest, point 1: never straight at a wall). `neighbours` are the free cells
 * beside the origin, each with the side it lies on. A cell is taken in order: the first one where the party can look away from the origin, with it behind the party, along
 * at least `GOOD_VIEW` free cells. If there is none (the origin stands at the end of a street that runs past it, so looking away is looking at a house), the cell and the
 * direction with the longest free street ahead, along the street; the origin is then beside the party. The way back to the origin is never a view.
 */
function bestSpot(map: InteriorMap, taken: Set<number>, neighbours: Spot[]): Spot | undefined {
  for (const s of neighbours) if (openRun(map, taken, s.x, s.y, s.facing) >= GOOD_VIEW) return s;
  let best: Spot | undefined;
  let bestRun = -1;
  for (const s of neighbours) {
    for (const f of SIDES) {
      if (f === OPPOSITE[s.facing]) continue; // looking at the origin
      const run = openRun(map, taken, s.x, s.y, f);
      // on a tie the direction away from the origin wins, then the earlier cell
      if (run > bestRun || (run === bestRun && f === s.facing && best?.facing !== s.facing)) {
        best = { x: s.x, y: s.y, facing: f };
        bestRun = run;
      }
    }
  }
  return best;
}

/**
 * Where the party appears when a portal brings it to a town: on a free street cell next to the portal, looking away from it, the portal behind the party
 * (and, of the free neighbours, the one with a street ahead; where that is impossible the party looks along the street). Falls back to the way in
 * when the town has no portal or it has no free neighbour.
 */
export function portalStart(map: InteriorMap, content: MapContent): Spot {
  const portal = content.actions.find((a) => a.kind === "portal");
  if (!portal) return map.spawn;
  const taken = new Set(content.actions.filter((a) => blocksCell(a)).map((a) => a.y * map.width + a.x));
  const spots: Spot[] = [];
  for (const f of SIDES) {
    const x = portal.x + FACING_DELTA[f].dx;
    const y = portal.y + FACING_DELTA[f].dy;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height || map.cells[y * map.width + x] !== CELL.FLOOR || taken.has(y * map.width + x)) continue;
    // looking away from the portal: it stands behind the party (36th playtest, point 17)
    spots.push({ x, y, facing: f });
  }
  return bestSpot(map, taken, spots) ?? map.spawn;
}

/**
 * Where a new game begins: on the street in front of the inn of the start town, with the back to its door. The inn is a street cell with
 * its door in the wall behind it (stepping onto the cell enters it), so the party stands one cell out and looks away from it.
 * The cell straight out from the door is preferred, but only if the street goes on ahead of the party: with a wall right in front of it the party
 * takes another neighbour of the inn or looks along the street instead (37th playtest, point 1). Falls back to the way in when the town has no inn.
 */
export function innStart(map: InteriorMap, content: MapContent): Spot {
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
  const spots = order.filter(free).map((f) => ({ x: inn.x + FACING_DELTA[f].dx, y: inn.y + FACING_DELTA[f].dy, facing: f }));
  return bestSpot(map, taken, spots) ?? map.spawn;
}
