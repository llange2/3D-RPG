/**
 * Prints a town (any place) of a seed as characters: . floor, # house, % city wall, E way out, S shop door, and the other actions by their first
 * letter, then the shop doors with the side they face. Usage: tsx tools/dev/dump-town.ts seed size name
 */
import { buildMapContent } from "../../src/actions";
import { generateInterior } from "../../src/interiors";
import { CELL } from "../../src/interiors/types";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "pearl-keep-331", size = "small", name = "Aldford"] = process.argv.slice(2);
const world = new World(seed, size as WorldSize);
const poi = world.allPois().find((p) => p.name === name);
if (!poi) {
  console.log("not found; towns:", world.allPois().filter((p) => p.kind === "town").map((p) => p.name).join(", "));
  process.exit(1);
}
console.log(poi.id, poi.kind, poi.name);
const map = generateInterior(world, poi);
const content = buildMapContent(world, poi, map);
const grid: string[][] = [];
for (let y = 0; y < map.height; y++) {
  const row: string[] = [];
  for (let x = 0; x < map.width; x++) {
    const c = map.cells[y * map.width + x];
    row.push(c === CELL.FLOOR ? "." : c === CELL.BUILDING ? "#" : c === CELL.SOLID ? "%" : "?");
  }
  grid.push(row);
}
const letter: Record<string, string> = { service: "S", door: "D", treasure: "T", decor: "d", lore: "l", fountain: "F", talent: "t", portal: "P", work: "w", transfer: "X", breakable_wall: "B", trap: "^" };
for (const a of content.actions) grid[a.y]![a.x] = letter[a.kind] ?? "a";
grid[map.exit.y]![map.exit.x] = "E";
console.log(grid.map((r) => r.join("")).join("\n"));
for (const l of map.lots) console.log("lot", l.door.x, l.door.y, l.door.facing);
