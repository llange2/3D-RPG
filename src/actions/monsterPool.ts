import type { DungeonTheme } from "../data/dungeon-themes";
import { MONSTERS } from "../data/tables";

const levelOf = (monster: number): number => MONSTERS[monster]!.treasure_level;

/**
 * The monsters of a themed place that fit a tier: the ones up to the tier's own level (a tier-1 place keeps its weakest monsters,
 * as the plain generator does), or the weakest of the theme if all of them are above it.
 */
export function themeMonsters(t: DungeonTheme, tier: number): number[] {
  const fit = t.monsters.filter((id) => levelOf(id) <= tier);
  if (fit.length > 0) return fit;
  const weakest = Math.min(...t.monsters.map(levelOf));
  return t.monsters.filter((id) => levelOf(id) === weakest);
}

/**
 * The boss of a themed place: the theme's own, or, where that one is too strong for the tier (one level above it is allowed, and
 * not at all on tier 1), the strongest of the other monsters that fits.
 */
export function themeBoss(t: DungeonTheme, tier: number): number {
  const limit = Math.min(5, tier + (tier >= 2 ? 1 : 0));
  const byStrength = [t.boss, ...[...t.monsters].sort((a, b) => levelOf(b) - levelOf(a))];
  return byStrength.find((id) => levelOf(id) <= limit) ?? themeMonsters(t, tier)[0]!;
}
