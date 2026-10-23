import type { Rng } from "../core/rng";
import { MONSTER_IDS, MONSTERS, walksOnLand, type MonsterDef } from "../data/tables";
import { isqrt, wrapDist2 } from "./islands";
import type { Poi } from "./types";
import type { World } from "./world";

/**
 * How hard the overworld is at a spot, and which monster belongs there. The treasure level of a monster (the sheet's entity 24) says roughly on
 * which island it lives, its XP (entity 23) is the fine tuning: next to Starthaven the weakest monsters of level 1, the harder ones of level 1 the
 * nearer one comes to a town of level 2, and the first monsters of level 2 stand right at that town; then the stronger ones of level 2 towards the
 * town of level 3, and so on.
 *
 * Both are numbers in thousandths of a level: `levelAt` = level of the island * 1000 + how far along the way to the next town the spot lies,
 * `monsterLevel` = treasure level * 1000 + the rank of the monster by XP among the monsters of its level. Integers only (no float in the generator).
 */

/** The ground of level 5 has no town to walk towards: it gets harder the farther one is from the town of level 5, over this many tiles. */
const LAST_LEVEL_REACH = 40;
/** How much of the way to the next town counts as "all the way": the spots next to that town are rare, a seventh of the stretch is left over. */
const FULL_WAY = 800;

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

function nearestTown(world: World, towns: readonly Poi[], x: number, y: number): number {
  let best = Infinity;
  for (const t of towns) best = Math.min(best, wrapDist2(x, y, t.x, t.y, world.width, world.height));
  return best === Infinity ? -1 : isqrt(best);
}

/** How far the land of a level of the start island lies from Starthaven: the nearest and the farthest tile of it, in tiles. */
const spans = new WeakMap<World, Map<number, { min: number; max: number }>>();

function startSpan(world: World, tier: number): { min: number; max: number } | null {
  let byTier = spans.get(world);
  if (!byTier) spans.set(world, (byTier = new Map()));
  const known = byTier.get(tier);
  if (known) return known;
  const home = world.poiById("p:0:0:0");
  const isl = world.islands[0];
  if (!home || !isl) return null;
  let min = Infinity;
  let max = 0;
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
  const span = { min: min === Infinity ? 0 : min, max };
  byTier.set(tier, span);
  return span;
}

/**
 * The position along the way to the next town (0 to 1000): 0 at a town of the island's own level, 1000 at the town of the next level. Levels 1 and 2
 * share the start island: there the way is the distance from Starthaven, 0 at the nearest tile of the level's half and 1000 at the farthest, so that
 * the weakest monsters of level 1 stand next to Starthaven and the weakest of level 2 where level 2 begins, not in the middle of its scale (25th playtest).
 */
export function wayAt(world: World, x: number, y: number, level: number): number {
  const span = level <= 2 ? startSpan(world, level) : null;
  const home = span ? world.poiById("p:0:0:0") : null;
  if (span && home && span.max > span.min) {
    const d = isqrt(wrapDist2(x, y, home.x, home.y, world.width, world.height));
    return Math.max(0, Math.min(1000, Math.floor(((d - span.min) * 1000) / (span.max - span.min))));
  }
  const own = nearestTown(world, townsOfLevel(world, level), x, y);
  if (own < 0) return 500;
  if (level >= 5) return Math.min(1000, Math.floor((own * 1000) / LAST_LEVEL_REACH));
  const next = nearestTown(world, townsOfLevel(world, level + 1), x, y);
  if (next < 0 || own + next === 0) return 0;
  return Math.floor((own * 1000) / (own + next));
}

/** The level of the spot in thousandths: the level of the island (`World.tierAt`) and the way to the next town. */
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

/** The monsters that roam the overworld without a hut, the sheet's "x". `water`: those of the open sea, else those that walk. */
function wildPool(water: boolean): MonsterDef[] {
  return MONSTER_IDS.map((id) => MONSTERS[id]!).filter((m) => m.outside === "wild" && (water ? m.terrain === "water" : walksOnLand(m)));
}
const pools = { land: wildPool(false), water: wildPool(true) };

/**
 * A wild monster for a spot: the monsters of the sheet's "x" whose place on the scale lies within `WILD_WINDOW` of the level of the spot, the nearer the
 * more likely. The way to the next town only reaches `FULL_WAY` of the scale, so that the hardest monsters of a level are not left for a single tile.
 */
export function pickWildMonster(rng: Rng, world: World, x: number, y: number, water: boolean): MonsterDef {
  const all = water ? pools.water : pools.land;
  const tier = world.tierAt(x, y);
  // on land the monsters are those of the level of the island: the hardest of level 1 do not stand at the border of level 2 (25th playtest)
  const own = water ? [] : all.filter((m) => m.treasure_level === tier);
  const pool = own.length > 0 ? own : all;
  // levels 1 and 2 have their way measured over their whole half of the start island already (`wayAt`); the others keep the last seventh free
  const way = tier <= 2 ? wayAt(world, x, y, tier) : Math.min(1000, Math.floor((wayAt(world, x, y, tier) * 1000) / FULL_WAY));
  const here = tier * 1000 + way;
  const weights = pool.map((m) => Math.max(0, 1000 - Math.floor((Math.abs(monsterLevel(m.id) - here) * 1000) / WILD_WINDOW)));
  if (weights.every((w) => w === 0)) {
    // nothing within reach (the sea of level 1 has no monster of its own): the one nearest on the scale
    return [...pool].sort((a, b) => Math.abs(monsterLevel(a.id) - here) - Math.abs(monsterLevel(b.id) - here) || a.id - b.id)[0]!;
  }
  return pool[rng.weightedIndex(weights)]!;
}
