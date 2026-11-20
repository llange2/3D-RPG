/** The hint wagons of the locked places on lava islands of a world, with the tiles of their lanes. Usage: npx tsx tools/dev/find-hint-wagon.ts <seed> <size> <density> */
import { planDungeon } from "../../src/interiors/dungeonPlan";
import { BIOME, type WorldSize } from "../../src/world/types";
import { caravansOf } from "../../src/world/caravans";
import { World } from "../../src/world/world";

const [seed = "frost-mere-472", size = "small", density = "few"] = process.argv.slice(2);
const world = new World(seed, size as WorldSize, density as never);
for (const p of world.allPois()) {
  if (p.biome !== BIOME.LAVA || !planDungeon(world, p)?.requires) continue;
  const wagon = caravansOf(world, p)[0];
  const lane = world.hintAlleyTiles(p.id);
  console.log(p.id, p.name, `${p.x}/${p.y}`, "wagon", wagon ? `${wagon.x}/${wagon.y}` : "none", "lane", lane.map((t) => `${t.x}/${t.y}`).join(" "), "ground", wagon ? world.tile(wagon.x, wagon.y).ground : "-");
}
