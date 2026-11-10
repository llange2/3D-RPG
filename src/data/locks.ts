import { MAP_ITEMS } from "./tables";

/**
 * Thievery difficulty of the locks (docs/THIEVERY_SCHLOESSER.md). A lock is picked with `thieveryRoll` (`sim/character.ts`): the roll of the best thief of the party has to reach the difficulty.
 *
 * The difficulty is not stored in the place: the generator only says that a lock is there (`difficulty` is a marker, 1), the number is worked out when the party tries it, from the level of the
 * party, like the damage of a trap (`trapDamageFor`). The roll grows with the level (skill = (luck/accuracy + thievery) x level x 0.1), so a fixed number per tier was trivial from the middle of
 * the tier on (the 36th playtest log: a ninja of level 10 against 9, every roll was above it). Now the lock grows with the hero in step with it: for the median ninja the chance is the same on
 * every level of a tier. The tier still counts at the bottom: a party that comes too early (below `TIER_ENTRY`) finds the lock of the entry and fails more often. Above the tier the lock keeps
 * growing with the party (no clamp at `TIER_EXIT`), so a hero who stays in the places of a lower tier meets the same chance as everywhere else.
 *
 *   difficulty = HARDNESS[kind] x refSkill(level) x ease(level) x gear(level)
 *
 * Only ONE hero rolls: the active hero with the highest thievery skill (`pickLock` in `actions/handlers.ts`), not every hero with the best roll counting. The numbers below are for that one hero.
 *
 * `refSkill` is the skill of the median ninja (Gnome Ninja, thievery 20) with the typical gear, fitted to `tools/balance/thievery.ts --lever` (within 7 % from level 3 on). A roll is uniform between a
 * third of the skill and the skill, so the chance of a hero with the skill S against the difficulty D is 1.5 x (1 - D / S): HARDNESS 0.52 gives the median ninja about 70 % at an ordinary chest, the thief
 * (a third more skill) about 90 %, a party without both much less often (the best other hero rolls alone). The king's chest is harder (ninja about 35 %, thief 60 %), a door easier (ninja 90 %).
 * The numbers come from `npx tsx tools/balance/thievery.ts --lever --chest=0.7 --king=0.35 --door=0.9`; `tests/unit/thievery.test.ts` recomputes the chances with the simulator.
 * Levels 1 to 3 have an easier lock (`lockEase`) so that the player gets into the game. Barrels, wells, chalices and the chests of the quests have no lock.
 */
export type LockKind = "chest" | "king chest" | "door";

export const LOCK_HARDNESS: Readonly<Record<LockKind, number>> = { chest: 0.52, "king chest": 0.76, door: 0.39 };

/**
 * The skill of a thief grows faster than `refSkill` from level 10 on, because a thief wears the ring made for him: a Ring of the Thief (+15 accuracy, +15 luck) adds 15 to the term
 * (luck + accuracy) / 2 + thievery, a third of the skill. The simulator rolls two random rings, so the fit of `refSkill` does not contain it. Journal of 10 Nov 2026 (ninja, L13 save): skill against
 * `refSkill` 0.93 to 0.96 on level 4 to 9 (no rings, the chance was right), 1.04 on level 10, 1.14 on level 11, 1.35 on level 12 (the ring), and every one of 31 attempts from level 10.5 on succeeded.
 * The factor lifts the lock to 1.15 on level 11 and 1.3 from level 12 on: the ninja with the ring has about 77 % at a chest, the one without it about 50 %. Below level 10 it is 1.
 */
export function lockGear(level: number): number {
  return 1 + 0.3 * Math.min(1, Math.max(0, (level - 10) / 2));
}

/** The levels a tier is meant for (the design bands of the combat simulator, `KAMPF_BALANCE.md` 4.1); index = tier 1 to 5. */
export const TIER_ENTRY: readonly number[] = [1, 5, 11, 19, 33];
export const TIER_EXIT: readonly number[] = [4, 10, 18, 32, 50];

/** One time in five a failed attempt sets off the trap of the chest (permille, `Rng.chance`). */
export const LOCK_FUMBLE_CHANCE = 200;

/** The skill of the median ninja at a level (fitted to the simulator). */
export function refSkill(level: number): number {
  return level * (3.8 + 0.055 * level);
}

/** How much easier the lock is on the first levels: 0.4 / 0.6 / 0.8 on level 1 / 2 / 3, 1 from level 4. */
export function lockEase(level: number): number {
  return Math.min(1, 0.2 + 0.2 * level);
}

/**
 * The party level a lock is worked out for: the level of the party, not below the entry of the tier and not above the exit of the NEXT tier (tier 5 has none).
 * Two journals of 10 Nov 2026 set the two limits:
 *  - a lock frozen at the exit of its own tier (tier 1: level 4, difficulty 8) was picked 41 times out of 41 by a ninja of party level 5 to 8.5, so the lock has to grow beyond the tier;
 *  - a tier 1 door worked out for level 46 (difficulty 114) was out of reach of a ninja of level 46 with the attributes of level 1 (skill 216, 71 % a try, the same roll
 *    until the party steps), so the growth stops where the next tier ends: a tier 1 lock is never harder than the top of tier 2 (level 10, chest 23, door 17).
 * Levels 5 to 10 in tier 1 (the case of the first log) are unchanged.
 */
export function lockLevel(tier: number, level: number): number {
  const t = Math.min(TIER_ENTRY.length, Math.max(1, Math.round(tier))) - 1;
  const top = t + 1 < TIER_EXIT.length ? TIER_EXIT[t + 1]! : Infinity;
  return Math.min(top, Math.max(TIER_ENTRY[t]!, Math.round(level)));
}

/** What the best roll of the party has to reach to pick a lock of `kind` in a place of `tier`, for a party of the average level `level`. */
export function lockDifficulty(kind: LockKind, tier: number, level: number): number {
  const l = lockLevel(tier, level);
  return Math.max(1, Math.round(LOCK_HARDNESS[kind] * refSkill(l) * lockEase(l) * lockGear(l)));
}

/**
 * Whether the chest of a `treasure` action has an ordinary lock: a real chest (wooden, noble, iron, sapphire), not the one of a quest (a key, a key card, an orb),
 * not one that has a lock of its own (the king's chests, a chest the quest keeps shut) and not a vessel of attribute points.
 */
export function hasOrdinaryLock(params: Record<string, unknown>): boolean {
  if (typeof params.quest === "string" || typeof params.bonus === "string" || params.lock !== undefined) return false;
  return MAP_ITEMS[Number(params.chest)]?.name.startsWith("Chest") === true;
}
