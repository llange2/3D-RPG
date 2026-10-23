/** Prints the ground of a stretch of a world as characters (water ' ', shallows ~, land ., mountain ^, lava x, road =, bridge B, place P, tree t) and the climate letter of land. Usage: tsx tools/dev/tile-area.ts seed size x y [radius] */
import { World } from "../../src/world/world";
import { BIOME_NAMES, GROUND, type WorldSize } from "../../src/world/types";

const [seed = "alpha", size = "default", cx = "0", cy = "0", r = "8"] = process.argv.slice(2);
const w = new World(seed, size as WorldSize);
const x0 = Number(cx);
const y0 = Number(cy);
const R = Number(r);
for (let y = y0 - R; y <= y0 + R; y++) {
  let row = "";
  for (let x = x0 - R; x <= x0 + R; x++) {
    const t = w.tile(x, y);
    const c = t.poiId ? "P" : t.ground === GROUND.WATER ? " " : t.ground === GROUND.SHALLOW ? "~" : t.ground === GROUND.MOUNTAIN ? "^" : t.ground === GROUND.LAVA_POOL ? "x" : t.ground === GROUND.ROAD || t.ground === GROUND.PASS ? "=" : t.ground === GROUND.BRIDGE ? "B" : t.deco === 1 ? "t" : BIOME_NAMES[t.biome]![0]!;
    row += c;
  }
  console.log(row);
}
