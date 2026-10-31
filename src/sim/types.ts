/** Plain serializable game state. No classes, so a save is JSON.stringify of the state. */

export const CONDITIONS = [
  "Rotten",
  "Dead",
  "Petrified",
  "Unconscious",
  "Paralyzed",
  "Sleeping",
  "Poisoned",
  "Diseased",
  "Crazy",
  "Cursed",
  "Weak",
  "Drunk",
  "Lovestruck",
  "Blessed",
  "Healthy",
] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Conditions that stop a character from acting (CHARACTER_CONDITIONS = false in the old g.py). */
export const INCAPACITATED: readonly Condition[] = ["Rotten", "Dead", "Petrified", "Unconscious", "Paralyzed", "Sleeping"];

export type Attribute = "str" | "int" | "per" | "end" | "spd" | "acc" | "lck";
export const ATTRIBUTES: readonly Attribute[] = ["str", "int", "per", "end", "spd", "acc", "lck"];

export type BonusKey =
  | Attribute
  | "res_fire"
  | "res_ice"
  | "res_acid"
  | "res_magic"
  | "dam_min"
  | "dam_max"
  | "ranged_dam_min"
  | "ranged_dam_max"
  | "arm";
export type Bonus = Partial<Record<BonusKey, number>>;

export interface Item {
  /** Unique within a save; empty until the party picks the item up. */
  id: string;
  name: string;
  type: string;
  material: number;
  /** Texture key of the inventory icon, for example `item_1h_long_sword_iron`. */
  texture: string;
  value: number;
  quest: boolean;
  /** Non-zero for spell scrolls. */
  spellId: number;
  bonus: Bonus;
}

export const EQUIPMENT_SLOTS = ["helmet", "body_armor", "left_hand", "right_hand", "belt", "left_ring", "right_ring", "boots", "ranged_weapon"] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export const BAG_SLOTS = Array.from({ length: 20 }, (_, i) => `slot${i + 1}`);
export type Slot = EquipmentSlot | string;

export type Inventory = Record<string, Item | null>;

export type ClassName = "Knight" | "Paladin" | "Archer" | "Cleric" | "Wizard" | "Thief" | "Ninja" | "Barbarian" | "Druid" | "Ranger";
export type RaceName = "Elf" | "Gnome" | "Human" | "Dwarf" | "Orc";

export interface Character {
  name: string;
  classType: ClassName;
  raceType: RaceName;
  /** Portrait key, `character01`..`character22`. */
  avatar: string;
  level: number;
  xp: number;
  str: number;
  int: number;
  per: number;
  end: number;
  spd: number;
  acc: number;
  lck: number;
  resFire: number;
  resIce: number;
  resAcid: number;
  resMagic: number;
  thievery: number;
  /** Maximum and current health and mana. */
  health: number;
  hp: number;
  mana: number;
  sp: number;
  conditions: Condition[];
  /** Game minute at which a timed condition runs out (`sim/conditions.ts`). Absent in older saves, `normalizeParty` fills it in. */
  conditionDue?: Partial<Record<Condition, number>>;
  defensiveStance: boolean;
  spells: number[];
  inventory: Inventory;
  /** Game minute of the birth. Absent: the hero was 18 at the start of the game (`ageOf`). */
  born?: number;
  /** Years that magic added (Resurrect, Divine Intervention, aging monsters); the old `magic_additional_age`. */
  magicAge?: number;
  /** Spell effects that live on the hero alone (`CharacterMods`). */
  mods?: CharacterMods;
  /** Lloyd's Beacon: the fire this hero lit, and the only one the hero can go back to. */
  beacon?: Place;
}

/** Where a party can stand: the same two shapes as `Location` of the game state, kept here so that `sim` does not depend on it. */
export type Place =
  | { mode: "overworld"; x: number; y: number; facing: "N" | "E" | "S" | "W" }
  | { mode: "interior"; poiId: string; x: number; y: number; facing: "N" | "E" | "S" | "W"; ret: { x: number; y: number; facing: "N" | "E" | "S" | "W" } };

/**
 * Spells that change one hero. Stone Skin and Rage run for 12 hours (their `TimedEffect` takes them off again), Dimensional Rift
 * counts monster turns and ends when the party moves.
 */
export interface CharacterMods {
  /** Stone Skin: armor added, and the hero's speed is halved. */
  stoneSkin?: number;
  /** Rage: damage added to every blow and shot, and the hero's armor is halved. */
  rage?: number;
  /** Dimensional Rift: monster turns left. The hero cannot act and nothing can hit them. */
  rift?: number;
  /** Temporary points on an attribute or a resistance (a well, fountain or stone head of the open land, `sim/boons.ts`); each key goes with its `TimedEffect` of kind `boon`. */
  boon?: Partial<Record<BoonKey, number>>;
}

/** What a boon of the open land raises: an attribute, or a resistance in percent. */
export type BoonKey = Attribute | "res_fire" | "res_ice" | "res_acid" | "res_magic";

export interface TimedEffect {
  kind: "light" | "levitate" | "walk_on_water" | "protection" | "blessed" | "wizard_eye" | "stone_skin" | "rage" | "power_shield" | "detect_monster" | "boon";
  /** The attribute or resistance a `boon` raises. */
  stat?: BoonKey;
  /** Game minute at which the effect ends. */
  until: number;
  /** Walk on Water ran out while the party was in deep water: it holds until the party leaves it (`advanceTime`). */
  held?: boolean;
  character?: number;
  element?: "acid" | "fire" | "ice" | "magic";
  amount?: number;
}

/**
 * The spell cast last, for the quick-cast entry of the spell menu (the old game kept a `last_spell` per hero). The caster is
 * named instead of numbered, so swapping heroes in the inn cannot point it at somebody else.
 */
export interface LastCast {
  caster: string;
  spellId: number;
  /** Hero a heal, cure or blessing was meant for, and the element of a protection spell. */
  target?: number;
  element?: "acid" | "fire" | "ice" | "magic";
}

export interface Party {
  characters: Character[];
  /** The spell cast last by anybody. Absent in older saves and until the first spell is cast; the per-hero spells are `lastCasts` (a save from before them has only this one). */
  lastCast?: LastCast;
  /** The spell each hero cast last, by name (the old game kept a `last_spell` per hero; 36th playtest, point 5). */
  lastCasts?: Record<string, LastCast>;
  gold: number;
  bankGold: number;
  food: number;
  /** Game time in minutes since the start. */
  minutes: number;
  talents: string[];
  /** Titles and feats of the party. The old game kept this list but never awarded anything, so it stays empty for now. */
  achievements: string[];
  /** Heroes waiting in the inn for a place in the party: made there, or replaced (the old `unused_characters`). */
  reserve: Character[];
  effects: TimedEffect[];
  /** Counter for unique item ids. */
  itemCounter: number;
  /** Ids of defeated monster groups and similar one-off facts live in the save deltas, not here. */
  mascot: string;
  /** The mascots the party has met in the endless world (the campaign keeps its own list in its progress). */
  mascots: string[];
  /** The Donkey carries a bag of its own (20 slots, like a hero's backpack); only filled while the Donkey is the mascot. */
  mascotBag: Inventory;
}

export const ELEMENTS = ["acid", "fire", "ice", "magic"] as const;
