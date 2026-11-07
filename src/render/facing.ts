import type { ActionInstance } from "../actions/types";
import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";

/**
 * The yaw of an object in an interior (no Babylon here, so that a test can ask it for every place of a world): back to a wall, front to the open room. Split out of `InteriorView`
 * for the 47th playtest, point 6 (the lion on the wall of the Catacombs of Nora hung across the room, with its side to the wall).
 */

/** The cells that look like a wall but are floor in the map (a closed door, a wall that can be broken), and the cells an object stands on. */
export interface FacingSets {
  wallLike: ReadonlySet<number>;
  objectCells: ReadonlySet<number>;
}

export function facingSets(map: InteriorMap, actions: readonly ActionInstance[], brokenWalls: ReadonlySet<string>): FacingSets {
  const wallLike = new Set(actions.filter((a) => a.kind === "door" || (a.kind === "breakable_wall" && !brokenWalls.has(a.uid))).map((a) => a.y * map.width + a.x));
  const objectCells = new Set(actions.filter((a) => a.kind !== "service" && a.kind !== "trap" && a.kind !== "transfer" && a.kind !== "ambush" && !wallLike.has(a.y * map.width + a.x)).map((a) => a.y * map.width + a.x));
  return { wallLike, objectCells };
}

const BEARINGS: readonly (readonly [Facing, Facing, number])[] = [["N", "S", 0], ["E", "W", 90], ["S", "N", 180], ["W", "E", 270]];

/**
 * Yaw that puts an object's back to a wall and its front to the open room (the old maps turn their chests the same way). The models face north at yaw 0 and the yaw is the compass
 * bearing, as for the campaign's items. Where two sides qualify (a corner) or none does (a pillar in the open), `pick` decides, so the choice stays stable. `wallHung`: a banner or a
 * relief, which hangs on a real wall, whichever way the corridor runs.
 */
export function faceOpenYaw(map: InteriorMap, sets: FacingSets, a: ActionInstance, pick: number, wallHung: boolean): number {
  // a closed door or a wall that can be broken is a floor cell in the map but looks like a wall: an object does not face it
  const floorCell = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.cells[y * map.width + x] === CELL.FLOOR && !sets.wallLike.has(y * map.width + x);
  // the front looks at an empty cell if there is one: a lectern or chest facing a statue or a person is worse than one facing a bare street
  const sides = (empty: boolean) => {
    const openAt = (x: number, y: number) => floorCell(x, y) && !(empty && sets.objectCells.has(y * map.width + x));
    const floorAt = (f: Facing) => openAt(a.x + FACING_DELTA[f].dx, a.y + FACING_DELTA[f].dy);
    return { openAt, floorAt };
  };
  const emptySides = sides(true);
  const { openAt, floorAt } = BEARINGS.some(([front]) => emptySides.floorAt(front)) ? emptySides : sides(false);
  /** The cell behind is a real wall: not floor, and not a floor cell with an object on it (`floorAt` counts that as "not open", and a relief hung there floats in the room). */
  const wallAt = (f: Facing) => !floorCell(a.x + FACING_DELTA[f].dx, a.y + FACING_DELTA[f].dy);
  // a banner hangs on a wall with its back to it, whichever way the corridor runs: facing along a corridor it stood across the way (31st playtest, point 2). The back is a real wall: with
  // a chest or a statue beside the relief the old test (`!floorAt(back)`) took that object for the wall, and the relief hung with its side to the wall (47th playtest, point 6)
  if (wallHung) {
    const hung = BEARINGS.filter(([front, back]) => floorAt(front) && wallAt(back));
    const walled = hung.length > 0 ? hung : BEARINGS.filter(([, back]) => wallAt(back));
    const options = walled.length > 0 ? walled : BEARINGS;
    return (options[pick % options.length]![2] * Math.PI) / 180;
  }
  /** Open cells in a row from this one in a direction (up to 8). */
  const run = (f: Facing) => {
    let n = 0;
    while (n < 8 && openAt(a.x + FACING_DELTA[f].dx * (n + 1), a.y + FACING_DELTA[f].dy * (n + 1))) n++;
    return n;
  };
  let choices = BEARINGS.filter(([front, back]) => floorAt(front) && !floorAt(back));
  if (choices.length === 0) choices = BEARINGS.filter(([front]) => floorAt(front));
  if (choices.length === 0) choices = [...BEARINGS];
  // the back goes to a real wall, not to a neighbouring statue or chest: the chest of the Vault of Corthea (85/31) sat with its side to the wall (36th playtest, point 21)
  const wallBehind = choices.filter(([, back]) => wallAt(back));
  if (wallBehind.length > 0) choices = wallBehind;
  if (choices.length > 1) {
    // a corner, a corridor: it looks along the longer way and turns its back to the nearer wall
    const score = ([front, back]: readonly [Facing, Facing, number]) => run(front) - run(back);
    const best = Math.max(...choices.map(score));
    choices = choices.filter((c) => score(c) === best);
  }
  return (choices[pick % choices.length]![2] * Math.PI) / 180;
}
