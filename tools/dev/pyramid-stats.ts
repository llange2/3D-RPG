/**
 * Counts the dungeons by class and the pyramids (the dungeons that ask for a key card and lead into the spaceship) of generated worlds, per size
 * and over several seeds: the 24th playtest, point 7, found none on a huge map.
 *
 * Usage: tsx tools/dev/pyramid-stats.ts [seeds=12]
 */
import { planDungeon } from "../../src/interiors/dungeonPlan";
import { WORLD_SIZE_NAMES } from "../../src/world/types";
import { World } from "../../src/world/world";

const seeds = Number(process.argv[2] ?? 12);
for (const size of WORLD_SIZE_NAMES) {
  let none = 0;
  const total = { dungeons: 0, high: 0, keyed: 0, cards: 0, pyramids: 0, islands: 0 };
  for (let s = 0; s < seeds; s++) {
    const world = new World(`pyramid-${s}`, size);
    let pyramids = 0;
    for (const poi of world.allPois()) {
      if (poi.kind !== "dungeon") continue;
      const ref = planDungeon(world, poi)!;
      total.dungeons++;
      if (poi.tier >= 4) total.high++;
      if (ref.klass === "B") total.keyed++;
      if (ref.klass === "B" && ref.gives.length > 0) total.cards++;
      if (ref.klass === "C") {
        total.pyramids++;
        pyramids++;
      }
    }
    total.islands += world.islands.length;
    if (pyramids === 0) none++;
  }
  console.log(`${size.padEnd(8)} per world: ${(total.dungeons / seeds).toFixed(1)} dungeons, ${(total.high / seeds).toFixed(1)} of tier 4+, ${(total.keyed / seeds).toFixed(1)} key dungeons, ${(total.cards / seeds).toFixed(1)} with a card, ${(total.pyramids / seeds).toFixed(2)} pyramids; ${none} of ${seeds} worlds have none`);
}
