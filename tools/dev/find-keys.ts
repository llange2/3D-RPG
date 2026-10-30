/** Lists the dungeons and caves whose end room holds keys or key cards: tsx tools/dev/find-keys.ts <seed> <size>. */
import { generateInterior } from "../../src/interiors";
import { World } from "../../src/world/world";
import type { WorldSize } from "../../src/world/types";

const [seed = "birch-shore-601", size = "default"] = process.argv.slice(2);
const world = new World(seed, size as WorldSize);
for (const p of world.allPois()) {
  if (p.kind !== "dungeon" && p.kind !== "cave") continue;
  const d = generateInterior(world, p, 0).dungeon;
  if (d && d.gives.length > 0) console.log(p.id, p.name, d.layout, d.quest, "gives", d.gives.join(","), d.endRoom ? `end ${d.endRoom.cx},${d.endRoom.cy} ${d.endRoom.isolated ? "isolated" : "sealed"}` : "no end room");
}
