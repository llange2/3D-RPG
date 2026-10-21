/** Prints biome/ground/POI statistics of a world to tune generator thresholds. Usage: tsx tools/dev/world-stats.ts [seed] [half-size-in-tiles] */
import { World } from "../../src/world/world";
import { BIOME_NAMES } from "../../src/world/types";

const seed = process.argv[2] ?? "alpha";
const half = Number(process.argv[3] ?? 1024);
const step = 4;
const world = new World(seed);

const biomes = new Array(7).fill(0);
const grounds = new Array(11).fill(0);
const decos = new Array(5).fill(0);
let n = 0;
const t0 = performance.now();
for (let y = -half; y < half; y += step) {
  for (let x = -half; x < half; x += step) {
    const t = world.tile(x, y);
    biomes[t.biome]++;
    grounds[t.ground]++;
    decos[t.deco]++;
    n++;
  }
}
const ms = performance.now() - t0;
const pct = (v: number) => `${((v / n) * 100).toFixed(1)}%`;
console.log(`seed=${seed} samples=${n} (${ms.toFixed(0)} ms, ${((ms * 1000) / n).toFixed(1)} us/tile)`);
console.log("biomes ", BIOME_NAMES.map((name, i) => `${name}=${pct(biomes[i])}`).join(" "));
const groundNames = ["land", "water", "shallow", "mountain", "road", "bridge", "pass", "poiWall", "poiYard", "poiGate", "lavaPool"];
console.log("ground ", groundNames.map((name, i) => `${name}=${pct(grounds[i])}`).join(" "));
console.log("deco   ", ["none", "tree", "rock", "bush", "tuft"].map((name, i) => `${name}=${pct(decos[i])}`).join(" "));

const kinds: Record<string, number> = {};
let pois = 0;
const R = Math.floor(half / 128);
for (const ry of [0]) {
  for (const rx of world.islands.map((i) => i.index)) {
    for (const p of world.region(rx, ry).pois) {
      kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
      pois++;
    }
  }
}
console.log(`pois=${pois} regions=${(2 * R + 1) ** 2}`, JSON.stringify(kinds));
