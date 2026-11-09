/**
 * Which floor cells of a place the party cannot reach when everything that blocks stands as placed (52nd playtest, point 5): tsx tools/dev/reach-castle.ts seed size name
 * Banners and other wall hangings do not block; every other action does, the king too.
 */
import { buildMapContent } from "../../src/actions";
import { generateInterior } from "../../src/interiors";
import { CELL } from "../../src/interiors/types";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "glade-keep-429", size = "default", name = "Quinkeep"] = process.argv.slice(2);
const world = new World(seed, size as WorldSize, (process.env.DUNGEONS ?? "maximum") as never);
const poi = world.allPois().find((p) => p.name.toLowerCase() === name.toLowerCase() || p.id === name)!;
const map = generateInterior(world, poi);
const content = buildMapContent(world, poi, map);
const WALL_HUNG = new Set([103, 104, 105, 125]);
const blocked = new Set<number>();
for (const a of content.actions) {
  const item = (a.params as { item?: number }).item;
  if (a.kind === "decor" && item !== undefined && WALL_HUNG.has(item)) continue;
  blocked.add(a.y * map.width + a.x);
}
const seen = new Set<number>();
const queue: [number, number][] = [[map.spawn.x, map.spawn.y]];
seen.add(map.spawn.y * map.width + map.spawn.x);
while (queue.length > 0) {
  const [x, y] = queue.shift()!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx;
    const ny = y + dy;
    const i = ny * map.width + nx;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height || seen.has(i) || map.cells[i] !== CELL.FLOOR || blocked.has(i)) continue;
    seen.add(i);
    queue.push([nx, ny]);
  }
}
const lost: string[] = [];
for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (map.cells[y * map.width + x] === CELL.FLOOR && !blocked.has(y * map.width + x) && !seen.has(y * map.width + x)) lost.push(`${x}/${y}`);
console.log(poi.name, "unreachable floor cells:", lost.length, lost.join(" "));
// the plan: # wall, . floor the party reaches, - floor it does not reach, o a blocking object on the floor, = a banner on a floor cell
for (let y = 0; y < map.height; y++) {
  let row = "";
  for (let x = 0; x < map.width; x++) {
    const i = y * map.width + x;
    const banner = content.actions.some((a) => a.x === x && a.y === y && a.kind === "decor" && WALL_HUNG.has((a.params as { item?: number }).item ?? -1));
    row += map.cells[i] !== CELL.FLOOR ? "#" : blocked.has(i) ? "o" : seen.has(i) ? (banner ? "=" : ".") : "-";
  }
  console.log(String(y).padStart(3), row);
}
const kinds = ["king", "treasure", "riddle", "lore"];
for (const a of content.actions) {
  if (!kinds.includes(a.kind)) continue;
  const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((a.y + dy!) * map.width + a.x + dx!));
  console.log(a.kind.padEnd(9), `${a.x}/${a.y}`, near ? "reachable" : "NOT reachable");
}
