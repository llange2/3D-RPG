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
import MONSTER_SHEET from "./monster-sheet.json";
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
  /** `both` (the Dragon Worm) is at home on land and in the water. */
  terrain: "land" | "water" | "both";
  undead: boolean;
  icon_height: number;
  res_acid: number;
  res_fire: number;
  res_ice: number;
  res_magic: number;
  res_physical: number;
  res_poison: number;
  /** The abilities as one line for the player ("Ranged Attack, Causes Poisoned"), built from the flags below. */
  special_abilties: string | null;
  /** A ranged attack: one shot a turn from a distance (`no_of_attacks` only counts in melee). */
  ranged: boolean;
  /** Every attack hits all characters at once. */
  hits_all: boolean;
  /** Conditions its hits can cause, as `Condition` names ("Poisoned", "Dead", "Rotten" for eradication ...). */
  causes: string[];
  /** Share of its maximum hit points it heals at the end of every monster turn (0.05 = 5 %). */
  regen: number;
  /** Share of the maximum mana of the hero it hits that a hit takes away. */
  steal_mana: number;
  /** Years a hit adds to the hero's magical age. */
  aging_years: number;
  /** Where it lives on the overworld: with a Monster Hut (`hut`), as a wild group without one (`wild`), or not at all (null). */
  outside: "hut" | "wild" | null;
  /** XP of burning its Monster Hut down (13 times the monster's XP), 0 without a hut. */
  hut_xp: number;
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

interface MonsterSheetRow {
  name: string;
  health: number;
  armor: number;
  speed: number;
  attacks: number;
  damageMin: number;
  damageMax: number;
  attackType: string;
  regen: number | null;
  stealMana: number | null;
  aging: number | null;
  hut: number | "x" | null;
  resMagic: number;
  resFire: number;
  resPhysical: number;
  resCold: number;
  resPoison: number;
  gold: number;
  iconHeight: number;
  terrain: "land" | "water" | "both";
  undead: boolean;
  xp: number;
  level: number;
  ranged: boolean;
  hitsAll: boolean;
  poisoned: boolean;
  cursed: boolean;
  sleeping: boolean;
  crazy: boolean;
  diseased: boolean;
  weak: boolean;
  petrified: boolean;
  dead: boolean;
  paralyzed: boolean;
  eradication: boolean;
}

/** The sheet's condition columns with the `Condition` each one stands for, in the order the player reads them. */
const SHEET_CAUSES: readonly [keyof MonsterSheetRow, string][] = [
  ["poisoned", "Poisoned"],
  ["cursed", "Cursed"],
  ["sleeping", "Sleeping"],
  ["crazy", "Crazy"],
  ["diseased", "Diseased"],
  ["weak", "Weak"],
  ["petrified", "Petrified"],
  ["dead", "Dead"],
  ["paralyzed", "Paralyzed"],
  ["eradication", "Rotten"],
];

/** What the old table (`MONSTER_DATA.json`) has of a monster: the fields the sheet adds are missing. */
type OldMonster = Omit<MonsterDef, "id" | "res_poison" | "ranged" | "hits_all" | "causes" | "regen" | "steal_mana" | "aging_years" | "outside" | "hut_xp">;

const percent = (share: number): string => `${Math.round(share * 100)}%`;

/**
 * A monster of the user's sheet (`docs/RPG_0.1.xlsx`, exported by `npm run data:monsters`) laid over the old table: stats, resistances, XP
 * (the sheet's new XP column; the old one is not used any more), treasure level, abilities and the Monster Hut come from the sheet, the
 * animation and sound entries only the old table has stay.
 */
function monsterFromSheet(id: number, old: OldMonster, row: MonsterSheetRow): MonsterDef {
  const causes = SHEET_CAUSES.filter(([key]) => row[key]).map(([, condition]) => condition);
  const regen = row.regen ?? 0;
  const stealMana = row.stealMana ?? 0;
  const aging = row.aging ?? 0;
  const abilities = [
    row.ranged ? "Ranged Attack" : "",
    row.hitsAll ? "Hits All" : "",
    ...causes.map((c) => `Causes ${c === "Rotten" ? "Eradication" : c}`),
    regen > 0 ? `Regenerates ${percent(regen)}` : "",
    stealMana > 0 ? `Drains ${percent(stealMana)} of Spell Points` : "",
    aging > 0 ? `Aging Touch(+${aging})` : "",
  ].filter((a) => a !== "");
  return {
    ...old,
    id,
    name: row.name,
    health: row.health,
    armor: row.armor,
    speed: row.speed,
    no_of_attacks: row.attacks,
    damage_min: row.damageMin,
    damage_max: row.damageMax,
    attack_type: (row.attackType === "Cold" ? "Ice" : row.attackType) as AttackType,
    res_magic: row.resMagic,
    res_fire: row.resFire,
    res_physical: row.resPhysical,
    res_ice: row.resCold,
    // acid and poison are one element in the sheet
    res_acid: row.resPoison,
    res_poison: row.resPoison,
    xp: row.xp,
    gold: row.gold,
    treasure_level: row.level,
    icon_height: row.iconHeight,
    terrain: row.terrain,
    undead: row.undead,
    // the sheet knows no hatred of one class (the old "Targets Clerics" and "Hatred:Paladins")
    preferred_enemy: null,
    special_abilties: abilities.length > 0 ? abilities.join(", ") : null,
    ranged: row.ranged,
    hits_all: row.hitsAll,
    causes,
    regen,
    steal_mana: stealMana,
    aging_years: aging,
    outside: typeof row.hut === "number" ? "hut" : row.hut === "x" ? "wild" : null,
    hut_xp: typeof row.hut === "number" ? row.hut : 0,
  };
}

export const MONSTERS: Record<number, MonsterDef> = Object.fromEntries(
  Object.entries(MONSTER_DATA_RAW as unknown as Record<string, OldMonster>).map(([id, m]) => {
    const row = (MONSTER_SHEET as unknown as Record<string, MonsterSheetRow>)[id];
    if (!row) throw new Error(`monster ${id} is not in the monster sheet`);
    return [Number(id), monsterFromSheet(Number(id), m, row)];
  }),
);
export const MONSTER_IDS: number[] = Object.keys(MONSTERS).map(Number).sort((a, b) => a - b);

const SHEET = SPELL_SHEET as Record<string, { name: string; description: string; explanation: string }>;
export const SPELLS: Record<number, SpellDef> = Object.fromEntries(
  Object.entries(SPELLS_RAW as unknown as Record<string, Omit<SpellDef, "id" | "title" | "text" | "explanation">>).map(([id, s]) => {
    const sheet = SHEET[id];
    return [Number(id), { ...s, id: Number(id), title: sheet?.name ?? textsRaw[s.name] ?? `Spell ${id}`, text: sheet?.description ?? textsRaw[s.description] ?? "", explanation: sheet?.explanation ?? "" } as SpellDef];
  }),
);

/** Whether a monster walks on dry ground: land monsters and the Dragon Worm (terrain `both`). */
export function walksOnLand(m: Pick<MonsterDef, "terrain">): boolean {
  return m.terrain !== "water";
}

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
