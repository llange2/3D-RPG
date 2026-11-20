/**
 * Which achievements a world offers (read only, nothing is generated that the game does not generate): for a number of seeds and a world size it counts what the plan of the world holds
 * and prints, for every achievement that depends on the world, in how many of the worlds it can be had.
 *
 *  - "Found a way out!": a cave or dungeon of level 5 with the layout `dungeon_3` (the maze) whose quest can be solved,
 *  - the seven quests (quest_1 to quest_6, quest_8) at all,
 *  - "Antiquity trader": the artifacts hidden in the places (at most 15 a world),
 *  - "Riddle me this!": the mini quests (statues with an extra riddle) of the places,
 *  - "Perfect adventurers": the caves and dungeons whose end room can be reached (plus the five sections of the spaceship),
 *
 * Usage: tsx tools/dev/achievement-feasibility.ts [seeds=40] [size=default] [dungeons=default]
 */
import { QUEST_IDS } from "../../src/data/quest-table";
import { MONSTERS } from "../../src/data/tables";
import { DRAGON_IDS, TERMINATOR_ID } from "../../src/data/achievements";
import { parseDungeonDensity, parseWorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const seeds = Number(process.argv[2] ?? 40);
const size = parseWorldSize(process.argv[3] ?? "default");
const density = parseDungeonDensity(process.argv[4] ?? "default");

const have = {
  maze5: 0,
  maze5Any: 0,
  artifacts: [] as number[],
  minis: [] as number[],
  places: [] as number[],
};
const quests: Record<string, number> = Object.fromEntries(QUEST_IDS.map((q) => [q, 0]));
let dragonBosses = 0;

for (let i = 0; i < seeds; i++) {
  const world = new World(`feasible-${i}`, size, density);
  let maze = false;
  let anyMaze = false;
  let artifacts = 0;
  let minis = 0;
  let places = 0;
  const found = new Set<string>();
  for (const poi of world.allPois()) {
    if (poi.kind !== "cave" && poi.kind !== "dungeon") continue;
    const ref = world.dungeonRef(poi.id);
    if (!ref || ref.quest === "spaceship") continue;
    places++;
    found.add(ref.quest);
    artifacts += ref.artifacts?.length ?? 0;
    minis += ref.minis.length;
    if (ref.layout === "dungeon_3") anyMaze = true;
    if (ref.layout === "dungeon_3" && poi.tier === 5) maze = true;
    if (ref.quest === "quest_5" && DRAGON_IDS.includes(ref.look.boss)) dragonBosses++;
  }
  for (const q of found) quests[q] = (quests[q] ?? 0) + 1;
  if (maze) have.maze5++;
  if (anyMaze) have.maze5Any++;
  have.artifacts.push(artifacts);
  have.minis.push(minis);
  have.places.push(places);
}

const avg = (a: number[]) => (a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)).toFixed(1);
const range = (a: number[]) => `${Math.min(...a)} to ${Math.max(...a)}`;
const pct = (n: number) => `${n} of ${seeds} (${Math.round((100 * n) / seeds)} %)`;
console.log(`size ${size}, dungeons ${density}, ${seeds} worlds`);
console.log(`maze (dungeon_3) on level 5: ${pct(have.maze5)}; a maze on any level: ${pct(have.maze5Any)}`);
for (const q of QUEST_IDS) console.log(`${q}: in ${pct(quests[q] ?? 0)} worlds`);
console.log(`artifacts in the places: mean ${avg(have.artifacts)}, ${range(have.artifacts)} (30 need two worlds at least)`);
console.log(`mini quests: mean ${avg(have.minis)}, ${range(have.minis)} (30 riddles)`);
console.log(`caves and dungeons: mean ${avg(have.places)}, ${range(have.places)} (100 completed over any number of games)`);
console.log(`a dragon (${MONSTERS[DRAGON_IDS[0]!]?.name}, ${MONSTERS[DRAGON_IDS[1]!]?.name}) as the boss of a quest_5 place: ${dragonBosses} in all; huts and the ${MONSTERS[TERMINATOR_ID]?.name} do not depend on the plan`);
