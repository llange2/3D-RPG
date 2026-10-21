/**
 * The user's rule for objects (21st playtest): an object never stands in a passage one cell wide, and in a wider one it stands so that the party can walk
 * round it, whether the object blocks its cell (a chest, a statue) or can be walked over (a vase, bones). Pure grid arithmetic, no map type.
 */

/** The eight cells round one, clockwise from the north: the even entries are the four edge neighbours, the odd ones the corners between them. */
const RING: readonly (readonly [number, number])[] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

/**
 * Would an object on this cell cut the ring of the eight cells round it in two pieces that both have an edge neighbour to walk on? Then the cell is part
 * of a passage (a street of one cell, a bend, a gap between two objects) that the object would shut. In a dead end, at a wall or in a wide place the open
 * cells stay in one piece, which is where objects may stand. `open` says whether the party can walk on a cell: floor that no object stands on.
 */
export function splitsRing(open: (x: number, y: number) => boolean, x: number, y: number): boolean {
  const free = RING.map(([dx, dy]) => open(x + dx, y + dy));
  const wall = free.indexOf(false);
  if (wall < 0) return false;
  let pieces = 0;
  let inPiece = false;
  let hasEdge = false;
  for (let k = 1; k <= 8; k++) {
    const i = (wall + k) % 8;
    if (free[i]) {
      inPiece = true;
      if (i % 2 === 0) hasEdge = true;
    } else if (inPiece) {
      if (hasEdge) pieces++;
      inPiece = false;
      hasEdge = false;
    }
  }
  return pieces >= 2;
}

/**
 * Would an object on (x, y) stand in a passage, or shut one for the objects beside it? Its own ring must stay whole, and so must the ring of every object
 * on a neighbouring cell that was whole before (a pocket that the plan itself left is not made worse by this rule, it is only not made worse). `open` is
 * where the party can walk now, `holdsObject` tells where an object stands (blocking its cell or not).
 */
export function blocksPassage(open: (x: number, y: number) => boolean, holdsObject: (x: number, y: number) => boolean, x: number, y: number): boolean {
  if (splitsRing(open, x, y)) return true;
  const after = (cx: number, cy: number): boolean => open(cx, cy) && !(cx === x && cy === y);
  for (const [dx, dy] of RING) {
    const nx = x + dx;
    const ny = y + dy;
    if (holdsObject(nx, ny) && !splitsRing(open, nx, ny) && splitsRing(after, nx, ny)) return true;
  }
  return false;
}

/** True when all nine cells of the 3 x 3 square round (x, y), the middle included, satisfy `floor`: a column stands only where no wall is within a cell of it. */
export function openSquare(floor: (x: number, y: number) => boolean, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!floor(x + dx, y + dy)) return false;
  return true;
}
