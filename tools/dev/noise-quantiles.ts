/** Prints quantiles of the raw fbm layers so biome thresholds can be placed on real percentiles. */
import { fbm2 } from "../../src/core/noise";
import { derive, LAYER, seedFromString } from "../../src/core/rng";

const seedText = process.argv[2] ?? "alpha";
const seed = seedFromString(seedText);
const layer = (name: string) => derive(seed, LAYER.TERRAIN, name)[0] | 0;
const layers: [string, number, number, number][] = [
  ["elev", layer("elev"), 160, 5],
  ["temp", layer("temp"), 320, 3],
  ["moist", layer("moist"), 224, 3],
  ["volc", layer("volc"), 288, 3],
];

for (const [name, s, period, oct] of layers) {
  const values: number[] = [];
  for (let y = -6000; y < 6000; y += 37) for (let x = -6000; x < 6000; x += 37) values.push(fbm2(s, x, y, period, oct));
  values.sort((a, b) => a - b);
  const q = (p: number) => values[Math.floor(p * (values.length - 1))]!;
  console.log(`${name.padEnd(6)} ${[0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98].map((p) => `p${Math.round(p * 100)}=${q(p)}`).join(" ")}`);
}
