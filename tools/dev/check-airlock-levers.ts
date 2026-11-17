/**
 * Counts the levers of every airlock of the spaceship over many seeds (bug_fix_68: in `pearl-shore-794` life support had one lever only, because the second niche lay in a room).
 * Usage: npx tsx tools/dev/check-airlock-levers.ts [count] [firstSeed]    prints the seeds whose ship has an airlock without two levers, or validation issues.
 */
import { buildMapContent, validateContent } from "../../src/actions";
import { generateInterior, planDungeon } from "../../src/interiors";
import { World } from "../../src/world/world";

const count = Number(process.argv[2] ?? 60);
const first = Number(process.argv[3] ?? 0);
const named = ["pearl-shore-794", "birch-reach-493", "ship-a"];
const seeds = [...named, ...Array.from({ length: count }, (_, i) => `lever-${first + i}`)];
let bad = 0;
for (const seed of seeds) {
  const world = new World(seed, "default", "default");
  const poi = world.allPois().find((p) => planDungeon(world, p)?.klass === "C");
  if (!poi) continue;
  const map = generateInterior(world, poi);
  const content = buildMapContent(world, poi, map);
  const levers = new Map<string, number>();
  for (const a of content.actions) if (a.kind === "lever" && typeof a.params.airlock === "string") levers.set(a.params.airlock, (levers.get(a.params.airlock) ?? 0) + 1);
  const locks = content.actions.filter((a) => a.kind === "door" && a.params.airlock === true);
  const broken = locks.filter((l) => levers.get(l.uid) !== 2);
  const issues = validateContent(map, content);
  if (broken.length > 0 || issues.length > 0) {
    bad++;
    console.log(seed, "airlocks without two levers:", broken.map((l) => `${l.uid}=${levers.get(l.uid) ?? 0}`).join(", "), "issues:", issues.slice(0, 4));
  }
}
console.log(`${seeds.length} seeds, ${bad} with a problem`);
