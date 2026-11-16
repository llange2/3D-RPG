/**
 * Prints the whole spaceship level as text: `#` wall, `.` floor, `T` tube, `X` airlock, `D` door, `V` lever, `E` computer or terminal, `C` console, `c` crystal, `o` orb, `b` crate, `s` bone pile,
 * `M`/`A` the bridge's robots (terminator, Titanic Automato), `m` other robots, `@` the spawn. Usage: npx tsx tools/dev/dump-ship.ts [seed]
 */
import { buildMapContent, validateContent } from "../../src/actions";
import { blocksCell } from "../../src/actions/registry";
import { generateInterior, planDungeon } from "../../src/interiors";
import { CELL } from "../../src/interiors/types";
import { World } from "../../src/world/world";

const seed = process.argv[2] ?? "ship-a";
const world = new World(seed, "default");
const poi = world.allPois().find((p) => planDungeon(world, p)?.klass === "C")!;
const map = generateInterior(world, poi);
const content = buildMapContent(world, poi, map);
const mark = new Map<number, string>();
const put = (x: number, y: number, c: string) => mark.set(y * map.width + x, c);
for (const a of content.actions) {
  const letter =
    a.kind === "door" ? (a.params.airlock === true ? "X" : "D") : a.kind === "tube" ? "T" : a.kind === "lever" ? "V" : a.kind === "decor" ? (a.params.item === 70 ? "s" : "c") : a.params.terminal === "console" ? "C" : a.kind === "lore" ? (a.params.terminal === "crystal" ? "c" : "E") : a.params.quest === "quest_orb" ? "o" : "b";
  put(a.x, a.y, letter);
}
for (const s of content.spawns) put(s.x, s.y, s.monsterIds[0] === 88 ? "A" : s.monsterIds[0] === 69 && s.monsterIds.length === 1 ? "M" : "m");
put(map.spawn.x, map.spawn.y, "@");
for (let y = 0; y < map.height; y++) {
  let row = "";
  for (let x = 0; x < map.width; x++) row += mark.get(y * map.width + x) ?? (map.cells[y * map.width + x] === CELL.FLOOR ? "." : "#");
  console.log(row);
}
console.log("issues:", validateContent(map, content).slice(0, 6));

// `--reach`: what the party can reach from the spawn when the objects that block a cell are in the way (doors are open): unreachable floor is shown as `?`, a blocking object as `B`
if (process.argv.includes("--reach")) {
  const blocked = new Set<number>();
  for (const a of content.actions) if (blocksCell(a) && map.cells[a.y * map.width + a.x] === CELL.FLOOR) blocked.add(a.y * map.width + a.x);
  const seen = new Set<number>([map.spawn.y * map.width + map.spawn.x]);
  const queue = [...seen];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % map.width;
    const y = (i - x) / map.width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const j = (y + dy) * map.width + x + dx;
      if (seen.has(j) || map.cells[j] !== CELL.FLOOR || blocked.has(j)) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  for (let y = 0; y < map.height; y++) {
    let row = "";
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      row += blocked.has(i) ? "B" : map.cells[i] === CELL.FLOOR ? (seen.has(i) ? "." : "?") : "#";
    }
    console.log(row);
  }
}
