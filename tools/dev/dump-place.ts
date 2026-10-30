/**
 * Prints any place of a seed (town, castle, cave, dungeon) as characters with a coordinate ruler, then every action with its cell:
 * . floor, # house/solid, % wall, E way out, the actions by the letter in `LETTER`. Usage: tsx tools/dev/dump-place.ts seed size name [x0 y0 x1 y1]
 * The optional window cuts the map to the cells x0..x1, y0..y1 (cells are written x/y, the way the playtest notes name them).
 */
import { buildMapContent } from "../../src/actions";
import { generateInterior } from "../../src/interiors";
import { CELL } from "../../src/interiors/types";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "frost-gate-324", size = "default", name = "Aldhold", ...rest] = process.argv.slice(2);
const world = new World(seed, size as WorldSize);
const poi = world.allPois().find((p) => p.name.toLowerCase() === name.toLowerCase());
if (!poi) {
  console.log("not found; places:", world.allPois().map((p) => `${p.name} (${p.kind})`).join(", "));
  process.exit(1);
}
const map = generateInterior(world, poi);
const content = buildMapContent(world, poi, map);
console.log(poi.id, poi.kind, poi.name, `${map.width}x${map.height}`, "theme", map.theme.id ?? "", "spawn", JSON.stringify(map.spawn), "exit", JSON.stringify(map.exit));

const LETTER: Record<string, string> = { service: "S", door: "D", treasure: "T", decor: "d", lore: "l", fountain: "F", talent: "t", portal: "P", work: "w", transfer: "X", breakable_wall: "B", trap: "^", lever: "L", head: "H", shrine: "s", riddle: "r", gong: "g", chalice: "c", king: "K", qportal: "q", rune: "u", tube: "v", ambush: "a" };
const [x0 = 0, y0 = 0, x1 = map.width - 1, y1 = map.height - 1] = rest.map(Number);
const grid: string[][] = [];
for (let y = 0; y < map.height; y++) {
  const row: string[] = [];
  for (let x = 0; x < map.width; x++) {
    const c = map.cells[y * map.width + x];
    row.push(c === CELL.FLOOR ? "." : c === CELL.BUILDING ? "#" : c === CELL.SOLID ? "%" : "?");
  }
  grid.push(row);
}
for (const a of content.actions) grid[a.y]![a.x] = LETTER[a.kind] ?? "o";
for (const p of map.pillars ?? []) if (grid[p.y]?.[p.x] === ".") grid[p.y]![p.x] = "i";
grid[map.exit.y]![map.exit.x] = "E";
const xs = Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i);
console.log("    " + xs.map((x) => String(Math.floor(x / 10) % 10)).join(""));
console.log("    " + xs.map((x) => String(x % 10)).join(""));
for (let y = y0; y <= y1; y++) console.log(String(y).padStart(3) + " " + grid[y]!.slice(x0, x1 + 1).join(""));
for (const a of content.actions) {
  if (a.x < x0 || a.x > x1 || a.y < y0 || a.y > y1) continue;
  console.log(`${a.x}/${a.y}`.padEnd(7), a.kind.padEnd(14), JSON.stringify(a.params));
}
