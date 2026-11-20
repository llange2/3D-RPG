/** Which island owns a tile, and its biome. Usage: npx tsx tools/dev/island-at.ts <seed> <size> <x,y> [<x,y> ...] */
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "alpha", size = "default", ...spots] = process.argv.slice(2);
const world = new World(seed, size as WorldSize, (process.env.DUNGEONS ?? "maximum") as never);
for (const s of spots) {
  const [x, y] = s.split(",").map(Number) as [number, number];
  const isl = world.islandAt(x, y);
  console.log(s, isl ? `island ${isl.index} biome ${isl.biome} tiers ${isl.tiers.join("/")}` : "sea", "ground", world.tile(x, y).ground, "biome", world.tile(x, y).biome);
}
