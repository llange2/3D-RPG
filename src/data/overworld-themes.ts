import { BIOME, type Biome, type PoiKind } from "../world/types";

/**
 * Data-driven overworld themes. One entry per biome: look (sky, fog, tint), audio zone, monster family,
 * loot bias, deco density in permille per tile and the weights that decide which POI kinds appear.
 */
export interface OverworldTheme {
  biome: Biome;
  id: string;
  sky: { zenith: string; horizon: string };
  fog: { color: string; density: number };
  /** Multiplies the ground texture colour. */
  tint: string;
  /** Zone number as used by the old sound.py (2 = outside). */
  music: number;
  monsterTheme: string;
  lootLevelBias: number;
  deco: { tree: number; bush: number; tuft: number };
  poi: { anchor: Record<PoiKind, number>; secondary: Record<PoiKind, number> };
}

const ANCHOR_DEFAULT: Record<PoiKind, number> = { town: 60, castle: 25, dungeon: 10, cave: 5 };
// the mix of places on the old outside map: 8 dungeon entrances, 5 caves, 5 villages, 3 castles (and a pyramid)
const SECONDARY_DEFAULT: Record<PoiKind, number> = { dungeon: 34, cave: 22, castle: 14, town: 30 };

export const OVERWORLD_THEMES: Record<Biome, OverworldTheme> = {
  [BIOME.MEADOW]: {
    biome: BIOME.MEADOW,
    id: "meadow",
    sky: { zenith: "#3f7fd0", horizon: "#bfe0f5" },
    fog: { color: "#c9e2f2", density: 0.011 },
    tint: "#ffffff",
    music: 2,
    monsterTheme: "beast",
    lootLevelBias: 0,
    deco: { tree: 110, bush: 45, tuft: 90 },
    poi: { anchor: ANCHOR_DEFAULT, secondary: SECONDARY_DEFAULT },
  },
  [BIOME.FOREST]: {
    biome: BIOME.FOREST,
    id: "forest",
    sky: { zenith: "#376aa8", horizon: "#a9cbb4" },
    fog: { color: "#a8c4b0", density: 0.016 },
    tint: "#e4f2de",
    music: 2,
    monsterTheme: "beast",
    lootLevelBias: 0,
    deco: { tree: 330, bush: 70, tuft: 60 },
    poi: {
      anchor: { town: 50, castle: 20, dungeon: 15, cave: 15 },
      secondary: { dungeon: 30, cave: 30, castle: 10, town: 30 },
    },
  },
  [BIOME.DESERT]: {
    biome: BIOME.DESERT,
    id: "desert",
    sky: { zenith: "#4b8fd6", horizon: "#f0d9a0" },
    fog: { color: "#e8d4a0", density: 0.013 },
    tint: "#fff0cc",
    music: 2,
    monsterTheme: "desert",
    lootLevelBias: 1,
    deco: { tree: 60, bush: 18, tuft: 25 },
    poi: {
      anchor: { town: 45, castle: 30, dungeon: 20, cave: 5 },
      secondary: { dungeon: 38, cave: 12, castle: 18, town: 32 },
    },
  },
  [BIOME.SNOW]: {
    biome: BIOME.SNOW,
    id: "snow",
    sky: { zenith: "#5d86b8", horizon: "#dce8f2" },
    fog: { color: "#dde8f0", density: 0.017 },
    tint: "#eef4ff",
    music: 2,
    monsterTheme: "cold",
    lootLevelBias: 1,
    deco: { tree: 180, bush: 15, tuft: 30 },
    poi: {
      anchor: { town: 40, castle: 35, dungeon: 15, cave: 10 },
      secondary: { dungeon: 28, cave: 36, castle: 14, town: 22 },
    },
  },
  [BIOME.SWAMP]: {
    biome: BIOME.SWAMP,
    id: "swamp",
    sky: { zenith: "#4a5d58", horizon: "#9aa88a" },
    fog: { color: "#8c9a82", density: 0.024 },
    tint: "#d6dfc4",
    music: 2,
    monsterTheme: "undead",
    lootLevelBias: 1,
    deco: { tree: 200, bush: 85, tuft: 60 },
    poi: {
      anchor: { town: 45, castle: 15, dungeon: 25, cave: 15 },
      secondary: { dungeon: 36, cave: 28, castle: 8, town: 28 },
    },
  },
  [BIOME.LAVA]: {
    biome: BIOME.LAVA,
    id: "lava",
    sky: { zenith: "#4a2a2a", horizon: "#c8683a" },
    fog: { color: "#a85a38", density: 0.022 },
    tint: "#ffd2b0",
    music: 2,
    monsterTheme: "fire",
    lootLevelBias: 2,
    deco: { tree: 0, bush: 0, tuft: 12 },
    poi: {
      anchor: { town: 25, castle: 30, dungeon: 30, cave: 15 },
      secondary: { dungeon: 42, cave: 28, castle: 12, town: 18 },
    },
  },
  [BIOME.OCEAN]: {
    biome: BIOME.OCEAN,
    id: "ocean",
    sky: { zenith: "#3b78c4", horizon: "#b9dcef" },
    fog: { color: "#bcdcee", density: 0.012 },
    tint: "#ffffff",
    music: 2,
    monsterTheme: "aquatic",
    lootLevelBias: 0,
    deco: { tree: 0, bush: 0, tuft: 0 },
    poi: { anchor: ANCHOR_DEFAULT, secondary: SECONDARY_DEFAULT },
  },
};
