/**
 * Lists the places of a seed that carry quest_8 (the crystal paths) with their layout (usage: npx tsx tools/dev/list-quest8.ts <seed>), to pick one for `check-quest8.ts`.
 */
import { World } from "../../src/world/world";

const seed = process.argv[2] ?? "birch-reach-493";
const world = new World(seed, "default", (process.env.DUNGEONS ?? "default") as never);
for (const poi of world.allPois()) {
  const ref = world.dungeonRef(poi.id);
  if (ref && ref.quest === "quest_8") console.log(`${poi.name} | ${poi.kind} size ${poi.size} tier ${poi.tier} | ${ref.quest}, ${ref.layout}`);
}
