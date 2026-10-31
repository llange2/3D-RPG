import { LAYER, rngFor, type SeedState } from "../core/rng";
import { SPELL_COPIES, spellsOfTier } from "../data/spell-loot";
import type { Poi } from "../world/types";

/**
 * Which spell scrolls lie in which cave, dungeon or castle of the world (34th playtest). Every spell lies `SPELL_COPIES` (2) times, each copy in a place of the spell's own
 * level (`spellTier`: spell levels 1 to 5 in the places of level 1, 6 to 10 in level 2, 11 to 15, 16 to 20, from 21 in level 5), the two copies in different places whenever the
 * level has more than one. The unit is the whole world, like the key chain: a place gets the scrolls that the fewest others have, by chance among equals. A level the world has no
 * place for (a small world can lack one) lends its scrolls to the nearest level that has places. The pyramids (`excluded`) hold none: their inside is the spaceship. A pure
 * function of the world seed and the places; what a place does with its scrolls is `actions/spellScrolls.ts`.
 */
export function planSpellLoot(rootSeed: SeedState, pois: readonly Poi[], excluded: ReadonlySet<string>): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const places = pois.filter((p) => (p.kind === "cave" || p.kind === "dungeon" || p.kind === "castle") && !excluded.has(p.id));
  if (places.length === 0) return out;
  const rng = rngFor(rootSeed, LAYER.LOOT, "spell-plan");
  const load = new Map<string, number>(places.map((p) => [p.id, 0]));
  for (let tier = 1; tier <= 5; tier++) {
    // the nearest level that has a place (the lower one first)
    let pool: Poi[] = [];
    for (let d = 0; d <= 4 && pool.length === 0; d++) pool = places.filter((p) => p.tier === tier - d || p.tier === tier + d);
    if (pool.length === 0) continue;
    const give = (id: number, besides: ReadonlySet<string>): string => {
      let open = pool.filter((p) => !besides.has(p.id));
      if (open.length === 0) open = pool;
      const least = Math.min(...open.map((p) => load.get(p.id)!));
      const tied = open.filter((p) => load.get(p.id)! === least);
      const poi = tied[rng.int(tied.length)]!;
      load.set(poi.id, least + 1);
      out.set(poi.id, [...(out.get(poi.id) ?? []), id]);
      return poi.id;
    };
    for (const id of rng.shuffle(spellsOfTier(tier))) {
      const used = new Set<string>();
      for (let copy = 0; copy < SPELL_COPIES; copy++) used.add(give(id, used));
    }
  }
  return out;
}
