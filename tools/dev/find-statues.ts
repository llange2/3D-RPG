/**
 * Where do statues (lore objects of item 28) stand with a wall on exactly one side? Usage: DUNGEONS=default npx tsx tools/dev/find-statues.ts <size> <seed,...>
 */
import { buildMapContent } from "../../src/actions";
import { generateInterior } from "../../src/interiors";
import { planDungeon } from "../../src/interiors/dungeonPlan";
import { CELL, FACING_DELTA } from "../../src/interiors/types";
import { facingSets } from "../../src/render/facing";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const size = (process.argv[2] ?? "small") as WorldSize;
const seeds = (process.argv[3] ?? "pearl-wood-803").split(",");
for (const seed of seeds) {
  const world = new World(seed, size, (process.env.DUNGEONS ?? "default") as never);
  let total = 0;
  const hits: string[] = [];
  for (const poi of world.allPois().filter((p) => (p.kind === "dungeon" || p.kind === "cave") && planDungeon(world, p)?.klass !== "C")) {
    const map = generateInterior(world, poi);
    const content = buildMapContent(world, poi, map);
    const sets = facingSets(map, content.actions, new Set());
    const floor = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR && !sets.wallLike.has(y * map.width + x);
    for (const a of content.actions.filter((q) => q.kind === "lore" && q.params.item === 28)) {
      total++;
      const walls = (Object.keys(FACING_DELTA) as (keyof typeof FACING_DELTA)[]).filter((f) => !floor(a.x + FACING_DELTA[f].dx, a.y + FACING_DELTA[f].dy));
      if (walls.length === 1) hits.push(`${poi.name} ${a.x}/${a.y} wall ${walls[0]}`);
    }
  }
  console.log(seed, "statues", total, "with one wall", hits.length, hits.slice(0, 4).join("; "));
}
