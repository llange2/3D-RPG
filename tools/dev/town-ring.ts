/**
 * The share of free land three tiles from a town that is blocked by trees or mountains (the 6. 11. 2026 playtest asks for more than 0.4), over several small worlds.
 * Usage: DUNGEONS=maximum npx tsx tools/dev/town-ring.ts [size] [seed,seed,...]
 */
import { DECO, GROUND, poiBounds, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const size = (process.argv[2] ?? "small") as WorldSize;
const seeds = (process.argv[3] ?? "alpha,delta,beta,gamma,ember,test,pearl-wood-803,amber-gate-204").split(",");
let allBlocked = 0;
let allRing = 0;
for (const seed of seeds) {
  const world = new World(seed, size, (process.env.DUNGEONS ?? "maximum") as never);
  let ring = 0;
  let blocked = 0;
  for (const town of world.allPois().filter((p) => p.kind === "town")) {
    const b = poiBounds(town);
    for (let y = b.y0 - 3; y <= b.y1 + 3; y++) {
      for (let x = b.x0 - 3; x <= b.x1 + 3; x++) {
        if (Math.max(x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0, y < b.y0 ? b.y0 - y : y > b.y1 ? y - b.y1 : 0) !== 3) continue;
        const t = world.tile(x, y);
        if (t.ground !== GROUND.LAND && t.ground !== GROUND.MOUNTAIN) continue;
        ring++;
        if (t.ground === GROUND.MOUNTAIN || t.deco === DECO.TREE) blocked++;
      }
    }
  }
  allBlocked += blocked;
  allRing += ring;
  console.log(seed, blocked, ring, (blocked / Math.max(1, ring)).toFixed(2));
}
console.log("all", (allBlocked / Math.max(1, allRing)).toFixed(3));
