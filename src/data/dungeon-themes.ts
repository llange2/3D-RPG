/**
 * Dungeon themes of the generated world, after the maps of the old game (docs/DUNGEON_THEMES.md). A theme says who lives in a
 * place (monsters, boss), which trap it has, what stands in it (props by old item id), which quest it is built around and how
 * it takes part in the key chain. Pure data: no DOM, no Babylon.
 */
import type { PoiKind } from "../world/types";

/** Colours of the keys (`quest_key_<colour>`) that open a Class B dungeon. */
export const KEY_COLORS = ["blue", "orange", "green", "red", "golden", "black"] as const;
export type KeyColor = (typeof KEY_COLORS)[number];

/** Colours of the key cards (`quest_<colour>_keycard`) that open a pyramid. */
export const CARD_COLORS = ["blue", "black", "brown", "green", "purple"] as const;
export type CardColor = (typeof CARD_COLORS)[number];

/** The quest item type of a key (exactly the type the door asks for, so finder and door can never disagree). */
export const keyType = (c: KeyColor): string => `quest_key_${c}`;
/** The quest item type of a key card. */
export const cardType = (c: CardColor): string => `quest_${c}_keycard`;

/**
 * A: free to enter, may hold keys. B: needs one key, may hold one key card. C: a pyramid, needs a key card; its inside is the
 * spaceship (class D of the document), which holds no key and no card and pays out a lot.
 */
export type DungeonClass = "A" | "B" | "C";

/** Who lives here decides what may stand here (chapter 3 of the document). */
export type Inhabitants = "vermin" | "goblinoid" | "human" | "mage" | "undead" | "fire" | "dragon" | "construct";

export type ThemeTrap = "guillotine" | "spring" | "pit" | "steal_gold" | "generic" | "none";

/** Main quests a theme can be built around; the ones the generator builds are listed in `QUEST_BUILT`. */
export type QuestId = "gongs" | "head_ring" | "head_rotation" | "levers" | "jump_field" | "map_picture" | "riddle_statues" | "coordinates" | "none";

export interface DungeonTheme {
  id: string;
  /** Name of the old map, for the log and the entry prompt. */
  name: string;
  /** One line for the entry prompt. */
  blurb: string;
  /** Which kinds of place can hold it. */
  kinds: PoiKind[];
  klass: DungeonClass;
  /** Difficulty tiers (of the place) it can stand at. */
  tier: [number, number];
  inhabitants: Inhabitants;
  /** Monster ids of the ordinary groups. Two to four types counting the boss. */
  monsters: number[];
  boss: number;
  trap: ThemeTrap;
  /** Element of a `generic` trap; absent = by chance from the trap's uid. */
  trapElement?: "fire" | "ice" | "acid" | "magic";
  /** Old item ids of the decoration (weights are equal). */
  props: number[];
  /** Old item id of the objects that hold loot. */
  chest: number;
  /** Old item id of the objects that bless the party (crystal, altar, well, chalice), or null for none. */
  shrine: number | null;
  quest: QuestId;
  /** Class B: the key the entrance asks for. */
  needsKey?: KeyColor;
  /** Class A: the keys it holds (0 to 2). */
  givesKeys: KeyColor[];
  /** Class B: the key card it may hold. */
  givesCard?: CardColor;
  /**
   * Talents sold inside (`data/talent-sellers.ts`): the generator stands one seller for each in a side passage. No theme has any now: the
   * people of the old caves (the lords of the Arachnoid Cavern) stand in castles, the altars of Fountain Head Cavern became the rusty caravans
   * (the user's object list allows personas only in castles and towns, head statues not in caves).
   */
  talents?: readonly string[];
  /** Added to the level of the chests, and the gold in percent of the usual. */
  loot: { level: number; gold: number };
  /** Relative frequency among the themes that fit. */
  weight: number;
}

/** Old item ids that do not belong to a kind of inhabitant (chapter 3 of the document). */
export const FORBIDDEN_PROPS: Record<Inhabitants, readonly number[]> = {
  // spiders and beasts use no furniture, no books, no fire place
  vermin: [94, 14, 75, 97, 15, 104, 105, 71],
  // wild folk have no ritual circle, no altar, no shelf and no banners of orderly realms
  goblinoid: [35, 73, 75, 97, 104, 105],
  // orderly folk do not decorate with bones and hanging skeletons
  human: [70, 93],
  mage: [5],
  undead: [5, 14, 94],
  fire: [75, 97, 117],
  dragon: [94, 14, 15, 75, 97, 104, 105],
  construct: [70, 62, 127, 93, 5],
};

