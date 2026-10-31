import { SPELLS } from "./tables";

/**
 * Spell scrolls as loot (34th playtest): every spell of the sheet lies exactly `SPELL_COPIES` times in the world, each copy in a different cave, dungeon or castle of the spell's
 * own level (if the world has such places), in a chest, barrel, heap of treasure or bookshelf of that place. Guilds and the shops of the towns sell scrolls as before, and
 * nothing else in the game generates one (`generateItem` never does), so "exactly twice" holds for the loot.
 */
export const SPELL_COPIES = 2;

/** The old items "Book shelf" and "Book shelf (old)": containers since the 34th playtest (searched once, they may hold a scroll), never plain decoration. */
export const BOOKSHELVES: readonly number[] = [75, 97];
export const isBookshelf = (item: unknown): boolean => BOOKSHELVES.includes(Number(item));

/** Highest spell level of the places of level 1 to 4 (the bands of the guilds: `GUILD_SPELL_LEVELS` in `sim/economy.ts`, level 1 spells included in the first); level 5 has the rest. */
const BAND_END: readonly number[] = [5, 10, 15, 20];

/** The level of the places (1 to 5) whose loot holds a spell of this spell level. */
export function spellTier(spellLevel: number): number {
  const band = BAND_END.findIndex((end) => spellLevel <= end);
  return band < 0 ? 5 : band + 1;
}

/** The spells whose scrolls lie in the places of a level, by id. */
export function spellsOfTier(tier: number): number[] {
  return Object.values(SPELLS)
    .filter((s) => spellTier(s.level) === tier)
    .map((s) => s.id)
    .sort((a, b) => a - b);
}
