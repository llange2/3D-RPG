/** Lists the islands of a world: index, shape, climate, levels, size and place. Usage: tsx tools/dev/island-list.ts seed size */
import { World } from "../../src/world/world";
import { BIOME_NAMES, type WorldSize } from "../../src/world/types";

const [seed = "alpha", size = "default"] = process.argv.slice(2);
const w = new World(seed, size as WorldSize);
for (const i of w.islands) console.log(i.index, i.kind, BIOME_NAMES[i.biome], "tiers", i.tiers.join("+"), i.big ? "big" : "small", "area", i.area, "at", i.x, i.y, "box", JSON.stringify(i.box), "bridge", i.bridge);
