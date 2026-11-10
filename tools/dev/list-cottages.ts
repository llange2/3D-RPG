/**
 * Lists the cottages (caravans drawn as `obj_cottage`) of a seed with the tile they stand on and the tile they face.
 * Usage: npx tsx tools/dev/list-cottages.ts [seed] [size]
 */
import { caravansIn } from "../../src/world/caravans";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "pearl-shore-794", size = "default"] = process.argv.slice(2);
const world = new World(seed, size as WorldSize, (process.env.DUNGEONS ?? "default") as never);
for (const c of caravansIn(world, 0, 0, world.width - 1, world.height - 1, true)) {
  if (c.cottage) console.log(`${c.x}/${c.y} faces ${c.faceX}/${c.faceY} (${c.id})`);
}
