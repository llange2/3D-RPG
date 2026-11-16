/**
 * How the wild monsters of the land share each level: per level and monster the count and the share of all wild land monsters of the level, over the given
 * seeds. A level whose strongest monster takes most of it needs a look (the Vulture Rocs of level 5 took 69 % in `pearl-shore-794`, 16. 11. 2026).
 * Usage: tsx tools/dev/wild-stats.ts [size] [seed ...]      (dungeon density: DUNGEONS=default|few|maximum, default `default`)
 */
import { MONSTERS } from "../../src/data/tables";
import { chunkSpawns } from "../../src/world/spawns";
import { parseWorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [sizeArg, ...seedArgs] = process.argv.slice(2);
const size = parseWorldSize(sizeArg ?? "default");
const seeds = seedArgs.length > 0 ? seedArgs : ["pearl-shore-794", "birch-reach-493", "amber-gate-204", "onyx-peak-873", "kelp-peak-430", "p25-a", "p25-b", "ember-wood-189"];
const density = (process.env.DUNGEONS ?? "default") as never;

const total = new Map<number, Map<string, number>>();
for (const seed of seeds) {
  const world = new World(seed, size, density);
  const mine = new Map<number, Map<string, number>>();
  for (let cy = 0; cy < world.chunksDown; cy++) {
    for (let cx = 0; cx < world.chunksAcross; cx++) {
      for (const g of chunkSpawns(world, cx, cy)) {
        const tier = world.tierAt(g.x, g.y);
        for (const id of g.monsterIds) {
          const m = MONSTERS[id]!;
          if (m.terrain === "water") continue;
          for (const bucket of [mine, total]) {
            const byName = bucket.get(tier) ?? new Map<string, number>();
            byName.set(m.name, (byName.get(m.name) ?? 0) + 1);
            bucket.set(tier, byName);
          }
        }
      }
    }
  }
  const l5 = [...(mine.get(5) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  console.log(`${seed.padEnd(18)} L5: ${l5.map(([n, c]) => `${n} ${c}`).join(", ")}`);
}
console.log(`\nAll ${seeds.length} seeds (${size}):`);
for (const tier of [...total.keys()].sort((a, b) => a - b)) {
  const byName = total.get(tier)!;
  const sum = [...byName.values()].reduce((a, b) => a + b, 0);
  console.log(`level ${tier} (${sum} monsters)`);
  for (const [name, n] of [...byName.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)} ${((100 * n) / sum).toFixed(1).padStart(5)} %  ${name}`);
}
