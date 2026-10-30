/** Draws one test place as text: tsx tools/dev/layout-one.ts <quest> <layout> <tier> <variant>. # rock, . room, + corridor, E end room, S start. */
import type { LayoutId, QuestId } from "../../src/data/quest-table";
import { longestCorridor } from "../../src/interiors/topology";
import { CELL } from "../../src/interiors/types";
import { questInterior } from "../../tests/helpers/quests";

const [quest = "quest_4", layout = "dungeon_2", tier = "2", variant = "0"] = process.argv.slice(2);
const { map } = questInterior(quest as QuestId, layout as LayoutId, Number(tier), Number(variant));
const end = map.dungeon?.endRoom;
for (let y = 0; y < map.height; y++) {
  let row = "";
  for (let x = 0; x < map.width; x++) {
    const floor = map.cells[y * map.width + x] === CELL.FLOOR;
    const inEnd = !!end && x >= end.x && y >= end.y && x < end.x + end.w && y < end.y + end.h;
    row += x === map.spawn.x && y === map.spawn.y ? "S" : inEnd ? "E" : !floor ? "#" : map.roomOf[y * map.width + x]! >= 0 ? "." : "+";
  }
  if (/[^#]/.test(row)) console.log(row);
}
console.log(`rooms ${map.rooms.filter((r) => r.size > 4).length}, longest corridor ${longestCorridor(map)}`);
