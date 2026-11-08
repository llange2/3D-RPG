/**
 * Prints a tower (layout dungeon_5) as text: `#` rock or wall, `.` floor, `o` doorway, `S` staircase up, `G` Fort door down, `^` the cell in front of the staircase, `v` the cell
 * in front of the door, `E` the way out, `@` the spawn, `H` hall. Also the quest, the floors, the stairs and the end room.
 *
 * Usage: npx tsx tools/dev/dump-tower.ts <quest_2|quest_4|quest_5> <tier> [variant]
 */
import type { QuestId } from "../../src/data/quest-table";
import { CELL } from "../../src/interiors/types";
import { questInterior } from "../../tests/helpers/quests";

const quest = (process.argv[2] ?? "quest_5") as QuestId;
const tier = Number(process.argv[3] ?? 1);
const variant = Number(process.argv[4] ?? 0);
const { map, ref, content } = questInterior(quest, "dungeon_5", tier, variant);
const tower = ref.tower!;
const mark = new Map<number, string>();
const at = (p: { x: number; y: number }, c: string) => mark.set(p.y * map.width + p.x, c);
for (const s of tower.stairs) {
  at(s.up, "S");
  at(s.down, "G");
  at(s.front, "^");
  at(s.land, "v");
}
at(map.exit, "E");
at(map.spawn, "@");
const hall = ref.hall;
const lines: string[] = [];
for (let y = 0; y < map.height; y++) {
  let row = "";
  for (let x = 0; x < map.width; x++) {
    const i = y * map.width + x;
    const m = mark.get(i);
    if (m) row += m;
    else if (map.cells[i] !== CELL.FLOOR) row += "#";
    else if (hall && x >= hall.x && y >= hall.y && x < hall.x + hall.w && y < hall.y + hall.h) row += "H";
    else if (map.roomOf[i]! < 0) row += "o";
    else row += ".";
  }
  lines.push(row);
}
console.log(lines.join("\n"));
console.log(`${quest} tier ${tier} variant ${variant}: ${map.width} x ${map.height}, ${tower.floors.length} floors of ${tower.floors[0]!.size}, ${map.rooms.length} rooms, hall ${JSON.stringify(hall)}, end room ${JSON.stringify(ref.endRoom)}`);
console.log(`stairs ${JSON.stringify(tower.stairs)}`);
console.log(`actions ${content.actions.length}, spawns ${content.spawns.length}`);
