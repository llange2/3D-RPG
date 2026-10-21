import { BIOME, type Biome, type PoiKind } from "../world/types";
import type { InteriorTheme } from "../interiors/types";
import type { Rng } from "../core/rng";
import type { DungeonTheme } from "./dungeon-themes";
import { themesOf } from "./monsters";

/**
 * Interior themes use the texture sets of the old game (`tex_dungeon_*`, `tex_fortress_*`, `tex_city_*`,
 * `tex_cyber_*`, `tex_cave*`, `tex_lava`, `tex_snow`). Variants (lava, ice, swamp) reuse the base textures
 * with a different ambient tint and fog, so the same few textures give many different looks.
 */
const base = {
  dungeon: {
    wall: "tex_dungeon_wall",
    floor: "tex_dungeon_floor",
    ceiling: "tex_dungeon_ceiling",
    door: "tex_dungeon_door",
    music: 3,
    open: false,
  },
  cave: { wall: "tex_cave", floor: "tex_cave", ceiling: "tex_cave_ceiling", door: "tex_dungeon_door2", music: 6, open: false },
  // the old game's fortress blocks (38 to 43) are walls and floors without a ceiling: a castle lies under the open sky, like a town
  fortress: {
    wall: "tex_fortress_wall",
    floor: "tex_fortress_floor",
    ceiling: null,
    door: "tex_fortress_door",
    music: 4,
    open: true,
  },
  cyber: { wall: "tex_cyber_wall", floor: "tex_cyber_floor", ceiling: "tex_cyber_ceiling", door: "tex_dungeon_door2", music: 5, open: false },
  town: { wall: "tex_city_wall", floor: "tex_city_floor", ceiling: null, door: "tex_city_door", music: 1, open: true },
} as const;

function theme(id: string, kind: keyof typeof base, ambient: string, fogColor: string, fogDensity: number, monsterThemes: Record<string, number>, lootLevelBias = 0): InteriorTheme {
  const b = base[kind];
  return { id, ...b, fog: { color: fogColor, density: fogDensity }, ambient, monsterThemes, lootLevelBias };
}

export const INTERIOR_THEMES: Record<string, InteriorTheme> = {
  dungeon: theme("dungeon", "dungeon", "#c9c2b8", "#0a0908", 0.075, { undead: 4, construct: 2, humanoid: 2, beast: 1 }),
  dungeon_lava: theme("dungeon_lava", "dungeon", "#ffa070", "#1c0803", 0.065, { fire: 5, undead: 2, construct: 1 }, 1),
  dungeon_ice: theme("dungeon_ice", "dungeon", "#a9c6ee", "#050a14", 0.07, { cold: 5, undead: 2, beast: 1 }, 1),
  dungeon_swamp: theme("dungeon_swamp", "dungeon", "#b4c79a", "#070b05", 0.085, { undead: 5, beast: 2, aquatic: 1 }),
  fortress: theme("fortress", "fortress", "#f0ebe0", "#c9e2f2", 0.008, { humanoid: 4, undead: 3, construct: 1 }),
  fortress_ice: theme("fortress_ice", "fortress", "#d2e0fa", "#dde8f0", 0.011, { humanoid: 3, cold: 4, undead: 1 }, 1),
  fortress_lava: theme("fortress_lava", "fortress", "#ffcfa8", "#a85a38", 0.012, { humanoid: 3, fire: 4, construct: 1 }, 1),
  cave: theme("cave", "cave", "#bdb4a6", "#070605", 0.08, { beast: 5, undead: 1, aquatic: 1 }),
  cave_lava: theme("cave_lava", "cave", "#ff9a64", "#1a0802", 0.07, { fire: 5, beast: 2 }, 1),
  cave_ice: theme("cave_ice", "cave", "#a4c4f0", "#050a14", 0.075, { cold: 5, beast: 2 }, 1),
  cave_swamp: theme("cave_swamp", "cave", "#a9bd8e", "#060a04", 0.09, { beast: 3, aquatic: 3, undead: 2 }),
  cyber: theme("cyber", "cyber", "#a8e0ff", "#02060a", 0.05, { cyber: 6, construct: 2 }, 2),
  town: theme("town", "town", "#ffffff", "#c9e2f2", 0.006, {}),
  town_desert: theme("town_desert", "town", "#ffe8bf", "#e8d4a0", 0.008, {}),
  town_snow: theme("town_snow", "town", "#e2ecff", "#dde8f0", 0.01, {}),
  town_swamp: theme("town_swamp", "town", "#cfd9b8", "#8c9a82", 0.014, {}),
  town_lava: theme("town_lava", "town", "#ffd0a8", "#a85a38", 0.012, {}),
};

/**
 * Chooses the interior theme of a POI from its kind and biome. Uses the interior stream of the POI. The cyber look is the
 * pyramid's (its inside is the spaceship), no other dungeon has it.
 */
export function pickInteriorTheme(kind: PoiKind, biome: Biome, _tier: number, _rng: Rng, pyramid = false): InteriorTheme {
  const variant = (suffix: Partial<Record<Biome, string>>, fallback: string): string => suffix[biome] ?? fallback;
  switch (kind) {
    case "dungeon":
      if (pyramid) return INTERIOR_THEMES.cyber!;
      return INTERIOR_THEMES[variant({ [BIOME.LAVA]: "dungeon_lava", [BIOME.SNOW]: "dungeon_ice", [BIOME.SWAMP]: "dungeon_swamp" }, "dungeon")]!;
    case "cave":
      return INTERIOR_THEMES[variant({ [BIOME.LAVA]: "cave_lava", [BIOME.SNOW]: "cave_ice", [BIOME.SWAMP]: "cave_swamp" }, "cave")]!;
    case "castle":
      return INTERIOR_THEMES[variant({ [BIOME.LAVA]: "fortress_lava", [BIOME.SNOW]: "fortress_ice" }, "fortress")]!;
    case "town":
      return INTERIOR_THEMES[variant({ [BIOME.DESERT]: "town_desert", [BIOME.SNOW]: "town_snow", [BIOME.SWAMP]: "town_swamp", [BIOME.LAVA]: "town_lava" }, "town")]!;
  }
}

/** The monster families of a dungeon theme's monsters, by how many of its monsters belong to each (for ambushes and the like). */
function familyMix(t: DungeonTheme): Record<string, number> {
  const mix: Record<string, number> = {};
  for (const id of [...t.monsters, t.boss]) for (const family of themesOf(id)) mix[family] = (mix[family] ?? 0) + 1;
  return mix;
}

/** The look of a place (its texture family and mood) with the monsters of its dungeon theme. */
export function withDungeonTheme(look: InteriorTheme, t: DungeonTheme): InteriorTheme {
  return { ...look, monsterThemes: familyMix(t) };
}
