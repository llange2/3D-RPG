/** Prints land share, number of big and small islands and shape kinds per world size over a few seeds. Usage: tsx tools/dev/island-stats.ts [size ...] */
import { buildLayout } from "../../src/world/islands";
import { seedFromString } from "../../src/core/rng";
import { WORLD_SIZES, type WorldSize } from "../../src/world/types";

const seeds = ["alpha", "beta", "gamma", "delta", "eps", "seed-3", "seed-7", "dune-keep-451", "ember-shore-348", "jade-peak-150"];
const wanted = process.argv.slice(2) as WorldSize[];
for (const size of wanted.length > 0 ? wanted : (["small", "default", "large", "huge"] as WorldSize[])) {
  const { width, height } = WORLD_SIZES[size];
  const t0 = Date.now();
  const shares: number[] = [];
  const counts: string[] = [];
  const kinds: Record<string, number> = {};
  for (const seed of seeds) {
    const layout = buildLayout(seedFromString(seed), size);
    shares.push(Math.round((layout.islands.reduce((a, i) => a + i.area, 0) * 1000) / (width * height)) / 10);
    const big = layout.islands.filter((i) => i.big).length;
    counts.push(`${big}/${layout.islands.length - big}`);
    for (const i of layout.islands) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
  }
  console.log(size, `${Date.now() - t0} ms`, "land %", shares.join(" "), "| big/small", counts.join(" "), "|", JSON.stringify(kinds));
}
