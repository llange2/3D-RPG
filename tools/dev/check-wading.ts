/**
 * Where does wading from island 2 reach another island (22nd playtest, the sea between islands stays deep)? Prints the first land tile of the other island that the wading reaches, with the places near it.
 * Usage: DUNGEONS=maximum npx tsx tools/dev/check-wading.ts <seed> <size>
 */
import { GROUND, isTileWalkable, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "gamma", size = "default"] = process.argv.slice(2);
const world = new World(seed, size as WorldSize, (process.env.DUNGEONS ?? "maximum") as never);
const w = world.width;
const h = world.height;
const isl = world.islands[2]!;
// land tiles of an island: flood from a place of it
const start = world.allPois().find((p) => p.region.rx === isl.index)!;
const seen = new Map<number, number>();
const stack: [number, number][] = [[start.x, start.y]];
seen.set(start.y * w + start.x, -1);
while (stack.length > 0) {
  const [x, y] = stack.pop()!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = world.wrapX(x + dx);
    const ny = world.wrapY(y + dy);
    const key = ny * w + nx;
    if (seen.has(key) || !isTileWalkable(world.tile(nx, ny))) continue;
    seen.set(key, y * w + x);
    stack.push([nx, ny]);
  }
}
for (const p of world.allPois()) {
  if (p.region.rx === isl.index) continue;
  let key = p.y * w + p.x;
  if (!seen.has(key)) {
    // the entrance
    const f = world.frontOf(p);
    key = f.y * w + f.x;
    if (!seen.has(key)) continue;
  }
  console.log(`reached ${p.id} ${p.kind} at ${p.x}/${p.y} island ${p.region.rx}${p.tight ? " tight" : ""}`);
  // the path back
  let k = key;
  const path: string[] = [];
  while (k >= 0 && path.length < 200) {
    const x = k % w;
    const y = Math.floor(k / w);
    path.push(`${x}/${y}:${world.tile(x, y).ground}`);
    k = seen.get(k) ?? -1;
  }
  const cells = path.map((s) => s.split(":")[0]!.split("/").map(Number) as [number, number]);
  let last = -2;
  for (const [x, y] of cells) {
    const own = world.islandAt(x, y)?.index ?? -1;
    if (own !== last) console.log(`  ${x}/${y} ground ${world.tile(x, y).ground} island ${own}`);
    last = own;
  }
  break;
}
void GROUND;
