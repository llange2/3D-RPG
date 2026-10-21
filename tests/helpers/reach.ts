import { isTileWalkable } from "../../src/world/types";
import type { World } from "../../src/world/world";

export interface WalkGrid {
  x0: number;
  y0: number;
  w: number;
  h: number;
  walkable: Uint8Array;
}

export function buildWalkGrid(world: World, x0: number, y0: number, w: number, h: number): WalkGrid {
  const walkable = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) walkable[y * w + x] = isTileWalkable(world.tile(x0 + x, y0 + y)) ? 1 : 0;
  }
  return { x0, y0, w, h, walkable };
}

/** 4-neighbour flood fill. Returns a visited mask. */
export function flood(grid: WalkGrid, sx: number, sy: number): Uint8Array {
  const { w, h, walkable } = grid;
  const visited = new Uint8Array(w * h);
  const start = (sy - grid.y0) * w + (sx - grid.x0);
  if (!walkable[start]) return visited;
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  visited[start] = 1;
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % w;
    const y = (i - x) / w;
    const neighbours = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const n of neighbours) {
      if (n >= 0 && walkable[n] && !visited[n]) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
  }
  return visited;
}
