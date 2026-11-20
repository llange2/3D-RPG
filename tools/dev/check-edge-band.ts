/** Prints the tiles of the edge band of a world that are not deep water (20th playtest), with the places near them. Usage: npx tsx tools/dev/check-edge-band.ts [seed] [size] */
import { GROUND, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed, size = "small"] = process.argv.slice(2);
for (const s of seed ? [[seed, size]] : (["small", "default", "large", "huge"] as const).map((z) => ["sea-" + z, z])) {
  const w = new World(s[0]!, s[1] as WorldSize);
  const bad: string[] = [];
  const check = (x: number, y: number): void => {
    if (w.tile(x, y).ground !== GROUND.WATER) bad.push(`${x}/${y}:${w.tile(x, y).ground}`);
  };
  for (let i = 0; i < w.width; i++) {
    check(i, 0);
    check(i, w.height - 1);
  }
  for (let i = 0; i < w.height; i++) {
    check(0, i);
    check(w.width - 1, i);
  }
  console.log(s[0], s[1], `${w.width}x${w.height}`, bad.length > 0 ? bad.join(" ") : "ok");
  for (const p of w.allPois()) {
    const edge = Math.min(p.x, p.y, w.width - 1 - p.x, w.height - 1 - p.y);
    if (bad.length > 0 && edge < 12) console.log("  place near the edge:", p.id, p.kind, p.size, `${p.x}/${p.y}`, "edge distance", edge, p.tight ? "tight" : "");
  }
}