const theme = (t: Omit<DungeonTheme, "givesKeys" | "loot" | "weight"> & Partial<Pick<DungeonTheme, "givesKeys" | "loot" | "weight">>): DungeonTheme => ({ givesKeys: [], loot: { level: 0, gold: 100 }, weight: 10, ...t });

export const DUNGEON_THEMES: readonly DungeonTheme[] = [
  // ---------------------------------------------------------------- class A: free
  theme({
    id: "arachnoid_cavern",
    name: "Arachnoid Cavern",
    blurb: "Webs and gnawed bones. Giant spiders have nested here.",
    kinds: ["cave"],
    klass: "A",
    tier: [1, 4],
    inhabitants: "vermin",
    monsters: [30, 18],
    boss: 70,
    trap: "none",
    props: [70, 117, 73],
    chest: 70,
    shrine: 117,
    quest: "gongs",
    givesKeys: ["blue", "orange"],
  }),
  theme({
    id: "cursed_cold_cavern",
    name: "Cursed Cold Cavern",
    blurb: "A witch's lair. The cold here is not natural.",
    kinds: ["cave"],
    klass: "A",
    tier: [2, 4],
    inhabitants: "mage",
    monsters: [7, 77],
    boss: 3,
    trap: "guillotine",
    props: [88, 73, 83],
    chest: 74,
    shrine: 88,
    quest: "riddle_statues",
    givesKeys: ["black"],
  }),
  theme({
    id: "cyclops_cavern",
    name: "Cyclops Cavern",
    blurb: "Gnawed bones and one-eyed giants.",
    kinds: ["cave"],
    klass: "A",
    tier: [2, 5],
    inhabitants: "goblinoid",
    monsters: [78, 5, 13],
    boss: 82,
    trap: "spring",
    props: [70, 37, 12, 13],
    chest: 74,
    shrine: 37,
    quest: "none",
    givesKeys: ["green", "red"],
  }),
  theme({
    id: "magic_cavern",
    name: "Magic Cavern",
    blurb: "Runes glow on the altars. Liches sleep in the sarcophagi.",
    kinds: ["cave"],
    klass: "A",
    tier: [4, 5],
    inhabitants: "mage",
    monsters: [34, 66],
    boss: 38,
    trap: "none",
    props: [35, 127, 73, 117],
    chest: 127,
    shrine: 35,
    quest: "none",
    givesKeys: ["golden"],
  }),
  theme({
    id: "dragon_cavern",
    name: "Dragon Cavern",
    blurb: "Skulls on spikes warn you: turn around before it is too late.",
    kinds: ["cave"],
    klass: "A",
    tier: [4, 5],
    inhabitants: "dragon",
    monsters: [20, 33],
    boss: 83,
    trap: "none",
    props: [4, 38, 70],
    chest: 4,
    shrine: null,
    quest: "none",
    loot: { level: 1, gold: 300 },
    weight: 6,
  }),
  theme({
    id: "temple_of_moo",
    name: "Temple of Moo",
    blurb: "Graves and gnawed bones around a priest of Moo.",
    kinds: ["dungeon"],
    klass: "A",
    tier: [1, 3],
    inhabitants: "undead",
    monsters: [64, 80],
    boss: 9,
    trap: "pit",
    props: [70, 1, 27, 73],
    chest: 1,
    shrine: null,
    quest: "none",
  }),
  theme({
    id: "slithercult_stronghold",
    name: "Slithercult Stronghold",
    blurb: "The cult's stronghold. Some of the floor is not what it seems.",
    kinds: ["dungeon"],
    klass: "A",
    tier: [2, 4],
    inhabitants: "mage",
    monsters: [6, 10, 24],
    boss: 81,
    trap: "guillotine",
    props: [29, 88, 74, 73],
    chest: 74,
    shrine: 88,
    quest: "jump_field",
  }),
  theme({
    id: "hideout",
    name: "Hideout",
    blurb: "A small den with a wooden chest and a few orcs.",
    kinds: ["cave"],
    klass: "A",
    tier: [1, 2],
    inhabitants: "goblinoid",
    monsters: [53, 31],
    boss: 51,
    trap: "none",
    props: [1, 5, 12, 13, 16],
    chest: 1,
    shrine: null,
    quest: "none",
    weight: 14,
  }),
  // ---------------------------------------------------------------- class A: below towns and castles, small places (tier 1 to 3)
  theme({
    id: "fountain_head_cavern",
    name: "Goblin Burrow",
    blurb: "Barrels, a rusty fireplace and a rat king.",
    kinds: ["cave"],
    klass: "A",
    tier: [1, 2],
    inhabitants: "goblinoid",
    monsters: [74, 46, 31],
    boss: 91,
    trap: "guillotine",
    // the statue heads of the old map are the altars that teach orientation, swimming and perception: they stand as the talent sellers, not as props
    props: [5, 12, 71, 83],
    chest: 1,
    shrine: null,
    quest: "riddle_statues",
  }),
  theme({
    id: "baywatch_cavern",
    name: "Baywatch Cavern",
    blurb: "Acid pools and the skeletons of earlier visitors.",
    kinds: ["cave"],
    klass: "A",
    tier: [1, 3],
    inhabitants: "vermin",
    monsters: [62, 4],
    boss: 55,
    trap: "pit",
    props: [70, 83],
    chest: 1,
    shrine: null,
    quest: "none",
  }),
  theme({
    id: "blistering_heights_cavern",
    name: "Blistering Heights Cavern",
    blurb: "Lava puddles and altars of the four elements.",
    kinds: ["cave"],
    klass: "A",
    tier: [3, 5],
    inhabitants: "fire",
    monsters: [26, 61],
    boss: 42,
    trap: "generic",
    trapElement: "fire",
    props: [35, 71, 38],
    chest: 74,
    shrine: 35,
    quest: "none",
  }),
  theme({
    id: "swamp_town_cavern",
    name: "Swamp Town Cavern",
    blurb: "Coffins, magic flames and two stern goddesses.",
    kinds: ["cave"],
    klass: "A",
    tier: [2, 4],
    inhabitants: "undead",
    monsters: [55, 61],
    boss: 60,
    trap: "generic",
    trapElement: "magic",
    props: [62, 35, 70, 32],
    chest: 1,
    shrine: 35,
    quest: "none",
  }),
  theme({
    id: "wildabar_cavern",
    name: "Wildabar Cavern",
    blurb: "Iron gates, barrels and a lever that does something.",
    kinds: ["cave"],
    klass: "A",
    tier: [1, 3],
    inhabitants: "goblinoid",
    monsters: [51, 56],
    boss: 77,
    trap: "spring",
    props: [5, 12, 71, 83],
    chest: 1,
    shrine: null,
    quest: "levers",
  }),
  theme({
    id: "dragontooth_dungeon",
    name: "Witches' Cellar",
    blurb: "Shelves, cauldrons and the smell of herbs.",
    kinds: ["dungeon"],
    klass: "A",
    tier: [3, 4],
    inhabitants: "mage",
    monsters: [77, 28],
    boss: 67,
    trap: "spring",
    props: [76, 97, 75, 15, 83, 88, 98],
    chest: 74,
    shrine: 88,
    quest: "none",
  }),
  theme({
    id: "whiteshield_dungeon",
    name: "Gnome Vault",
    blurb: "Bones of gnomes who tried to steal an elixir.",
    kinds: ["dungeon"],
    klass: "A",
    tier: [3, 5],
    inhabitants: "fire",
    monsters: [24, 41],
    boss: 42,
    trap: "guillotine",
    props: [70, 86, 71],
    chest: 74,
    shrine: 86,
    quest: "none",
  }),
  theme({
    id: "bloodreign_dungeon",
    name: "Bloodreign Dungeon",
    blurb: "Flames, banners and notes about where to dig.",
    kinds: ["dungeon"],
    klass: "A",
    tier: [3, 5],
    inhabitants: "mage",
    monsters: [65, 20],
    boss: 67,
    trap: "generic",
    trapElement: "fire",
    props: [93, 117, 70],
    chest: 74,
    shrine: 117,
    quest: "coordinates",
  }),
  // ---------------------------------------------------------------- class B: one key
  theme({
    id: "cathedral_of_carnage",
    name: "Cathedral of Carnage",
    blurb: "Dark flames on amethyst altars. The Moose King watches.",
    kinds: ["dungeon"],
    klass: "B",
    tier: [3, 5],
    inhabitants: "mage",
    monsters: [27, 9, 59],
    boss: 86,
    trap: "none",
    props: [125, 35, 29, 109],
    chest: 74,
    shrine: 35,
    quest: "head_rotation",
    needsKey: "blue",
    givesCard: "blue",
  }),
  theme({
    id: "fortress_of_fear",
    name: "Fortress of Fear",
    blurb: "Stone heads, coffins and levers everywhere.",
    kinds: ["dungeon"],
    klass: "B",
    tier: [3, 5],
    inhabitants: "undead",
    monsters: [7, 58, 47],
    boss: 87,
    trap: "none",
    props: [33, 62, 73, 98],
    chest: 62,
    shrine: null,
    quest: "head_ring",
    needsKey: "orange",
    givesCard: "black",
  }),
  theme({
    id: "halls_of_insanity",
    name: "Halls of Insanity",
    blurb: "Demonic eyes watch from magic flames and lion statues.",
    kinds: ["dungeon"],
    klass: "B",
    tier: [3, 5],
    inhabitants: "mage",
    monsters: [48, 44, 23],
    boss: 84,
    trap: "generic",
    trapElement: "magic",
    props: [27, 109],
    chest: 72,
    shrine: null,
    quest: "coordinates",
    needsKey: "green",
    givesCard: "brown",
    loot: { level: 1, gold: 300 },
  }),
  theme({
    id: "dark_warriors_keep",
    name: "Dark Warriors Keep",
    blurb: "Orderly warriors, set tables and statues with inscriptions.",
    kinds: ["dungeon"],
    klass: "B",
    tier: [3, 5],
    inhabitants: "human",
    monsters: [39, 24, 36],
    boss: 89,
    trap: "none",
    props: [94, 14, 28],
    chest: 74,
    shrine: 14,
    quest: "map_picture",
    needsKey: "red",
    givesCard: "green",
  }),
  theme({
    id: "maze_from_hell",
    name: "Maze from Hell",
    blurb: "Runes that send you back to the start, and worse.",
    kinds: ["dungeon"],
    klass: "B",
    tier: [5, 5],
    inhabitants: "vermin",
    monsters: [45, 43],
    boss: 85,
    trap: "none",
    props: [73, 109, 61],
    chest: 96,
    shrine: null,
    quest: "jump_field",
    needsKey: "golden",
    givesCard: "purple",
    loot: { level: 2, gold: 300 },
    weight: 6,
  }),
  theme({
    id: "tomb_of_terror",
    name: "Tomb of Terror",
    blurb: "Sarcophagi behind iron gates, and a thief's hand at every door.",
    kinds: ["dungeon"],
    klass: "B",
    tier: [4, 5],
    inhabitants: "undead",
    monsters: [64, 80, 28],
    boss: 90,
    trap: "steal_gold",
    props: [127, 29, 6, 109],
    chest: 127,
    shrine: null,
    quest: "none",
    needsKey: "black",
  }),
  // ---------------------------------------------------------------- class C: pyramid, with the spaceship inside
  theme({
    id: "pyramid",
    name: "Pyramid",
    blurb: "A pyramid with a slot for a key card. Something hums inside.",
    kinds: ["dungeon"],
    klass: "C",
    tier: [4, 5],
    inhabitants: "construct",
    monsters: [58, 56, 69],
    boss: 88,
    trap: "none",
    props: [67, 109, 117, 34],
    chest: 68,
    shrine: 86,
    quest: "none",
    loot: { level: 3, gold: 500 },
    weight: 10,
  }),
];

