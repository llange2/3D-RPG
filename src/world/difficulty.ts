import type { Rng } from "../core/rng";
import { MONSTER_IDS, MONSTERS, walksOnLand, type MonsterDef } from "../data/tables";
import { isqrt, wrapDist2 } from "./islands";
import type { Poi } from "./types";
import type { World } from "./world";

/**
 * How hard the overworld is at a spot, and which monster belongs there. The treasure level of a monster (the sheet's entity 24) says roughly on
 * which island it lives, its XP (entity 23) is the fine tuning: next to Starthaven the weakest monsters of level 1, and the farther from the first town
 * the harder, to the end of level 1, then level 2 from its nearest tile to its farthest, and so on. The stronger a monster, the farther from Starthaven.
 *
 * Both are numbers in thousandths of a level: `levelAt` = level of the island * 1000 + how far from Starthaven the spot lies in that level (`wayAt`),
 * `monsterLevel` = treasure level * 1000 + the rank of the monster by XP among the monsters of its level. Integers only (no float in the generator).
 */

const townCache = new WeakMap<World, Map<number, Poi[]>>();

/** The towns of one level. */
export function townsOfLevel(world: World, level: number): Poi[] {
  let byLevel = townCache.get(world);
  if (!byLevel) {
    byLevel = new Map();
    for (const p of world.allPois()) {
      if (p.kind !== "town") continue;
      const list = byLevel.get(p.tier);
      if (list) list.push(p);
      else byLevel.set(p.tier, [p]);
    }
    townCache.set(world, byLevel);
  }
  return byLevel.get(level) ?? [];
}

/** How far the land of a level lies from Starthaven: the nearest and the farthest tile of it, over all its islands, in tiles. */
const spans = new WeakMap<World, Map<number, { min: number; max: number }>>();

function levelSpan(world: World, tier: number): { min: number; max: number } {
  let byTier = spans.get(world);
  if (!byTier) spans.set(world, (byTier = new Map()));
  const known = byTier.get(tier);
  if (known) return known;
  const home = world.anchorOf(0, 0);
  let min = Infinity;
  let max = 0;
  for (const isl of world.islands) {
    if (!isl.tiers.includes(tier)) continue;
    for (let dy = isl.box.y0; dy <= isl.box.y1; dy++) {
      for (let dx = isl.box.x0; dx <= isl.box.x1; dx++) {
        const x = world.wrapX(isl.x + dx);
        const y = world.wrapY(isl.y + dy);
        if (world.islandAt(x, y) !== isl || world.tierAt(x, y) !== tier) continue;
        const d = isqrt(wrapDist2(x, y, home.x, home.y, world.width, world.height));
        min = Math.min(min, d);
        max = Math.max(max, d);
      }
    }
  }
  const span = { min: min === Infinity ? 0 : min, max };
  byTier.set(tier, span);
  return span;
}

/**
 * The position of a spot in its level (0 to 1000): its distance from Starthaven, 0 at the nearest tile of the level and 1000 at the farthest. A monster is
 * the harder the farther it stands from the first town, in every level (25th and 26th playtest); the level itself comes from the island.
 */
export function wayAt(world: World, x: number, y: number, level: number): number {
  const span = levelSpan(world, level);
  if (span.max <= span.min) return 500;
  const home = world.anchorOf(0, 0);
  const d = isqrt(wrapDist2(x, y, home.x, home.y, world.width, world.height));
  return Math.max(0, Math.min(1000, Math.floor(((d - span.min) * 1000) / (span.max - span.min))));
}

/** The level of the spot in thousandths: the level of the island (`World.tierAt`) and the position in it (`wayAt`). */
export function levelAt(world: World, x: number, y: number): number {
  const tier = world.tierAt(x, y);
  return tier * 1000 + wayAt(world, x, y, tier);
}

let ranks: Map<number, number> | null = null;

/** Where a monster stands on the scale: its treasure level in thousandths plus the middle of its XP rank among the monsters of that level. */
export function monsterLevel(id: number): number {
  if (!ranks) {
    ranks = new Map();
    for (let level = 1; level <= 5; level++) {
      const list = MONSTER_IDS.filter((m) => MONSTERS[m]!.treasure_level === level).sort((a, b) => MONSTERS[a]!.xp - MONSTERS[b]!.xp || a - b);
      list.forEach((m, i) => ranks!.set(m, level * 1000 + Math.floor(((2 * i + 1) * 500) / list.length)));
    }
  }
  return ranks.get(id) ?? MONSTERS[id]!.treasure_level * 1000;
}

/**
 * How far (in thousandths of a level) a wild monster may lie from the level of the spot and still be drawn there. It was 700, so that nearly every monster of
 * a level could stand nearly anywhere on it, and a Wicked Witch (the 16th of 18 monsters of level 1) stood eight tiles from Starthaven (25th playtest). With 150 a
 * spot has the one or two monsters whose place on the scale it is.
 */
export const WILD_WINDOW = 150;

/** The monsters that walk the overworld without a hut, the sheet's "x", and those of the open sea. */
function wildPool(water: boolean): MonsterDef[] {
  return MONSTER_IDS.map((id) => MONSTERS[id]!).filter((m) => m.outside === "wild" && (water ? m.terrain === "water" : walksOnLand(m)));
}
const pools = { land: wildPool(false), water: wildPool(true) };

/**
 * A wild monster of the land for a spot: of the monsters of the sheet's "x" that belong to the level of the island (the hardest of level 1 do not stand at the
 * border of level 2), those whose place on the scale lies within `WILD_WINDOW` of the position of the spot, the nearer the more likely.
 */
export function pickWildMonster(rng: Rng, world: World, x: number, y: number): MonsterDef {
  const tier = world.tierAt(x, y);
  const own = pools.land.filter((m) => m.treasure_level === tier);
  const pool = own.length > 0 ? own : pools.land;
  const here = tier * 1000 + wayAt(world, x, y, tier);
  const weights = pool.map((m) => Math.max(0, 1000 - Math.floor((Math.abs(monsterLevel(m.id) - here) * 1000) / WILD_WINDOW)));
  if (weights.every((w) => w === 0)) {
    // nothing within reach: the one nearest on the scale
    return [...pool].sort((a, b) => Math.abs(monsterLevel(a.id) - here) - Math.abs(monsterLevel(b.id) - here) || a.id - b.id)[0]!;
  }
  return pool[rng.weightedIndex(weights)]!;
}

/**
 * A monster of the open sea for a spot. The sea has no level of its own (the island nearest to it would give the sea next to Starthaven the monsters of a
 * strong island across the strait), so it goes by the distance from Starthaven alone: from the weakest sea monster next to the town to the strongest at the
 * far side of the globe (`farthest` is that distance in tiles).
 */
export function pickSeaMonster(rng: Rng, world: World, x: number, y: number, farthest: number): MonsterDef {
  const home = world.anchorOf(0, 0);
  const d = isqrt(wrapDist2(x, y, home.x, home.y, world.width, world.height));
  const ranked = [...pools.water].sort((a, b) => a.xp - b.xp || a.id - b.id);
  // the sea monsters share the distance in equal parts, the weakest the nearest; the strongest (the Octobeast, stronger than most of level 5) only stands
  // beyond two thirds of the way to the far side of the globe, for the parts end at 1.4 times that distance
  const part = Math.min(ranked.length - 1, Math.floor((d * ranked.length) / Math.max(1, Math.floor(farthest * 1.4))));
  void rng;
  return ranked[part]!;
}
