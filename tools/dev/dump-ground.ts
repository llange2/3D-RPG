/**
 * Prints the ground of a window of the overworld as characters (. land, ~ deep water, s shallow, ^ mountain, = road, B bridge, P pass, # place, L lava) with the places in it.
 * Usage: DUNGEONS=maximum npx tsx tools/dev/dump-ground.ts <seed> <size> <x0> <y0> <x1> <y1>
 */
import { GROUND, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "gamma", size = "default", ...rest] = process.argv.slice(2);
const [x0 = 0, y0 = 0, x1 = 40, y1 = 30] = rest.map(Number);
const world = new World(seed, size as WorldSize, (process.env.DUNGEONS ?? "maximum") as never);
const SYMBOL: Record<number, string> = { [GROUND.LAND]: ".", [GROUND.WATER]: "~", [GROUND.SHALLOW]: "s", [GROUND.MOUNTAIN]: "^", [GROUND.ROAD]: "=", [GROUND.BRIDGE]: "B", [GROUND.PASS]: "P", [GROUND.POI_BLOCK]: "#", [GROUND.LAVA_POOL]: "L" };
console.log("    " + Array.from({ length: x1 - x0 + 1 }, (_, i) => String(Math.floor((x0 + i) / 10) % 10)).join(""));
console.log("    " + Array.from({ length: x1 - x0 + 1 }, (_, i) => String((x0 + i) % 10)).join(""));
for (let y = y0; y <= y1; y++) {
  let row = "";
  for (let x = x0; x <= x1; x++) row += SYMBOL[world.tile(x, y).ground] ?? "?";
  console.log(String(y).padStart(3) + " " + row);
}
for (const p of world.allPois()) if (p.x >= x0 - 3 && p.x <= x1 + 3 && p.y >= y0 - 3 && p.y <= y1 + 3) console.log(`${p.id} ${p.kind} ${p.x}/${p.y} size ${p.size} side ${p.side}${p.tight ? " tight" : ""} island ${p.region.rx}`);
