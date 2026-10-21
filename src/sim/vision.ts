import { FACING_DELTA, type Facing } from "../interiors/types";

/** Cosine of the half-angle of the cone the party sees: about 55 degrees to each side, a little wider than the screen shows (50). */
const VIEW_COS = Math.cos((55 * Math.PI) / 180);
/** Samples per cell along a sight line; fine enough not to slip through the pinch between two walls that meet at a corner. */
const STEPS_PER_CELL = 8;

/**
 * Whether a cell can be seen from another: a straight line between the cell centres, which ends at the first wall it meets.
 * A wall that is hit is itself seen (its face), what lies behind it is not.
 */
export function canSee(opaque: (x: number, y: number) => boolean, fromX: number, fromY: number, toX: number, toY: number): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * STEPS_PER_CELL));
  let lastX = fromX;
  let lastY = fromY;
  for (let i = 1; i <= steps; i++) {
    const px = fromX + 0.5 + (dx * i) / steps;
    const py = fromY + 0.5 + (dy * i) / steps;
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    if (cx === lastX && cy === lastY) continue;
    // crossing a corner between two walls that only touch diagonally: the rock is closed there, no line passes through
    if (cx !== lastX && cy !== lastY && opaque(cx, lastY) && opaque(lastX, cy)) return false;
    lastX = cx;
    lastY = cy;
    if (cx === toX && cy === toY) return true;
    if (opaque(cx, cy)) return false;
  }
  return true;
}

/**
 * The cells the party sees from where it stands, looking in `facing`: the ones in the 3x3 around it (always: they are at its
 * feet), and every cell within `radius` in front of it, inside the viewing cone, that no wall hides. The party's own cell is
 * included. The map shows what was seen, so a wall that can be broken does not give away the corridor behind it.
 */
export function visibleCells(opaque: (x: number, y: number) => boolean, x: number, y: number, facing: Facing, radius: number): [number, number][] {
  const out: [number, number][] = [];
  const { dx: fx, dy: fy } = FACING_DELTA[facing];
  for (let cy = y - radius; cy <= y + radius; cy++) {
    for (let cx = x - radius; cx <= x + radius; cx++) {
      const ox = cx - x;
      const oy = cy - y;
      const distance = Math.hypot(ox, oy);
      if (distance > radius + 0.5) continue;
      if (Math.max(Math.abs(ox), Math.abs(oy)) <= 1) {
        // at its feet, but a cell that only touches the party's corner behind two walls is behind them
        if (ox !== 0 && oy !== 0 && opaque(x + ox, y) && opaque(x, y + oy)) continue;
      } else {
        // inside the cone in front of the party, and in the open
        if ((ox * fx + oy * fy) / distance < VIEW_COS) continue;
        if (!canSee(opaque, x, y, cx, cy)) continue;
      }
      out.push([cx, cy]);
    }
  }
  return out;
}
