/** The four terrains of a corner (x/y, x+1/y, x/y+1, x+1/y+1) and the tiles under them. Usage: npx tsx tools/dev/corner-at.ts <seed> <size> <x,y> */
import { flatTerrainOf } from "../../src/render/flatGround";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "gamma", size = "small", spot = "21,42"] = process.argv.slice(2);
const [x, y] = spot.split(",").map(Number) as [number, number];
const world = new World(seed, size as WorldSize, (process.env.DUNGEONS ?? "maximum") as never);
for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
  const t = world.tile(x + dx, y + dy);
  console.log(`${x + dx}/${y + dy}`, flatTerrainOf(t), JSON.stringify(t));
}
