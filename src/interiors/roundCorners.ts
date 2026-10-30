import { CELL, type InteriorMap } from "./types";

/**
 * The rounded corners of the spaceship (quest document 1.2: "Es gibt keine 90° Ecken, sondern nur Rundungen"). Two models of the old game do it, both
 * one cell big and with a quarter circle of one cell's radius:
 *   - `inner` (item 84, "Round inner corner.obj"): a floor cell in the corner of a room or at the bend of a corridor, filled in beyond the arc;
 *   - `outer` (item 85, "Round outer corner.obj"): a wall cell at the corner of a wall block, with the corner that points into the room cut off.
 * A corner is only rounded where the walls on both sides run on straight, so the arc meets them without a step; the other corners stay square.
 * Geometry only (no Babylon): the mesher leaves out the wall faces the models cover, the view places the models.
 */

export type CornerKind = "inner" | "outer";
/** The corner of the cell that is filled in (inner) or cut off (outer). */
export type CornerSide = "NE" | "SE" | "SW" | "NW";

export interface RoundCorner {
  kind: CornerKind;
  x: number;
  y: number;
  corner: CornerSide;
  /** Turn of the model about the vertical axis in degrees, as the models face by default (see `cornerYaw`). */
  yaw: number;
}

/** The models of the two kinds (map item numbers of the old game). */
export const ROUND_ITEM: Readonly<Record<CornerKind, number>> = { inner: 84, outer: 85 };

/** Grid steps: y grows to the south. */
const STEP = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] } as const;
type Side = keyof typeof STEP;
const OPPOSITE: Record<Side, Side> = { N: "S", E: "W", S: "N", W: "E" };
/** The two sides that meet in a corner. */
const SIDES: Record<CornerSide, [Side, Side]> = { NE: ["N", "E"], SE: ["S", "E"], SW: ["S", "W"], NW: ["N", "W"] };

/**
 * The turn that brings a model to a corner. Both models are halves of the same circle (its centre in the north-east corner of the cell, radius one
 * cell) and, as Babylon mirrors a glTF model across the x axis, both have the arc in the south-west corner by default: the inner model fills the
 * crescent there, the outer one has it cut off. A quarter turn about the vertical axis (a compass bearing, clockwise) moves a corner one step round.
 * The first version turned the inner model's arc to the south-east and the outer one's to the north-west (30th playtest, point 7: every round corner
 * was a quarter turn off, the inner ones one way and the outer ones the other).
 */
export function cornerYaw(corner: CornerSide): number {
  return { SW: 0, NW: 90, NE: 180, SE: 270 }[corner];
}

/** Does the cell belong to a cyber map whose walls are rounded? */
export function hasRoundWalls(map: InteriorMap): boolean {
  return map.theme.id === "cyber" && map.kind === "dungeon";
}

export function roundCorners(map: InteriorMap): RoundCorner[] {
  if (!hasRoundWalls(map)) return [];
  const w = map.width;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= map.height ? CELL.SOLID : map.cells[y * w + x]!);
  const out: RoundCorner[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < w; x++) {
      const here = at(x, y);
      if (here !== CELL.FLOOR && here !== CELL.SOLID) continue;
      const inner = here === CELL.FLOOR;
      const found: CornerSide[] = [];
      for (const corner of Object.keys(SIDES) as CornerSide[]) {
        const [a, b] = SIDES[corner];
        const cell = (s: Side): number => at(x + STEP[s][0], y + STEP[s][1]);
        // the cell beside `x + dx`, `y + dy` in two steps
        const diag = (s: Side, t: Side): number => at(x + STEP[s][0] + STEP[t][0], y + STEP[s][1] + STEP[t][1]);
        const [oa, ob] = [OPPOSITE[a], OPPOSITE[b]];
        // a floor cell with a wall in the corner and the walls on both sides running on; a wall cell whose corner reaches into the room, with the
        // floor on both sides running on
        const near = inner ? CELL.SOLID : CELL.FLOOR;
        const far = inner ? CELL.FLOOR : CELL.SOLID;
        if (cell(a) === near && cell(b) === near && diag(a, b) === near && cell(oa) === far && cell(ob) === far && diag(a, ob) === near && diag(b, oa) === near) found.push(corner);
      }
      // two corners in one cell (a pillar, a diagonal) stay square
      if (found.length === 1) out.push({ kind: inner ? "inner" : "outer", x, y, corner: found[0]!, yaw: cornerYaw(found[0]!) });
    }
  }
  return out;
}

/** The wall faces of floor cells that the models cover, as `x,y,N|E|S|W` (the cell the face belongs to and the side it looks away from). */
export function coveredFaces(corners: readonly RoundCorner[]): Set<string> {
  const covered = new Set<string>();
  for (const c of corners) {
    const [a, b] = SIDES[c.corner];
    if (c.kind === "inner") {
      covered.add(`${c.x},${c.y},${a}`);
      covered.add(`${c.x},${c.y},${b}`);
    } else {
      // the faces of the two floor cells beside the wall cell, which look at it
      covered.add(`${c.x + STEP[a][0]},${c.y + STEP[a][1]},${OPPOSITE[a]}`);
      covered.add(`${c.x + STEP[b][0]},${c.y + STEP[b][1]},${OPPOSITE[b]}`);
    }
  }
  return covered;
}
