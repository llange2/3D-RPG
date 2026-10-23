/**
 * The corners of many worlds that have no painted tile, by the terrains of their four quarters (top left | top right | bottom left | bottom right),
 * counted, most common first. What `tools/assets/gen-mixed-tiles.py` has to paint. Usage: tsx tools/dev/corner-keys.ts [seed count] [sizes, comma separated]
 */
import { readFileSync } from "node:fs";
import { FlatTileSet, flatTerrainOf } from "../../src/render/flatGround";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [count = "12", sizes = "small,default"] = process.argv.slice(2);
const set = new FlatTileSet(JSON.parse(readFileSync("public/assets/terrain/flat/tiles.json", "utf-8")));
const keys = new Map<string, number>();
let total = 0;
for (let s = 0; s < Number(count); s++) {
  for (const size of sizes.split(",")) {
    const world = new World(`mixed-${s}`, size as WorldSize);
    const terrain = (x: number, y: number) => flatTerrainOf(world.tile(x, y));
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const q = [terrain(x, y), terrain(x + 1, y), terrain(x, y + 1), terrain(x + 1, y + 1)] as const;
        if (set.hasExact(...q)) continue;
        total++;
        const k = q.join("|");
        keys.set(k, (keys.get(k) ?? 0) + 1);
      }
    }
  }
}
console.log(`corners without a tile: ${total}, ${keys.size} different`);
for (const [k, n] of [...keys].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5), k);
