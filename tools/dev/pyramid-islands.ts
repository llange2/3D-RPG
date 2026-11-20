/** Pyramids per island and the islands of level 5 with dungeons. Usage: npx tsx tools/dev/pyramid-islands.ts <size> <seed,...> */
import { planDungeon } from "../../src/interiors/dungeonPlan";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const size = (process.argv[2] ?? "small") as WorldSize;
for (const seed of (process.argv[3] ?? "plan-a,plan-b,plan-c").split(",")) {
  const world = new World(seed, size, (process.env.DUNGEONS ?? "maximum") as never);
  const places = world.allPois().filter((p) => p.kind === "dungeon" || p.kind === "cave");
  const pyramids = places.filter((p) => planDungeon(world, p)?.klass === "C");
  const per = new Map<number, number>();
  for (const p of pyramids) per.set(p.region.rx, (per.get(p.region.rx) ?? 0) + 1);
  const l5 = new Map<number, string[]>();
  for (const p of places.filter((q) => q.tier === 5)) l5.set(p.region.rx, [...(l5.get(p.region.rx) ?? []), p.kind === "dungeon" && p.size === 3 ? "P" : p.kind[0]!.toUpperCase()]);
  console.log(seed, "pyramids per island", JSON.stringify([...per]), "level 5 places per island", JSON.stringify([...l5]));
}
