/**
 * How far the party walks from the answer statue to the wall of the end room it opens (53rd playtest, point 13): for every cave and dungeon of quests 2, 4 and 6 with a sealed end
 * room, the steps over the floor from the cell in front of the seal to the riddle statue (or the head, or the boss), over several levels and variants.
 *
 * Usage: npx tsx tools/dev/measure-end-distance.ts [variants]
 */
import { stairLinks } from "../../src/interiors/stairs";
import { CELL } from "../../src/interiors/types";
import { DUNGEON_LAYOUTS, QUESTS, type LayoutId, type QuestId } from "../../src/data/quest-table";
import { doorCell } from "../../src/actions/endRoom";
import { questInterior } from "../../tests/helpers/quests";

const variants = Number(process.argv[2] ?? 8);

function walk(map: { width: number; height: number; cells: ArrayLike<number> } & Parameters<typeof stairLinks>[0], from: number): Int32Array {
  const { width, height, cells } = map;
  const links = stairLinks(map);
  const steps = new Int32Array(width * height).fill(-1);
  const queue = [from];
  steps[from] = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % width;
    const y = (i - x) / width;
    const next = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].flatMap(([nx, ny]) => (nx! >= 0 && ny! >= 0 && nx! < width && ny! < height ? [ny! * width + nx!] : []));
    const link = links.get(i);
    if (link !== undefined) next.push(link);
    for (const j of next) {
      if (steps[j]! >= 0 || cells[j] !== CELL.FLOOR) continue;
      steps[j] = steps[i]! + 1;
      queue.push(j);
    }
  }
  return steps;
}

const all: number[] = [];
for (const quest of ["quest_2", "quest_4", "quest_6"] as QuestId[]) {
  for (const layout of QUESTS[quest].layouts as LayoutId[]) {
    if (!DUNGEON_LAYOUTS.includes(layout as never)) continue;
    const found: number[] = [];
    for (let variant = 0; variant < variants; variant++) {
      for (const tier of [1, 3, 5]) {
        const { map, content, ref } = questInterior(quest, layout, tier, variant);
        const end = ref.endRoom;
        if (!end?.seal) continue;
        const door = doorCell({ map } as never);
        const front = { x: end.seal.x - (door.x - end.seal.x), y: end.seal.y - (door.y - end.seal.y) };
        const steps = walk(map as never, front.y * map.width + front.x);
        const asker = content.actions.find((a) => a.kind === "riddle" && a.params.opens === "end");
        if (!asker) continue;
        const d = steps[asker.y * map.width + asker.x]!;
        if (d >= 0) found.push(d);
      }
    }
    if (found.length === 0) continue;
    all.push(...found);
    found.sort((a, b) => a - b);
    console.log(`${quest} ${layout}: ${found.length} places, median ${found[found.length >> 1]}, longest ${found[found.length - 1]}`);
  }
}
all.sort((a, b) => a - b);
console.log(`all: ${all.length} places, median ${all[all.length >> 1]}, longest ${all[all.length - 1]}`);
