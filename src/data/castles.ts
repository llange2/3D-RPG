/**
 * The three castles of the generated world (quest document 1.2, castle_1): a good, a neutral and an evil one, on the islands of level 2, 3 and 4. Each
 * flies its banner (old items 103 to 105), has its own statues, throne and king, and its guards are of one group of the monster sheet. Pure data: no DOM, no Babylon.
 */
import type { Rng } from "../core/rng";
import type { MonsterGroup } from "./quest-table";
import { MONSTER_IDS, MONSTERS, monsterGroup, walksOnLand } from "./tables";

export const ALIGNMENTS = ["good", "neutral", "evil"] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

/** Old item ids of the banners: Decoration Good, Neutral and Evil Banner. */
export const BANNER: Record<Alignment, number> = { good: 103, neutral: 104, evil: 105 };

/** The statues of a castle: one of the two kinds, the same kind for every statue of the castle. */
export const CASTLE_STATUES: Record<Alignment, readonly [number, number]> = { good: [28, 27], neutral: [95, 61], evil: [34, 95] };

/** Old item ids of the throne and the persona of the king in front of it. */
export const THRONE: Record<Alignment, number> = { good: 30, neutral: 30, evil: 6 };
export const KING: Record<Alignment, number> = { good: 58, neutral: 59, evil: 60 };

/** The group of the monster sheet the guards of each kind of castle come from. */
export const GUARD_GROUP: Record<Alignment, MonsterGroup> = { good: "humanoid", neutral: "magical_construct", evil: "undead" };

/** The words the king speaks when the party has no orb to give. */
export const KING_GREETING: Record<Alignment, string> = {
  good: "The good king says: \"Brave travellers, I need eleven Orbs of ultimate power to keep my realm safe from the other two. Bring them to me.\"",
  neutral: "The king says: \"I care little for good or evil. But whoever holds eleven Orbs of ultimate power rules this world. Bring them to me.\"",
  evil: "The evil king hisses: \"Eleven orbs, and the world is mine. Bring them to me, and I may let you live.\"",
};

/** Weights (permille) of the three kinds by biome, for a castle that is not part of a world's plan (a hand-made one in a test). */
export const ALIGNMENT_WEIGHTS: Record<"lava" | "other", Record<Alignment, number>> = {
  lava: { good: 100, neutral: 250, evil: 650 },
  other: { good: 340, neutral: 330, evil: 330 },
};

export function pickAlignment(rng: Rng, lava: boolean): Alignment {
  const w = ALIGNMENT_WEIGHTS[lava ? "lava" : "other"];
  return ALIGNMENTS[rng.weightedIndex(ALIGNMENTS.map((a) => w[a]))]!;
}

const level = (id: number): number => MONSTERS[id]?.treasure_level ?? 5;

/** The land monsters of a kind of castle, weakest first (the bosses of quest 5 are no guards). */
export function guardPool(alignment: Alignment): number[] {
  return MONSTER_IDS.filter((id) => monsterGroup(id) === GUARD_GROUP[alignment] && walksOnLand(MONSTERS[id]!) && !MONSTERS[id]!.name.includes("King") && !MONSTERS[id]!.name.includes("Master") && !MONSTERS[id]!.name.includes("Lord") && !MONSTERS[id]!.name.includes("Leader")).sort((a, b) => level(a) - level(b) || a - b);
}

/**
 * The two kinds of guard of a castle (document: "Leichte Wachen entsprechen dem Level des Schlosses, schwere Wachen dem Level des Schlosses +1. Sollte es kein
 * entsprechendes Monster des richtigen Typs für das Level geben, wird das nächst höhere Monster genommen"). Exactly two different monsters per castle.
 */
export function guardsOf(alignment: Alignment, tier: number, rng: Rng): { light: number; heavy: number } {
  const pool = guardPool(alignment);
  // the monster of the level asked for, or the weakest of the next level that has one, or the strongest there is
  const forLevel = (wanted: number, not?: number): number => {
    const fits = pool.filter((id) => id !== not);
    const from = fits.filter((id) => level(id) >= wanted);
    if (from.length === 0) return fits[fits.length - 1]!;
    const lowest = level(from[0]!);
    const same = from.filter((id) => level(id) === lowest);
    return same[rng.int(same.length)]!;
  };
  const light = forLevel(tier);
  const heavy = forLevel(tier + 1, light);
  return { light, heavy };
}
