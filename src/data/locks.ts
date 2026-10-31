import { MAP_ITEMS } from "./tables";

/**
 * Thievery difficulty of the locks (docs/THIEVERY_SCHLOESSER.md). A lock is picked with `thieveryRoll` (`sim/character.ts`): the best roll of the party has to reach the
 * difficulty. The numbers come from `tools/balance/thievery.ts` (`--anchor=entry --ref=ninja --hardref=ninja`): the median ninja (Gnome Ninja, thievery 20) with the
 * typical gear of the tier, at the level the party has when it enters the tier (1 / 5 / 11 / 19 / 33), opens
 *  - an ordinary chest ("simple check") four times in five,
 *  - a king's chest ("hard check") every second time.
 * Index = tier 1 to 5. Doors, gates, barrels, wells and chalices have no lock.
 * `tests/unit/thievery.test.ts` recomputes both rows with the simulator: when gear, attributes or the roll change, run the tool again and change the numbers here.
 */
export const CHEST_LOCK: readonly number[] = [1, 9, 23, 42, 83];
export const KING_CHEST_LOCK: readonly number[] = [2, 13, 33, 60, 119];

const at = (table: readonly number[], tier: number): number => table[Math.min(table.length, Math.max(1, Math.round(tier))) - 1]!;

/** Difficulty of the lock of an ordinary chest in a place of `tier`. */
export const chestLock = (tier: number): number => at(CHEST_LOCK, tier);

/** Difficulty of the lock of a king's chest in a castle of `tier`. */
export const kingChestLock = (tier: number): number => at(KING_CHEST_LOCK, tier);

/**
 * Whether the chest of a `treasure` action has an ordinary lock: a real chest (wooden, noble, iron, sapphire), not the one of a quest (a key, a key card, an orb),
 * not one that has a lock of its own (the king's chests, a chest the quest keeps shut) and not a vessel of attribute points.
 */
export function hasOrdinaryLock(params: Record<string, unknown>): boolean {
  if (typeof params.quest === "string" || typeof params.bonus === "string" || params.lock !== undefined) return false;
  return MAP_ITEMS[Number(params.chest)]?.name.startsWith("Chest") === true;
}
