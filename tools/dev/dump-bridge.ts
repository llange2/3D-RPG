/**
 * Prints the bridge of the spaceship (quest document 1.9) as text next to the document's grid: `#` wall, `.` floor, and a letter for every thing that stands there
 * (M terminator, A Titanic Automato, s bone pile, E computer terminal, G temporal field generator, C console, D door, L locked door, X airlock, V lever, T tube); the corners the
 * engine rounds are marked `(` for a floor cell with a model (inner) and `)` for a wall cell (outer). Also validates the map and says what is wrong.
 *
 * Usage: npx tsx tools/dev/dump-bridge.ts [seed]
 */
import { buildMapContent, validateContent } from "../../src/actions";
import { generateInterior, planDungeon } from "../../src/interiors";
import { BRIDGE_TOKENS } from "../../src/interiors/bridge";
import { roundCorners } from "../../src/interiors/roundCorners";
import { CELL } from "../../src/interiors/types";
import { World } from "../../src/world/world";

const seed = process.argv[2] ?? "ship-a";
const world = new World(seed, "default");
const poi = world.allPois().find((p) => planDungeon(world, p)?.klass === "C")!;
const map = generateInterior(world, poi);
const content = buildMapContent(world, poi, map);
const layout = map.spaceship!;
const b = layout.bridge;
const mark = new Map<number, string>();
const put = (x: number, y: number, c: string) => mark.set(y * map.width + x, c);
for (const a of content.actions) {
  const door = a.params.airlock === true ? "X" : a.params.locked === true ? "L" : "D";
  put(a.x, a.y, a.kind === "door" ? door : a.kind === "tube" ? "T" : a.kind === "lever" ? "V" : a.kind === "decor" ? "s" : a.params.terminal === "console" ? "C" : a.params.item === 331 ? "G" : a.kind === "lore" ? "E" : "?");
}
for (const s of content.spawns) put(s.x, s.y, s.monsterIds[0] === 88 ? "A" : s.monsterIds[0] === 69 ? "M" : "m");
const round = new Map(roundCorners(map).map((r) => [r.y * map.width + r.x, r.kind === "inner" ? "(" : ")"]));
console.log(`${map.key}, bridge at ${b.x},${b.y} (${b.w} x ${b.h}), spawn ${map.spawn.x},${map.spawn.y} facing ${map.spawn.facing}`);
for (let y = b.y - 1; y <= b.y + b.h; y++) {
  let row = "";
  for (let x = b.x - 1; x <= b.x + b.w + 6; x++) {
    const i = y * map.width + x;
    row += mark.get(i) ?? (map.cells[i] === CELL.FLOOR ? "." : round.get(i) ?? "#");
  }
  const doc = BRIDGE_TOKENS[y - b.y]?.map((t) => t.padEnd(3)).join("") ?? "";
  console.log(`${row}   ${doc}`);
}
console.log("rounded:", [...round].filter(([i]) => Math.abs((i % map.width) - b.x - 10) <= 12 && Math.abs(Math.floor(i / map.width) - b.y - 3) <= 4).map(([i, c]) => `${c}${(i % map.width) - b.x},${Math.floor(i / map.width) - b.y}`).join(" "));
console.log("issues:", validateContent(map, content));
