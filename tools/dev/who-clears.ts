/** Which places and roads reach a tile (the cleared ground of a place, a road). Usage: npx tsx tools/dev/who-clears.ts <seed> <size> <x,y> */
import { poiBounds, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "alpha", size = "default", spot = "171,15"] = process.argv.slice(2);
const [x, y] = spot.split(",").map(Number) as [number, number];
const world = new World(seed, size as WorldSize, (process.env.DUNGEONS ?? "maximum") as never);
for (const p of world.allPois()) {
  const b = poiBounds(p);
  const d = Math.max(b.x0 - x, x - b.x1, b.y0 - y, y - b.y1, 0);
  if (d <= 4) console.log(`${p.id} ${p.kind} size ${p.size} at ${p.x}/${p.y} bounds ${b.x0},${b.y0}-${b.x1},${b.y1} distance ${d} biome ${p.biome}${p.tight ? " tight" : ""}`);
}
const region = world.region(world.islandAt(173, 17)?.index ?? 3, 0);
for (const r of region.roads) if (r.distance(x, y) <= 2) console.log("road", JSON.stringify(r), "lava", (r as unknown as { lava: boolean }).lava);
console.log("tile", JSON.stringify(world.tile(x, y)));
