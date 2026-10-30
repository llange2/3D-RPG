/**
 * Measures the dungeon layouts of a world: rooms, the longest straight corridor, the mean corridor between consecutive rooms and the mean
 * wall gap from a room to its nearest neighbour. Usage: tsx tools/dev/layout-stats.ts <seed> <size> [layout | place name ...]
 * (a layout is dungeon_1 to dungeon_4; without arguments every dungeon of the world is listed).
 */
import { generateInterior } from "../../src/interiors";
import { longestCorridor } from "../../src/interiors/topology";
import { CELL, type InteriorMap } from "../../src/interiors/types";
import { World } from "../../src/world/world";
import type { WorldSize } from "../../src/world/types";

const [seed = "birch-shore-601", size = "default", ...filters] = process.argv.slice(2);
const world = new World(seed, size as WorldSize);

const isCorridor = (m: InteriorMap, x: number, y: number) => m.cells[y * m.width + x] === CELL.FLOOR && m.roomOf[y * m.width + x]! < 0;

/** Mean number of wall cells between a room and the room nearest to it (the gap between their rectangles, the larger of the two axes). */
function meanGap(m: InteriorMap): number {
  const rooms = m.rooms.filter((r) => r.size > 4);
  let sum = 0;
  for (const a of rooms) {
    let near = Infinity;
    for (const b of rooms) {
      if (a === b) continue;
      const gx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
      const gy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
      near = Math.min(near, Math.max(gx, gy));
    }
    sum += near;
  }
  return rooms.length ? sum / rooms.length : 0;
}

/** The map as text: # rock, . room floor, + corridor, E end room, S start. */
function draw(m: InteriorMap): string {
  const end = m.dungeon?.endRoom;
  const rows: string[] = [];
  for (let y = 0; y < m.height; y++) {
    let row = "";
    for (let x = 0; x < m.width; x++) {
      const floor = m.cells[y * m.width + x] === CELL.FLOOR;
      const inEnd = !!end && x >= end.x && y >= end.y && x < end.x + end.w && y < end.y + end.h;
      row += x === m.spawn.x && y === m.spawn.y ? "S" : inEnd ? "E" : !floor ? "#" : m.roomOf[y * m.width + x]! >= 0 ? "." : "+";
    }
    rows.push(row);
  }
  return rows.join("\n");
}

let corridorSum = 0;
let count = 0;
for (const poi of world.allPois()) {
  if (poi.kind !== "dungeon" && poi.kind !== "cave") continue;
  const map = generateInterior(world, poi, 0);
  const layout = map.dungeon?.layout ?? "?";
  if (filters.length > 0 && !filters.includes(layout) && !filters.includes(poi.name)) continue;
  const rooms = map.rooms.filter((r) => r.size > 4).length;
  let corridors = 0;
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (isCorridor(map, x, y)) corridors++;
  const perLink = corridors / Math.max(1, rooms - 1);
  corridorSum += perLink;
  count++;
  if (process.env.DRAW && filters.includes(poi.name)) console.log(draw(map));
  console.log(`${poi.name.padEnd(28)} ${layout.padEnd(10)} ${String(map.dungeon?.quest ?? "").padEnd(8)} rooms ${String(rooms).padStart(2)}  longest straight ${String(longestCorridor(map)).padStart(3)}  corridor cells per link ${perLink.toFixed(1).padStart(5)}  wall gap ${meanGap(map).toFixed(1)}  map ${map.width}x${map.height}`);
}
if (count > 0) console.log(`mean corridor cells per link ${(corridorSum / count).toFixed(1)} over ${count} places`);
