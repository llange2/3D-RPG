/**
 * The quests of the generated world as the user's quest document (`.ignore/quests_1.3.md`, table "Generierung") names them: which layouts a
 * quest can be built in, at which levels and with which kind of monsters. A cave or dungeon of the world gets exactly one of them
 * (`world/questPlan.ts`); the castles and the spaceship are places of their own. Pure data: no DOM, no Babylon.
 */

export const QUEST_IDS = ["quest_1", "quest_2", "quest_3", "quest_4", "quest_5", "quest_6"] as const;
export type QuestId = (typeof QUEST_IDS)[number];

export const DUNGEON_LAYOUTS = ["dungeon_1", "dungeon_2", "dungeon_3", "dungeon_4"] as const;
export const CAVE_LAYOUTS = ["cave_1", "cave_2", "cave_3"] as const;
export type LayoutId = (typeof DUNGEON_LAYOUTS)[number] | (typeof CAVE_LAYOUTS)[number] | "castle_1" | "spaceship_1";

/** The groups of the monster sheet (`MonsterDef` group column). */
export type MonsterGroup = "beast" | "plant" | "humanoid" | "monster_humanoid" | "magical_construct" | "undead" | "robot";
export const LAND_GROUPS: readonly MonsterGroup[] = ["beast", "plant", "humanoid", "monster_humanoid", "magical_construct", "undead"];

export interface QuestDef {
  id: QuestId;
  /** The name in the document, for the log and the debug menu. */
  name: string;
  layouts: readonly LayoutId[];
  /** Groups a place of this quest draws its monsters from ("alle außer robot"; water monsters never come ashore). */
  groups: readonly MonsterGroup[];
}

export const QUESTS: Readonly<Record<QuestId, QuestDef>> = {
  quest_1: { id: "quest_1", name: "The Moaning Statues", layouts: ["dungeon_2", "dungeon_4"], groups: LAND_GROUPS }, // (quest document 1.3: never in the maze, the field of statues needs a hall)
  quest_2: { id: "quest_2", name: "Direction of Faces", layouts: ["dungeon_1", "dungeon_2", "dungeon_3", "dungeon_4"], groups: LAND_GROUPS },
  quest_3: { id: "quest_3", name: "The Gongs", layouts: ["dungeon_4", "cave_1", "cave_2", "cave_3"], groups: ["beast", "plant"] },
  quest_4: { id: "quest_4", name: "Calculations", layouts: ["dungeon_1", "dungeon_2", "dungeon_3", "dungeon_4"], groups: LAND_GROUPS },
  quest_5: { id: "quest_5", name: "The Final Boss", layouts: [...DUNGEON_LAYOUTS, ...CAVE_LAYOUTS], groups: LAND_GROUPS },
  quest_6: { id: "quest_6", name: "Riddle", layouts: [...DUNGEON_LAYOUTS, ...CAVE_LAYOUTS], groups: LAND_GROUPS },
};

/** Quest 6 is also built in a castle (levels 2 to 4) and in the spaceship (level 5, robots only). */
export const CASTLE_TIERS = [2, 3, 4] as const;

/**
 * Quest 5: the population (60 % of the monsters) and the boss that leads it (the user's list; the boss is the monster sheet's "Boss for" note).
 * The level of the place comes from the population, never from the boss.
 */
export const BOSS_PAIRS: readonly { population: number; boss: number }[] = [
  { population: 10, boss: 81 }, // Cobra Fiend > Cult Leader
  { population: 13, boss: 82 }, // Cyclops > Cyclops King
  { population: 33, boss: 83 }, // Green Dragon > Dragon Lord
  { population: 23, boss: 84 }, // Evil Eye > Eye Master
  { population: 45, boss: 85 }, // Minotaur > Minotaur King
  { population: 59, boss: 86 }, // Priest of Moo > Moo Master
  { population: 47, boss: 87 }, // Mummy > Mummy King
  { population: 36, boss: 89 }, // Jouster > Top Jouster
  { population: 73, boss: 90 }, // Vampire > Vampire King
  { population: 46, boss: 91 }, // Moose Rat > Rat Overlord
];

/** Quest items: the nine keys (items 17 to 25), the five key cards of the pyramids and the black key card that the king gives. */
export const KEY_COLORS = ["blue", "black", "bronze", "golden", "green", "orange", "red", "silver", "rainbow"] as const;
export type KeyColor = (typeof KEY_COLORS)[number];
export const CARD_COLORS = ["blue", "red", "green", "purple", "brown"] as const;
export type CardColor = (typeof CARD_COLORS)[number];

export const keyType = (c: KeyColor): string => `quest_key_${c}`;
export const cardType = (c: CardColor): string => `quest_${c}_keycard`;
/** The black key card: the king hands it over for the orbs, it works the console of the spaceship's bridge. */
export const BLACK_CARD = "quest_black_keycard";
export const ORB = "quest_orb";
/** The silver skull the Skull Miser buys, and how many of them end his quest. */
export const SKULL = "quest_silver_skull";
export const SKULLS_FOR_RING = 5;
export const COIN = "quest_quatloo_coin";
/** The Pearl of Youth and Beauty (ue_quest_4, quest document 1.4): 20 of them lie in the places of level 3 and 4, the pirate queen pays for them. */
export const PEARL = "quest_pearl_of_youth";
export const PEARLS_IN_WORLD = 20;
/** The pirate queen's reward for every pearl: experience for each hero and gold for the party. */
export const PEARL_XP = 100_000;
export const PEARL_GOLD = 50_000;

