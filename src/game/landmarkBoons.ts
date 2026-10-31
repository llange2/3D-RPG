import { LAYER, rngFor } from "../core/rng";
import { BOON_SOURCE, type BoonSource } from "../data/boon-texts";
import { MAP_ITEMS } from "../data/tables";
import { landmarkItemAt } from "../render/terrainMesher";
import { ATTRIBUTES, type BoonKey } from "../sim/types";
import { boonAmount } from "../sim/boons";
import { DECO } from "../world/types";
import type { World } from "../world/world";

/**
 * Which fountains and giant stone heads of the open land are magic (the plain well is not, 35th playtest) (35th playtest): about one in three. A pure function of the world seed and the tile, so the map, the
 * game and the tests agree, and no save has to remember it. The level of the land decides the points (`boonAmount`: +5 on level 1 up to +25 on level 5, twice that in percent for a resistance).
 */
export interface LandmarkBoon {
  source: BoonSource;
  stat: BoonKey;
  amount: number;
  /** Picks the words (`boonText`). */
  pick: number;
}

/** What stands on a landmark tile, by the name of its old item (for the mouse-over of the map). */
export function landmarkName(world: World, x: number, y: number): string {
  return MAP_ITEMS[landmarkItemAt(world.wrapX(x), world.wrapY(y))]?.name.trim() ?? "Landmark";
}

const STATS: readonly BoonKey[] = [...ATTRIBUTES, "res_fire", "res_ice", "res_acid", "res_magic"];

/** Out of three fountains and stone heads, one is magic. */
export const BOON_ONE_IN = 3;

export function landmarkBoon(world: World, x: number, y: number): LandmarkBoon | null {
  const wx = world.wrapX(x);
  const wy = world.wrapY(y);
  if (world.tile(wx, wy).deco !== DECO.LANDMARK) return null;
  const source = BOON_SOURCE[landmarkItemAt(wx, wy)];
  if (!source) return null;
  const rng = rngFor(world.rootSeed, LAYER.LOOT, "boon", wx, wy);
  if (rng.int(BOON_ONE_IN) !== 0) return null;
  const stat = STATS[rng.int(STATS.length)]!;
  return { source, stat, amount: boonAmount(world.tierAt(wx, wy), stat), pick: rng.int(1000) };
}
