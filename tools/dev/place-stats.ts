/**
 * How many caves, dungeons and pyramids every level of a world has (62nd playtest, point 5), and where the pyramids stand. Sums over several seeds.
 *
 * Usage: DUNGEONS=default npx tsx tools/dev/place-stats.ts <size> [seed,seed,...] [islands]
 */
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const size = (process.argv[2] ?? "small") as WorldSize;
const seeds = (process.argv[3] ?? "pearl-wood-803,amber-gate-204,frost-gate-324,birch-reach-493,ember-wood-189").split(",");
const showIslands = process.argv[4] === "islands";
const density = (process.env.DUNGEONS ?? "default") as never;
const total: Record<number, number> = {};
const kindsTotal: Record<string, number> = {};
let pyramidsOffFive = 0;
for (const seed of seeds) {
  const world = new World(seed, size, density);
  const layout = (world as unknown as { layout: { islands: { index: number; tiers: number[]; area: number; towns: number; biome: number }[] } }).layout;
  const per: Record<number, Record<string, number>> = {};
  for (const poi of world.allPois()) {
    const t = (per[poi.tier] ??= {});
    const k = poi.kind === "dungeon" && poi.size === 3 ? "pyramid" : poi.kind;
    t[k] = (t[k] ?? 0) + 1;
    kindsTotal[k] = (kindsTotal[k] ?? 0) + 1;
    if (k === "pyramid" && poi.tier !== 5) pyramidsOffFive++;
  }
  console.log(seed, size);
  if (showIslands) for (const isl of layout.islands) console.log(`  island ${isl.index} tiers ${isl.tiers.join("/")} area ${isl.area} biome ${isl.biome} towns ${isl.towns}`);
  const line = Object.entries(per)
    .sort()
    .map(([t, kinds]) => {
      const places = (kinds.dungeon ?? 0) + (kinds.cave ?? 0) + (kinds.pyramid ?? 0);
      total[Number(t)] = (total[Number(t)] ?? 0) + places;
      return `L${t}: ${places} (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(", ")})`;
    });
  console.log("  " + line.join(" | "));
}
console.log("places (caves + dungeons + pyramids) per level over all seeds:", JSON.stringify(total));
console.log("kinds:", JSON.stringify(kindsTotal), "pyramids off level 5:", pyramidsOffFive);
