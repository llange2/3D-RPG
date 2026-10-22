/** Times the building of a world: layout, plan (places and roads) and 100 chunks. Usage: tsx tools/dev/world-time.ts [seed] [size] */
import { World } from "../../src/world/world";
import type { WorldSize } from "../../src/world/types";

const seed = process.argv[2] ?? "alpha";
const size = (process.argv[3] ?? "default") as WorldSize;
let t = Date.now();
const w = new World(seed, size);
console.log("layout", Date.now() - t, "ms, islands", w.islands.length);
t = Date.now();
const pois = w.allPois();
console.log("plan", Date.now() - t, "ms, places", pois.length);
t = Date.now();
for (let i = 0; i < 100; i++) w.chunk(i % 10, Math.floor(i / 10));
console.log("100 chunks", Date.now() - t, "ms");