export const THEMES_BY_ID: Readonly<Record<string, DungeonTheme>> = Object.fromEntries(DUNGEON_THEMES.map((t) => [t.id, t]));

/** The effect a shrine of this kind tends to have (the old maps: crystals raise attributes, red wells heal, altars guard against the elements). */
export const SHRINE_EFFECT: Record<number, "resist" | "attribute" | "heal"> = { 117: "attribute", 88: "attribute", 14: "attribute", 35: "resist", 37: "heal", 86: "heal" };

/** The old items that show a quest item on the map (the keys and the black and purple key card); the rest are drawn as the place's chest. */
export const QUEST_PROP: Record<string, number> = {
  quest_key_blue: 17,
  quest_key_black: 18,
  quest_key_green: 21,
  quest_key_orange: 22,
  quest_key_red: 23,
  quest_black_keycard: 64,
  quest_purple_keycard: 123,
};

/** Themes with a quest the generator builds. Others only carry the quest as text in the document. */
export const QUEST_BUILT: readonly QuestId[] = ["none", "gongs", "riddle_statues", "coordinates", "map_picture", "jump_field", "head_ring", "head_rotation"];

/** Quests that need a hall of their own, set aside by the dungeon generator before the other rooms. */
export const HALL_QUESTS: readonly QuestId[] = ["map_picture", "jump_field", "head_ring", "head_rotation"];

/** Size of that hall, in cells (a ring of heads, a field of runes or a row of five heads and room to walk around them). */
export const HALL_SIZE = { w: 13, h: 11 } as const;
