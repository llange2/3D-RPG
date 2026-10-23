/**
 * Counts the corners of a world that have no painted ground tile (the flat ground has pictures for one or two terrains at a corner, none for three)
 * and lists the first ones. Usage: tsx tools/dev/corner-stats.ts seed[,seed...] size [how many to list, default 25]
 */
import { readFileSync } from "node:fs";
import { FlatTileSet, flatTerrainOf } from "../../src/render/flatGround";
import { GROUND, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seedsArg = "alpha", size = "default", list = "25"] = process.argv.slice(2);
const set = new FlatTileSet(JSON.parse(readFileSync("public/assets/terrain/flat/tiles.json", "utf-8")));
const kinds = new Map<string, number>();
let total = 0;
for (const seed of seedsArg.split(",")) {
  const world = new World(seed, size as WorldSize);
  const terrain = (x: number, y: number) => flatTerrainOf(world.tile(x, y));
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const q = [terrain(x, y), terrain(x + 1, y), terrain(x, y + 1), terrain(x + 1, y + 1)] as const;
      if (set.hasExact(...q)) continue;
      total++;
      const grounds = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => world.tile(x + dx!, y + dy!).ground).map((g) => Object.keys(GROUND).find((k) => (GROUND as Record<string, number>)[k] === g));
      const key = `${[...new Set(q)].sort().join("+")} [${[...new Set(grounds)].sort().join(",")}]`;
      kinds.set(key, (kinds.get(key) ?? 0) + 1);
      if (total <= Number(list)) console.log(seed, x, y, q.join("|"), grounds.join("|"));
    }
  }
}
console.log("corners without a tile:", total);
for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5), k);
