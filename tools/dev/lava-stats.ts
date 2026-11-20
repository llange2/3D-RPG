/**
 * How many places the lava islands of some worlds hold, and how much of them is rock nobody can use (62nd playtest, point 5b).
 * Usage: DUNGEONS=default npx tsx tools/dev/lava-stats.ts <size> [seed,...]
 */
import { BIOME, GROUND, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const size = (process.argv[2] ?? "small") as WorldSize;
const seeds = (process.argv[3] ?? "pearl-wood-803,amber-gate-204,frost-gate-324,birch-reach-493,ember-wood-189").split(",");
for (const seed of seeds) {
  const world = new World(seed, size, (process.env.DUNGEONS ?? "default") as never);
  const layout = (world as unknown as { layout: { islands: { index: number; biome: number; area: number; x: number; y: number; reach: number }[] } }).layout;
  for (const isl of layout.islands.filter((i) => i.biome === BIOME.LAVA)) {
    const pois = world.allPois().filter((p) => p.region.rx === isl.index);
    let mountain = 0;
    let land = 0;
    for (let y = isl.y - isl.reach; y <= isl.y + isl.reach; y++) {
      for (let x = isl.x - isl.reach; x <= isl.x + isl.reach; x++) {
        const t = world.tile(x, y);
        if (t.biome !== BIOME.LAVA) continue;
        if (t.ground === GROUND.MOUNTAIN) mountain++;
        if (t.ground === GROUND.MOUNTAIN || t.ground === GROUND.LAND || t.ground === GROUND.LAVA_POOL || t.ground === GROUND.POI_BLOCK) land++;
      }
    }
    const kinds = pois.map((p) => (p.kind === "dungeon" && p.size === 3 ? "pyramid" : p.kind)).join(", ");
    console.log(seed, `island ${isl.index} area ${isl.area}: ${pois.length} places (${kinds}), mountain ${mountain}/${land} = ${((100 * mountain) / Math.max(1, land)).toFixed(0)} %`);
  }
}
