import { CELL } from "./types";
import { gridAt, unroundedAt } from "./roundCorners";

/**
 * Smooths the steps out of a map whose corners are rounded by models (the spaceship). A model rounds a corner only where the walls on both sides run straight on, so a wall that
 * steps by one cell (a corridor that runs along a room's edge, one that enters beside a corner) leaves a square corner among the round ones (user, 6. 11. 2026: "Runde Ecke fehlt").
 * A small search finds the edits that remove such a corner: a run of up to `MAX_RUN` wall cells made floor, or floor cells made wall, beside it. An edit is taken when it leaves fewer
 * square corners (and no dead-end pocket or lone pillar of wall more) in the cells it touches and keeps all the floor in one piece. Nothing in `locked` is touched.
 */

const MAX_RUN = 6;
const MAX_PASSES = 8;
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;

export function straightenCorners(cells: Uint8Array, width: number, height: number, locked: (x: number, y: number) => boolean): void {
  const at = gridAt(cells, width, height);
  /** What a cell costs: an unrounded corner, and a pocket or a pillar that an edit must not make (3 each). */
  const cost = (x: number, y: number): number => {
    let c = unroundedAt(at, x, y) ? 1 : 0;
    const here = at(x, y);
    let beside = 0;
    for (const [dx, dy] of DIRECTIONS) if (at(x + dx, y + dy) !== here) beside++;
    if (beside >= 3) c += 3;
    return c;
  };
  const windowCost = (x0: number, y0: number, x1: number, y1: number): number => {
    let sum = 0;
    for (let y = Math.max(0, y0 - 1); y <= Math.min(height - 1, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(width - 1, x1 + 1); x++) sum += cost(x, y);
    return sum;
  };
  const connected = (): boolean => {
    let total = 0;
    let start = -1;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === CELL.FLOOR) {
        total++;
        if (start < 0) start = i;
      }
    }
    if (start < 0) return true;
    const seen = new Uint8Array(cells.length);
    const stack = [start];
    seen[start] = 1;
    let reached = 0;
    while (stack.length > 0) {
      const i = stack.pop()!;
      reached++;
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (cells[j] === CELL.FLOOR && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    return reached === total;
  };

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const bad: { x: number; y: number }[] = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (unroundedAt(at, x, y)) bad.push({ x, y });
    let changed = false;
    for (const { x, y } of bad) {
      if (!unroundedAt(at, x, y)) continue; // an earlier edit of this pass dealt with it
      // every run of cells of one kind that starts at or beside the corner
      const options: { run: number[]; delta: number }[] = [];
      for (let sy = y - 1; sy <= y + 1; sy++) {
        for (let sx = x - 1; sx <= x + 1; sx++) {
          for (const [dx, dy] of DIRECTIONS) {
            const kind = at(sx, sy);
            if (kind !== CELL.FLOOR && kind !== CELL.SOLID) continue;
            for (let length = 1; length <= MAX_RUN; length++) {
              const ex = sx + dx * (length - 1);
              const ey = sy + dy * (length - 1);
              if (ex < 1 || ey < 1 || ex >= width - 1 || ey >= height - 1 || sx < 1 || sy < 1) break;
              if (at(ex, ey) !== kind || locked(ex, ey)) break;
              const run: number[] = [];
              for (let k = 0; k < length; k++) run.push((sy + dy * k) * width + sx + dx * k);
              const x0 = Math.min(sx, ex);
              const x1 = Math.max(sx, ex);
              const y0 = Math.min(sy, ey);
              const y1 = Math.max(sy, ey);
              const before = windowCost(x0, y0, x1, y1);
              for (const i of run) cells[i] = kind === CELL.FLOOR ? CELL.SOLID : CELL.FLOOR;
              const delta = windowCost(x0, y0, x1, y1) - before;
              for (const i of run) cells[i] = kind;
              if (delta < 0) options.push({ run, delta });
            }
          }
        }
      }
      // the best edit first (the shorter one among equals), the first that keeps the floor in one piece
      options.sort((p, q) => p.delta - q.delta || p.run.length - q.run.length);
      for (const option of options) {
        const kind = cells[option.run[0]!]!;
        for (const i of option.run) cells[i] = kind === CELL.FLOOR ? CELL.SOLID : CELL.FLOOR;
        if (connected()) {
          changed = true;
          break;
        }
        for (const i of option.run) cells[i] = kind;
      }
    }
    if (!changed) break;
  }
}
