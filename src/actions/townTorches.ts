import { TORCHLIGHT_ITEM } from "../data/quest-table";
import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import type { ActionInstance, SpawnPoint } from "./types";

/** Cells between two torches along a house wall of a town (the castles hang a banner and a torch every third cell). */
export const TOWN_TORCH_SPACING = 4;
/** Shortest stretch of wall that gets a torch (the lanes of the small old towns are short). */
const TOWN_TORCH_MIN_RUN = 2;

const FACINGS: readonly Facing[] = ["N", "E", "S", "W"];
const OPPOSITE: Record<Facing, Facing> = { N: "S", E: "W", S: "N", W: "E" };
/** Compass bearing in degrees of a model that looks the given way (0 north), as the objects of the interior view take it. */
const BEARING: Record<Facing, number> = { N: 0, E: 90, S: 180, W: 270 };

/**
 * bug_fix_83: the streets of a town are lit at regular distances, as the walls of a castle are. A torch (the user's Torchlight, item 334) hangs on the wall of every `TOWN_TORCH_SPACING`-th street cell
 * along a stretch of wall, looking into the street. A cell that already holds an object gets none (the shops' doors, the fountain, the exit and the rest keep their places), and a torch never
 * blocks a cell, so no street is narrowed. Pure function of the map: the same town gets the same torches.
 */
export function townTorches(map: InteriorMap, actions: readonly ActionInstance[], spawns: readonly SpawnPoint[]): ActionInstance[] {
  const W = map.width;
  const floorAt = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < map.height && map.cells[y * W + x] === CELL.FLOOR;
  const used = new Set<number>([...actions, ...spawns].map((a) => a.y * W + a.x));
  // (the party's start keeps its cell and the cells round it free, `validateContent`)
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) used.add((map.spawn.y + dy) * W + map.spawn.x + dx);
  const runs = new Map<string, { x: number; y: number; depth: number }[]>();
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < W; x++) {
      if (!floorAt(x, y) || used.has(y * W + x)) continue;
      // the first wall the cell has (a cell in a lane between two walls hangs its torch on one of them, a corner on one of its two)
      const wall = FACINGS.find((f) => !floorAt(x + FACING_DELTA[f].dx, y + FACING_DELTA[f].dy));
      if (!wall) continue;
      const alongX = wall === "N" || wall === "S";
      const key = `${wall}:${alongX ? y : x}`;
      const list = runs.get(key) ?? [];
      list.push({ x, y, depth: alongX ? x : y });
      runs.set(key, list);
    }
  }
  const torches: ActionInstance[] = [];
  let n = 0;
  for (const [key, list] of [...runs.entries()].sort(([p], [q]) => (p < q ? -1 : 1))) {
    const look = OPPOSITE[key[0] as Facing];
    list.sort((p, q) => p.depth - q.depth);
    let start = 0;
    for (let i = 1; i <= list.length; i++) {
      if (i < list.length && list[i]!.depth === list[i - 1]!.depth + 1) continue;
      const run = list.slice(start, i);
      start = i;
      if (run.length < TOWN_TORCH_MIN_RUN) continue;
      // centred on the run, like the banners of a castle
      for (let k = Math.floor(((run.length - 1) % TOWN_TORCH_SPACING) / 2); k < run.length; k += TOWN_TORCH_SPACING) {
        const c = run[k]!;
        torches.push({ uid: `${map.key}#torch:${n++}`, kind: "decor", x: c.x, y: c.y, params: { item: TORCHLIGHT_ITEM, bearing: BEARING[look] } });
      }
    }
  }
  return torches;
}
