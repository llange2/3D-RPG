/**
 * Survey of everything a world hands out (47th playtest, point 7): XP, attributes, resistances, gold and spell scrolls per world size and dungeon density, as the sum over the places, wild monsters, huts and quest
 * rewards, per party member (a gift to one hero counts a quarter). Reads the game's own code and changes nothing.
 *
 * bug_fix_59: the counting is `src/actions/rewardMeasure.ts` (the game works the factors of a new world out from it). Every row has the raw sums (as the tables say, `goldMonsters` ...), the factors
 * of the world (`scale`) and the sums as the game pays them (`paid`): gold 120 to 130 million with the quests, experience, attribute and resistance points as in a default world.
 *
 * Usage: npx tsx tools/dev/reward-survey.ts [seed=table-47] [sizes=small,default,large,huge] [densities=few,default,maximum] [out.json]
 */
import { writeFileSync } from "node:fs";
import { measureWorld, rewardScaleOf, type WorldRewards } from "../../src/actions/rewardMeasure";
import { World } from "../../src/world/world";
import type { DungeonDensity, WorldSize } from "../../src/world/types";

const seed = process.argv[2] ?? "table-47";
const sizes = (process.argv[3] ?? "small,default,large,huge").split(",") as WorldSize[];
const densities = (process.argv[4] ?? "few,default,maximum").split(",") as DungeonDensity[];

const sum = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

const rows: Array<WorldRewards & { size: string; dungeons: string; scale: ReturnType<typeof rewardScaleOf>; paid: { gold: number; xp: number; attr: number; coin: number; res: number } }> = [];
for (const size of sizes) {
  for (const dungeons of densities) {
    const t0 = Date.now();
    // RULESET=fantastic measures the world with the monsters of Fantastic Islands (same islands, other monsters)
    const world = new World(seed, size, dungeons, process.env.RULESET === "fantastic" ? "fantastic" : "classic");
    const raw = measureWorld(world);
    const scale = rewardScaleOf(raw);
    // what the game pays: the factors on the gold of monsters and containers, the experience of monsters, huts and containers, the points of containers (the coins make up the rest)
    const paid = {
      gold: (raw.goldMonsters + raw.goldObjects) * scale.gold + raw.goldQuests,
      xp: (raw.xpMonsterPlaces + raw.xpMonsterWild + raw.xpHuts + raw.xpObjects) * scale.xp + raw.xpQuests,
      attr: sum(raw.attrs) * scale.attr + raw.attrFreeCoins * scale.coin,
      coin: raw.attrFreeCoins * scale.coin,
      res: sum(raw.res) * scale.res,
    };
    rows.push({ ...raw, size, dungeons, scale, paid });
    console.log(`${size}/${dungeons}: ${raw.places} places, ${((Date.now() - t0) / 1000).toFixed(0)} s, scale ${JSON.stringify(scale)}, paid gold ${(paid.gold / 1e6).toFixed(1)} M, xp ${(paid.xp / 1e6).toFixed(0)} M, attr ${paid.attr.toFixed(0)}, res ${paid.res.toFixed(0)}`);
  }
}
writeFileSync(process.argv[5] ?? `survey-${seed}.json`, JSON.stringify(rows, null, 1));
