import type { Rng } from "../core/rng";
import type { Ruleset } from "../core/ruleset";
import monsterThemesRaw from "./monsterThemes.json";
import { MONSTERS, monsterIdsOf, walksOnLand, type MonsterDef } from "./tables";

const THEMES_BY_ID = monsterThemesRaw as Record<string, string[]>;

export const MONSTER_THEME_NAMES = ["undead", "beast", "fire", "cold", "aquatic", "humanoid", "construct", "cyber", "desert"] as const;

export function themesOf(id: number): string[] {
  return THEMES_BY_ID[String(id)] ?? [];
}

/** Monsters of a theme sorted by id, of the rule set's table (Classic's own unless Fantastic Islands is asked). */
export function monstersOfTheme(theme: string, ruleset: Ruleset = "classic"): MonsterDef[] {
  return monsterIdsOf(ruleset).filter((id) => themesOf(id).includes(theme)).map((id) => MONSTERS[id]!);
}

/**
 * How dangerous a monster is: hit points and armour (what the party has to chew through) times the damage it deals per
 * round. The old `treasure_level` is only a rough 1-5 grouping; this value orders all 91 monsters smoothly.
 */
export function monsterThreat(m: MonsterDef): number {
  const perRound = ((m.damage_min + m.damage_max) / 2) * m.no_of_attacks * (m.speed >= 30 ? 1.2 : 1);
  return (m.health + m.armor * 6) * Math.sqrt(perRound) * (1 + m.res_magic / 100);
}

/** Position of every monster of a rule set in the threat ranking, 0 = weakest, 1 = most dangerous (the ranking of Fantastic Islands has the extension in it, Classic's does not). */
const percentiles = new Map<Ruleset, Map<number, number>>();
function percentileMap(ruleset: Ruleset): Map<number, number> {
  let known = percentiles.get(ruleset);
  if (!known) {
    const sorted = [...monsterIdsOf(ruleset)].sort((a, b) => monsterThreat(MONSTERS[a]!) - monsterThreat(MONSTERS[b]!) || a - b);
    known = new Map(sorted.map((id, i) => [id, i / (sorted.length - 1)]));
    percentiles.set(ruleset, known);
  }
  return known;
}

export function threatPercentile(id: number, ruleset: Ruleset = "classic"): number {
  return percentileMap(ruleset).get(id) ?? 0;
}

/** Share of the threat ranking that is appropriate at a tier: tier 1 only meets the weakest monsters. */
const BANDS: [number, number][] = [
  [0, 0.2],
  [0.1, 0.4],
  [0.3, 0.62],
  [0.5, 0.82],
  [0.7, 1],
];

export function tierBand(tier: number): [number, number] {
  return BANDS[Math.min(BANDS.length, Math.max(1, Math.round(tier))) - 1]!;
}

/**
 * Picks one monster of the theme that fits `tier` by its threat ranking, and by the old game's own difficulty grouping, its
 * `treasure_level` (1 to 5): a monster above the tier is kept for deeper places. The threat ranking alone let Wicked Witches
 * (16'000 XP) and Barbarians (25'000 XP) into tier 1, where the old game's first maps hold goblins, bats and rats of 250 to
 * 2'500 XP, so a single generated castle took a party from level 1 to level 10. If the theme has nothing in the band, the monster
 * of the theme closest to the middle of the band is used, but never one above the tier: the snowy first tier once got Sorcerers and
 * Wizards because the cold family has no monster below treasure level 2. A theme with nothing at or below the tier lends the beasts
 * (the water monsters of an aquatic theme excepted, they have no land kin). `allowWater` is false on land: the four water monsters only
 * appear in aquatic themes.
 */
export function pickMonster(rng: Rng, theme: string, tier: number, allowWater = false, ruleset: Ruleset = "classic"): MonsterDef {
  const pool = monstersOfTheme(theme, ruleset).filter((m) => allowWater || walksOnLand(m));
  // a theme without land monsters ("aquatic") never puts its water monsters on dry ground: piranhas stranded in a cave cannot move
  const all = pool.length > 0 ? pool : allowWater ? monstersOfTheme(theme, ruleset) : monstersOfTheme("beast", ruleset).filter(walksOnLand);
  const [lo, hi] = tierBand(tier);
  const mid = (lo + hi) / 2;
  const percentile = (id: number): number => threatPercentile(id, ruleset);
  const fromPool = (list: MonsterDef[]): MonsterDef | null => {
    const fitting = list.filter((m) => m.treasure_level <= tier);
    if (fitting.length === 0) return null;
    const inBand = fitting.filter((m) => {
      const p = percentile(m.id);
      return p >= lo && p <= hi;
    });
    if (inBand.length > 0) return inBand[rng.int(inBand.length)]!;
    return [...fitting].sort((a, b) => Math.abs(percentile(a.id) - mid) - Math.abs(percentile(b.id) - mid) || a.id - b.id)[0]!;
  };
  const own = fromPool(all);
  if (own) return own;
  // nothing at or below the tier: water monsters have no land kin, the weakest of them it is; on land the beasts fill in
  if (all.some((m) => m.terrain === "water")) return [...all].sort((a, b) => a.treasure_level - b.treasure_level || percentile(a.id) - percentile(b.id) || a.id - b.id)[0]!;
  const kin = fromPool(monstersOfTheme("beast", ruleset).filter(walksOnLand));
  if (kin) return kin;
  return [...all].sort((a, b) => a.treasure_level - b.treasure_level || percentile(a.id) - percentile(b.id) || a.id - b.id)[0]!;
}

/** Whether the theme has a monster that lives on dry ground. */
export function hasLandMonster(theme: string, ruleset: Ruleset = "classic"): boolean {
  return monstersOfTheme(theme, ruleset).some(walksOnLand);
}

/**
 * Chooses a theme by integer weights, then a monster of it. The places this serves (interiors, ambushes) have no water to swim
 * in, so themes made of water monsters are left out unless `allowWater` is set.
 */
export function pickMonsterWeighted(rng: Rng, themeWeights: Record<string, number>, tier: number, allowWater = false, ruleset: Ruleset = "classic"): MonsterDef {
  const names = Object.keys(themeWeights).filter((n) => (themeWeights[n] ?? 0) > 0 && (allowWater || hasLandMonster(n, ruleset)));
  if (names.length === 0) return pickMonster(rng, "beast", tier, false, ruleset);
  const theme = names[rng.weightedIndex(names.map((n) => themeWeights[n]!))]!;
  return pickMonster(rng, theme, tier, allowWater && theme === "aquatic", ruleset);
}
