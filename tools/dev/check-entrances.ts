/**
 * Lists the places that have a road tile next to their footprint on a side other than their entrance (tight places of the 62nd playtest, point 5).
 * Usage: DUNGEONS=maximum npx tsx tools/dev/check-entrances.ts <seed> <size>
 */
import { GROUND, poiBounds, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "poi-entrance", size = "large"] = process.argv.slice(2);
const world = new World(seed, size as WorldSize, (process.env.DUNGEONS ?? "maximum") as never);
const isRoad = (g: number) => g === GROUND.ROAD || g === GROUND.PASS || g === GROUND.BRIDGE;
for (const p of world.allPois()) {
  const front = world.frontOf(p);
  const b = poiBounds(p);
  const t = world.tile(front.x, front.y);
  const neighbours = [[p.x, b.y1 + 1], [b.x1 + 1, p.y], [b.x0 - 1, p.y], [p.x, b.y0 - 1]].map(([x, y]) => ({ x: x!, y: y!, g: world.tile(x!, y!).ground }));
  if (neighbours.some((n) => isRoad(n.g)) && !isRoad(t.ground)) {
    console.log(p.id, p.kind, p.name, `at ${p.x}/${p.y}`, `side ${p.side}`, p.tight ? "TIGHT" : "", `front ${front.x}/${front.y} ground ${t.ground}`, "road neighbours:", neighbours.filter((n) => isRoad(n.g)).map((n) => `${n.x}/${n.y}`).join(" "));
    const near = world.allPois().filter((q) => q !== p && Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) < 8).map((q) => `${q.id} ${q.kind} ${q.x}/${q.y} side ${q.side}${q.tight ? " tight" : ""}`);
    console.log("   near:", near.join("; "));
  }
}
