/**
 * How much XP and gold a generated world holds per tier: every wild group on the overworld and every spawn in every castle, dungeon and cave
 * (all places of the world are generated, which takes a few seconds). The XP table has to be read against this: a party cannot level on monsters
 * that are not there. Usage: tsx tools/balance/supply.ts [seed] [size]      (results are cached in tools/balance/out/)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMapContent } from "../../src/actions";
import { MONSTERS } from "../../src/data/tables";
import { generateInterior } from "../../src/interiors";
import { chunkSpawns } from "../../src/world/spawns";
import { parseWorldSize, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

export interface Bucket {
  groups: number;
  monsters: number;
  xp: number;
  gold: number;
}
export interface Supply {
  seed: string;
  size: WorldSize;
  places: Record<string, number>;
  /** Index = tier (0 unused). */
  wild: Bucket[];
  inside: Bucket[];
  /** Every spawned group with its tier: the encounters of this world, for the fight simulation. */
  groups: { tier: number; inside: boolean; boss: boolean; ids: number[] }[];
}

const here = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(here, "out");

const tiers = (): Bucket[] => Array.from({ length: 6 }, () => ({ groups: 0, monsters: 0, xp: 0, gold: 0 }));

export function measureSupply(seed: string, size: WorldSize): Supply {
  const cache = join(OUT_DIR, `supply-${seed}-${size}.json`);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8")) as Supply;
  const world = new World(seed, size);
  const wild = tiers();
  const inside = tiers();
  const groups: Supply["groups"] = [];
  const add = (b: Bucket, ids: number[], tier: number, isInside: boolean, boss = false): void => {
    b.groups++;
    groups.push({ tier, inside: isInside, boss, ids: ids.filter((id) => MONSTERS[id]) });
    for (const id of ids) {
      const m = MONSTERS[id];
      if (!m) continue;
      b.monsters++;
      b.xp += m.xp;
      b.gold += m.gold;
    }
  };
  for (let cy = 0; cy < world.chunksDown; cy++) {
    for (let cx = 0; cx < world.chunksAcross; cx++) {
      for (const s of chunkSpawns(world, cx, cy)) {
        const t = Math.min(5, world.tierAt(s.x, s.y));
        add(wild[t]!, s.monsterIds, t, false);
      }
    }
  }
  const places: Record<string, number> = {};
  for (const island of world.islands) {
    for (const poi of world.region(island.index, 0).pois) {
      if (poi.kind === "town") continue;
      places[`${poi.kind}${poi.tier}`] = (places[`${poi.kind}${poi.tier}`] ?? 0) + 1;
      const map = generateInterior(world, poi);
      for (const sp of buildMapContent(world, poi, map).spawns) add(inside[poi.tier]!, sp.monsterIds, poi.tier, true, sp.boss);
    }
  }
  const result: Supply = { seed, size, places, wild, inside, groups };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(cache, JSON.stringify(result));
  return result;
}

/** Sum of wild and interior buckets per tier (index 1..5). */
export function totals(s: Supply): Bucket[] {
  return s.wild.map((w, t) => {
    const i = s.inside[t]!;
    return { groups: w.groups + i.groups, monsters: w.monsters + i.monsters, xp: w.xp + i.xp, gold: w.gold + i.gold };
  });
}

if (process.argv[1]?.endsWith("supply.ts")) {
  const seed = process.argv[2] ?? "alpha";
  const size = parseWorldSize(process.argv[3] ?? "default");
  const s = measureSupply(seed, size);
  const tot = totals(s);
  console.log(`world ${seed} ${size}`);
  console.log("tier | wild groups monsters XP | interiors groups monsters XP | total monsters, XP, gold | cum XP");
  let cum = 0;
  for (let t = 1; t <= 5; t++) {
    cum += tot[t]!.xp;
    console.log(`${t} | ${s.wild[t]!.groups} ${s.wild[t]!.monsters} ${s.wild[t]!.xp} | ${s.inside[t]!.groups} ${s.inside[t]!.monsters} ${s.inside[t]!.xp} | ${tot[t]!.monsters} ${tot[t]!.xp} ${tot[t]!.gold} | ${cum}`);
  }
  console.log("places:", JSON.stringify(s.places));
}
