/**
 * How long the whole map of a world takes to read tile by tile (52nd playtest, point 8: the big map stuttered when zoomed out): tsx tools/dev/time-map-tiles.ts [size]
 */
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const size = (process.argv[2] ?? "huge") as WorldSize;
const world = new World("cedar-peak-198", size);
let t0 = performance.now();
world.tile(5, 5);
console.log("first tile", (performance.now() - t0).toFixed(1), "ms");
t0 = performance.now();
let n = 0;
for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) n += world.tile(x, y).ground;
console.log(size, world.width, "x", world.height, "all tiles first time:", (performance.now() - t0).toFixed(0), "ms", n);
t0 = performance.now();
for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) n += world.tile(x, y).ground;
console.log("all tiles again:", (performance.now() - t0).toFixed(0), "ms");