/**
 * The engines of the spaceship (quest_7, quest document 1.5): once they run, `low_engine_hum` (ambient sound 9) plays for good inside the ship, below the music.
 * The level is a share of the effects volume: the hum is about as loud as the cyber music in the file, the music plays at 0.45 and the effects at 0.7, and 0.35
 * put the hum about 7 dB under the music, which was too quiet: 0.7 (twice as loud, user 6. 11. 2026) is the second version, to be judged by ear. The flag is set by the control room's computer; Esc > Debug can set it for testing.
 */
/** The computer terminal (old item 68): its messages show on the ComputerScreen. */
export const COMPUTER_ITEM = 68;
export const ENGINES_FLAG = "ship:engines";
export const ENGINE_HUM_SOUND = 9;
export const ENGINE_HUM_LEVEL = 0.7;

/** The old items that show a quest item on the map (the key and key card models); the rest are drawn as the place's chest. */
export const QUEST_PROP: Readonly<Record<string, number>> = {
  quest_key_blue: 17,
  quest_key_black: 18,
  quest_key_bronze: 19,
  quest_key_golden: 20,
  quest_key_green: 21,
  quest_key_orange: 22,
  quest_key_red: 23,
  quest_key_silver: 24,
  quest_key_rainbow: 25,
  quest_black_keycard: 64,
  quest_blue_keycard: 65,
  quest_red_keycard: 66,
  quest_green_keycard: 122,
  quest_purple_keycard: 123,
  quest_brown_keycard: 124,
};

/** The orbs of ultimate power (document "ue_quest_3"): 31 in the world, 2 for every section of the spaceship and the rest on the level 5 dungeons. */
export const ORBS_IN_WORLD = 31;
export const ORBS_PER_SECTION = 2;
export const SECTIONS = 5;
/**
 * The sections of the spaceship (quest document 1.5, quest_7), by the number a pyramid opens. The order is the one of the document: the bridge in front, behind
 * it the control room with life support beside it, then the storage bay and the engine room at the end.
 */
export const SECTION_NAMES = ["Bridge", "Control Room", "Life Support", "Storage Bay", "Engine Room"] as const;
export const BRIDGE = 0;
export const CONTROL_ROOM = 1;
export const LIFE_SUPPORT = 2;
export const STORAGE_BAY = 3;
export const ENGINE_ROOM = 4;
/** The bridge holds no orbs (document 1.5): 2 in each of the other four sections, so 8 in the ship and the other 23 on the level 5 dungeons. */
export const ORBS_IN_SPACESHIP = ORBS_PER_SECTION * (SECTIONS - 1);
/** The power crystal (quest item): the two spare ones lie in crates of the storage bay and mend the broken crystals of the engine room and of life support. */
export const POWER_CRYSTAL = "quest_power_crystal";
/** What the party has done in the ship, kept in `state.opened`: the crystal of life support, the crystal of the engine room (the engines are then "functional"); the engines activated are `ENGINES_FLAG` ("ready"). */
export const LIFE_FLAG = "ship:life";
export const ENGINE_CRYSTAL_FLAG = "ship:engine";
/**
 * The objects of the spaceship that have no old item (the user's models, quest document 1.5). They are pseudo item numbers above the old table, so that
 * the actions keep their `item` param: the crate of the storage bay, the broken power crystal and the console of the bridge (`OWN_MODELS` in `render/interiorProps.ts`).
 */
export const CRATE_ITEM = 301;
export const BROKEN_CRYSTAL_ITEM = 302;
export const CONSOLE_ITEM = 303;
/** The console is 3 times its file (1.5 times the first size, 3 units wide: a cell) and may reach into the cells around it; this many cells around it stay free of objects (user, 6. 11. 2026). */
export const CONSOLE_SCALE = 3;
export const CONSOLE_CLEAR = 2;
/** The intact power crystal is old item 67. */
export const POWER_CRYSTAL_ITEM = 67;
export const ORBS_FOR_KING = 11;

/** Keys and key cards a single end room may hold, by world size (document: "0 bis 3 je nach Weltgröße"). */
export const MAX_ITEMS_PER_ROOM: Readonly<Record<string, number>> = { small: 1, default: 2, large: 3, huge: 3 };

/** Gold, treasure and the like in an end room of a level (document, table "Loot"): the ranges the generator draws from. Spells are no part of it since the 34th playtest: they lie in the containers of the places (`planSpellLoot`), exactly twice in the world. */
export interface EndLoot {
  gold: [number, number];
  /** Attribute points in packages of `package` points: [min, max] packages; null for none. */
  attributes: { packages: [number, number]; package: number } | null;
  /** Levels the party gains: [min, max]; null for none. */
  levelUps: [number, number] | null;
  treasure: [number, number];
}

export const END_LOOT: Readonly<Record<number, EndLoot>> = {
  1: { gold: [5_000, 10_000], attributes: { packages: [1, 2], package: 5 }, levelUps: null, treasure: [5, 10] },
  2: { gold: [10_000, 50_000], attributes: { packages: [1, 2], package: 10 }, levelUps: null, treasure: [5, 10] },
  3: { gold: [50_000, 200_000], attributes: { packages: [1, 2], package: 20 }, levelUps: null, treasure: [5, 10] },
  4: { gold: [200_000, 1_000_000], attributes: null, levelUps: [1, 3], treasure: [5, 10] },
  5: { gold: [1_000_000, 4_000_000], attributes: null, levelUps: null, treasure: [5, 10] },
};

/** Monster counts scale with the size of the world (document, "Goldene Regeln"); the XP of a single monster scale the other way, so that the sum stays. */
export const SIZE_SCALE: Readonly<Record<string, number>> = { small: 2 / 3, default: 1, large: 4 / 3, huge: 5 / 3 };
