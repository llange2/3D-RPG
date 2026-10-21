/**
 * The three kinds of castle of the generated world: good, neutral and evil. Each flies its banner (old items 103 to 105) and keeps its own
 * monsters, the lists the user named. A good castle has no roaming monsters at all: its only monsters are the guards of its treasure vaults.
 */
import type { Rng } from "../core/rng";
import { MONSTERS } from "./tables";

export const ALIGNMENTS = ["good", "neutral", "evil"] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

/** Old item ids of the banners: Decoration Good, Neutral and Evil Banner. */
export const BANNER: Record<Alignment, number> = { good: 103, neutral: 104, evil: 105 };

/** Monster ids (MONSTER_DATA) of each kind of castle. */
export const CASTLE_MONSTERS: Record<Alignment, readonly number[]> = {
  // Archer, Black Knight, Castle Guard, Draconi, Jouster, Paladin, Sorcerer
  good: [1, 3, 8, 20, 36, 54, 66],
  // Barbarian, Black Knight, Castle Guard, Cleric of Moo, Cursed Fool, Draconi, Mad Dwarf, Ninja, Sonic Ninja, Sorcerer, Troll, Wizard
  neutral: [2, 3, 8, 9, 12, 20, 39, 49, 65, 66, 72, 79],
  // Castle Guard, Cursed Fool, Dark Pegasus, Fire Lizard, Gargoyle, Ogre, Scorpia, Shadow Rogue, Troll, Wizard
  evil: [8, 12, 14, 25, 27, 51, 61, 63, 72, 79],
};

/** Weights (permille) of the three kinds by biome: a lava land breeds evil castles, the rest is mixed. */
export const ALIGNMENT_WEIGHTS: Record<"lava" | "other", Record<Alignment, number>> = {
  lava: { good: 100, neutral: 250, evil: 650 },
  other: { good: 340, neutral: 330, evil: 330 },
};

export function pickAlignment(rng: Rng, lava: boolean): Alignment {
  const w = ALIGNMENT_WEIGHTS[lava ? "lava" : "other"];
  return ALIGNMENTS[rng.weightedIndex(ALIGNMENTS.map((a) => w[a]))]!;
}

const level = (id: number): number => MONSTERS[id]?.treasure_level ?? 5;

/**
 * The monsters of a castle at a tier: those of its list whose treasure level (the old game's own 1 to 5 grouping of how deep a monster belongs)
 * is not above the tier. A list with nothing that low (a good castle on the first tier has only the Castle Guard) gives its weakest monsters.
 */
export function castleMonsters(alignment: Alignment, tier: number): number[] {
  const all = CASTLE_MONSTERS[alignment];
  const fit = all.filter((id) => level(id) <= tier);
  if (fit.length > 0) return [...fit];
  const lowest = Math.min(...all.map(level));
  return all.filter((id) => level(id) === lowest);
}

/** The strongest monsters the castle has at the tier, one step deeper than the rest of the place: the guard of the main vault and the boss. */
export function castleBosses(alignment: Alignment, tier: number): number[] {
  const pool = castleMonsters(alignment, Math.min(5, tier + 1));
  const top = Math.max(...pool.map(level));
  return pool.filter((id) => level(id) === top);
}
