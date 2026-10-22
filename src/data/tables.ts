/** Typed access to the tables exported from old_code/g.py (see tools/export/export_g_data.py). */
import ACTIONS_RAW from "./raw/ACTIONS.json";
import BASE_CLASS_RAW from "./raw/BASE_CLASS.json";
import BASE_RACE_RAW from "./raw/BASE_RACE.json";
import BLOCKS_RAW from "./raw/BLOCKS.json";
import constantsRaw from "./raw/constants.json";
import itextsRaw from "./raw/itexts.json";
import MONSTER_DATA_RAW from "./raw/MONSTER_DATA.json";
import MAP_ITEMS_RAW from "./raw/ITEMS.json";
import QUEST_ITEMS_RAW from "./raw/QUEST_ITEMS.json";
import rumorsRaw from "./raw/rumors.json";
import RIDDLES_RAW from "./raw/RIDDLES_MASTER.json";
import SPELLS_RAW from "./raw/SPELLS.json";
import SPELL_SHEET from "./spell-sheet.json";
import MONSTER_GROUPS from "./monster-groups.json";
import TALENTS_RAW from "./raw/TALENTS.json";
import textsRaw from "./raw/texts.json";

export type AttackType = "Physical" | "Fire" | "Ice" | "Acid" | "Magic" | "Poison";

export interface MonsterDef {
  id: number;
  name: string;
  armor: number;
  health: number;
  damage_min: number;
  damage_max: number;
  no_of_attacks: number;
  speed: number;
  xp: number;
  gold: number;
  treasure_level: number;
  attack_type: AttackType;
  terrain: "land" | "water";
  undead: boolean;
  icon_height: number;
  res_acid: number;
  res_fire: number;
  res_ice: number;
  res_magic: number;
  res_physical: number;
  special_abilties: string | null;
  preferred_enemy?: string | null;
  anim_path?: string;
  anim_scale?: number;
  anim_weapon?: string;
  anim_shield?: string;
  anim_attack_sound?: number;
}

export interface SpellDef {
  id: number;
  name: number;
  description: number;
  mana: number;
  level: number;
  category: string;
  type: string[];
  value: number;
  scales_with_level: boolean;
  heal_min: number;
  heal_max: number;
  dam_min?: number;
  dam_max?: number;
  dam_type?: string[];
  /** Name and description as the user's spell sheet has them (the old text table still carries the names of spells that were never built). */
  title: string;
  text: string;
  /** The rules in the sheet's own words (column Explanation), empty when it has none. */
  explanation: string;
}

export interface ClassDef {
  requirements: string;
  minimum: number;
  base_hp: number;
  spell_type: string | null;
  base_melee: number;
  base_ranged: number;
  thievery: number;
  base_level: number;
  valid_items: string[];
  base_mana?: number;
  [key: string]: unknown;
}

export interface RaceDef {
  base_hp: number;
  base_mana: number;
  res_fire: number;
  res_ice: number;
  res_acid: number;
  res_magic: number;
  thievery: number;
}

export interface BlockDef {
  block_id: number;
  name: string;
  obstacle: boolean;
  terrain: string;
  view_blocking: boolean;
  minimap_texture?: string;
}

export const MONSTERS: Record<number, MonsterDef> = Object.fromEntries(
  Object.entries(MONSTER_DATA_RAW as Record<string, Omit<MonsterDef, "id">>).map(([id, m]) => [Number(id), { ...m, id: Number(id) } as MonsterDef]),
);
export const MONSTER_IDS: number[] = Object.keys(MONSTERS).map(Number).sort((a, b) => a - b);

const SHEET = SPELL_SHEET as Record<string, { name: string; description: string; explanation: string }>;
export const SPELLS: Record<number, SpellDef> = Object.fromEntries(
  Object.entries(SPELLS_RAW as unknown as Record<string, Omit<SpellDef, "id" | "title" | "text" | "explanation">>).map(([id, s]) => {
    const sheet = SHEET[id];
    return [Number(id), { ...s, id: Number(id), title: sheet?.name ?? textsRaw[s.name] ?? `Spell ${id}`, text: sheet?.description ?? textsRaw[s.description] ?? "", explanation: sheet?.explanation ?? "" } as SpellDef];
  }),
);

/** The group a monster belongs to in the user's monster sheet ("undead", "beast", "humanoid", ...). */
export function monsterGroup(id: number): string {
  return (MONSTER_GROUPS as Record<string, string>)[String(id)] ?? "";
}
/** Undead by the sheet's group column, not by the old `undead` flag (Phantom, a ghost, was never flagged). */
export function isUndead(id: number): boolean {
  return monsterGroup(id) === "undead";
}
export const TALENTS = TALENTS_RAW as unknown as Record<string, { name: number; description: number; price: number; recalc_attribute_values?: boolean }>;

/**
 * Name and description of a talent as the player reads them. `talent_cave_explorer` points at the texts of the Prayer
 * Master in the old table (copy and paste slip, the game has no text of its own for it), so it would be listed twice.
 */
export function talentInfo(id: string): { name: string; description: string } {
  if (id === "talent_cave_explorer") return { name: "Cave Explorer", description: "Knows how to find the way through caves." };
  const t = TALENTS[id];
  return { name: t ? textsRaw[t.name] ?? id : id, description: t ? flowText(textsRaw[t.description] ?? "") : "" };
}

/** The old texts break their lines by hand to fit the old font; in a wider box those breaks only leave ragged edges. */
export function flowText(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}
/** 300 riddles of the old game, by id (1-300). Password locks and riddle puzzles use them. */
export const RIDDLES_MASTER = RIDDLES_RAW as unknown as Record<number, { question: string; answer: string }>;
export const BASE_CLASS = BASE_CLASS_RAW as unknown as Record<string, ClassDef>;
export const BASE_RACE = BASE_RACE_RAW as unknown as Record<string, RaceDef>;
export const BLOCKS = BLOCKS_RAW as unknown as Record<string, BlockDef>;
export const LEGACY_ACTIONS = ACTIONS_RAW as unknown as Record<string, { name: string; action_id: number; minimap_texture?: string }>;
/** Decorations of the old maps (chests, statues, levers, signs), by id. Not to be confused with equipment. */
export const MAP_ITEMS = MAP_ITEMS_RAW as unknown as Record<number, { name: string; obstacle: boolean; view_blocking: boolean; rotating: boolean }>;
export const QUEST_ITEMS = QUEST_ITEMS_RAW as unknown as { name: string; type: string; texture: string; value: number }[];

export const TEXTS: readonly string[] = textsRaw;
export const ITEXTS: readonly string[] = itextsRaw;
/** Tavern gossip of the old game. */
export const RUMORS: readonly string[] = rumorsRaw;

export const CONSTANTS = constantsRaw as unknown as {
  CHARACTER_XP: Record<string, number>;
  STANCE_MODIFIER: number;
  MIN_PARTY_SIZE: number;
  /** Number of portraits (`character01` to `character22`). */
  MAX_AVATARS: number;
  MAX_ITEMS: number;
  MASCOT_FAIRY_ELEMENTAL_DAMAGE_REDUCTION: number;
  WEAPON_TYPES_1H: string[];
  WEAPON_TYPES_2H: string[];
  RANGED_WEAPON_TYPES: string[];
  BODY_ARMOR_TYPES: string[];
  ARMOR_TYPES: string[];
  CHARACTER_CONDITIONS: Record<string, boolean>;
  CHARACTER_MALE: string[];
  CHARACTER_FEMALE: string[];
};
