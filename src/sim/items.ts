import type { Rng } from "../core/rng";
import { CONSTANTS, ITEXTS, QUEST_ITEMS, SPELLS } from "../data/tables";
import type { Bonus, BonusKey, Item } from "./types";

const MATERIAL_NAMES = ["wood", "copper", "iron", "steel", "gold", "ruby", "diamond", "obsidian"];

// [itexts name index, min damage, max damage, type, base value]
const WEAPONS: [number, number, number, string, number][] = [
  [8, 4, 16, "bardiche", 200],
  [9, 3, 15, "battle axe", 300],
  [10, 3, 12, "broad sword", 100],
  [11, 1, 6, "club", 50],
  [12, 4, 8, "crossbow", 50],
  [13, 2, 4, "dagger", 8],
  [14, 1, 10, "flail", 100],
  [15, 3, 21, "great axe", 300],
  [16, 4, 18, "halberd", 250],
  [17, 2, 10, "hammer", 120],
  [18, 4, 12, "katana", 150],
  [19, 5, 10, "long bow", 100],
  [20, 3, 9, "long sword", 100],
  [21, 2, 8, "mace", 50],
  [22, 5, 8, "rapier", 50],
  [23, 2, 10, "scimitar", 80],
  [24, 3, 6, "short bow", 25],
  [25, 2, 6, "short sword", 15],
  [26, 2, 4, "sling", 20],
  [27, 1, 9, "spear", 100],
  [28, 2, 8, "staff", 40],
  [29, 1, 12, "trident", 75],
];

const WEAPON_TEXTURES: Record<string, string> = {
  bardiche: "item_2h_bardiche",
  "battle axe": "item_2h_battle_axe",
  "broad sword": "item_1h_broad_sword",
  club: "item_1h_club",
  crossbow: "item_2h_crossbow",
  dagger: "item_1h_dagger",
  flail: "item_1h_flail",
  "great axe": "item_2h_great_axe",
  halberd: "item_2h_halberd",
  hammer: "item_2h_hammer",
  katana: "item_1h_katana",
  "long bow": "item_2h_long_bow",
  "long sword": "item_1h_long_sword",
  mace: "item_1h_mace",
  rapier: "item_1h_rapier",
  scimitar: "item_1h_scimitar",
  "short bow": "item_2h_short_bow",
  "short sword": "item_1h_short_sword",
  sling: "item_2h_sling",
  spear: "item_2h_spear",
  staff: "item_2h_staff",
  trident: "item_2h_trident",
};

const BODY_ARMOR: [number, number, string, number][] = [
  [42, 1, "robe", 10],
  [30, 2, "padded_armor", 20],
  [31, 3, "leather_armor", 40],
  [32, 4, "scale_armor", 100],
  [33, 5, "ring_mail", 200],
  [34, 6, "chain_mail", 400],
  [35, 8, "splint_mail", 600],
  [36, 10, "plate_armor", 1000],
];
const EQUIPMENT: [number, number, string, number][] = [
  [37, 1, "boots", 40],
  [38, 1, "belt", 200],
  [39, 2, "helmet", 60],
  [40, 4, "shield", 100],
  [41, 1, "tiara", 200],
];

/**
 * Icons the original asset folder does not contain (checked by the texture test): the copper long bow was never
 * drawn, the old game showed a missing texture. The iron icon stands in for it.
 */
const MISSING_ICON_FALLBACK: Record<string, string> = { item_2h_long_bow_copper: "item_2h_long_bow_iron" };

const WEAPON_MATERIAL_BONUS = [0, 3, 6, 8, 11, 15, 30, 50];
const ARMOR_MATERIAL_BONUS = [0, 2, 4, 6, 8, 10, 15, 20];
const MATERIAL_VALUE_MULTIPLIER = [0.5, 1, 3, 10, 30, 60, 90, 100];

type BonusEntry = [number, ...(BonusKey | number)[]];
const PREFIXES: Record<number, BonusEntry[]> = {
  1: [
    [44, "acc", 5],
    [45, "end", 5],
    [46, "per", 5],
    [47, "res_fire", 10],
    [48, "lck", 5],
    [49, "res_acid", 10],
    [50, "spd", 5],
    [51, "int", 5],
    [52, "str", 5],
    [53, "res_magic", 10],
    [54, "res_ice", 10],
  ],
  2: [
    [55, "lck", 10],
    [56, "per", 10],
    [57, "end", 10],
    [58, "spd", 10],
    [59, "int", 10],
    [60, "acc", 10],
    [61, "str", 10],
  ],
  3: [
    [62, "res_magic", 50],
    [63, "res_fire", 15, "res_ice", 15, "res_acid", 15, "res_magic", 15],
    [64, "str", 15, "spd", 15],
    [65, "end", 30],
    [66, "spd", 5, "int", 5, "per", 5, "end", 5, "acc", 5, "lck", 5],
    [67, "end", 10, "spd", 10, "acc", 10],
    [68, "dam_min", 2, "dam_max", 2],
  ],
};
const SUFFIXES: Record<number, BonusEntry[]> = {
  1: [
    [69, "acc", 5],
    [70, "res_fire", 10],
    [71, "end", 5],
    [72, "res_magic", 10],
    [73, "int", 5],
    [74, "lck", 5],
    [75, "per", 5],
    [76, "res_acid", 10],
    [77, "spd", 5],
    [78, "str", 5],
    [79, "res_ice", 10],
  ],
  2: [
    [80, "dam_min", 2, "dam_max", 2],
    [81, "res_fire", 10, "res_ice", 10, "res_acid", 10, "res_magic", 10],
    [82, "str", 5, "acc", 5],
    [83, "spd", 5, "lck", 5],
    [84, "per", 5, "int", 5],
  ],
  3: [
    [85, "per", 30],
    [86, "int", 30],
    [87, "arm", 10, "dam_min", -1, "dam_max", -1],
    [88, "res_magic", 30, "per", 15],
    [89, "acc", 15, "lck", 15],
    [90, "dam_min", 5, "dam_max", 5, "arm", -10],
  ],
  4: [
    [91, "acc", -10, "int", 50, "end", -10],
    [92, "str", 50, "int", -10, "per", -10],
    [93, "end", 50, "spd", -20],
  ],
};

function addBonuses(item: Item, entry: BonusEntry): void {
  for (let i = 1; i < entry.length; i += 2) {
    const key = entry[i] as BonusKey;
    item.bonus[key] = (item.bonus[key] ?? 0) + (entry[i + 1] as number);
  }
}

/** Items get their id from the party when they are picked up (the counter is part of the save), so creation stays pure. */
export function makeItem(partial: Partial<Item> & Pick<Item, "name" | "type">): Item {
  return { id: "", material: 1, texture: "mm3_icon_33", value: 1, quest: false, spellId: 0, bonus: {}, ...partial };
}

export interface GenerateOptions {
  /** 1..8 */
  forcedMaterial?: number;
  /** 1..36 as in the old g.py (1-22 weapons, 23-30 body armour, 31-35 equipment, 36 ring). */
  forcedType?: number;
}

/**
 * Random item by treasure level. Port of the old Inventory.generate_item with a seedable generator.
 * Material: 1..treasureLevel+3. Category: 30% weapon, 50% armour, 20% ring with prefix/suffix.
 */
export function generateItem(rng: Rng, treasureLevel = 1, options: GenerateOptions = {}): Item {
  const item = makeItem({ name: "empty", type: "undefined" });
  item.material = options.forcedMaterial ?? rng.range(1, treasureLevel + 3);
  item.name = item.material <= 8 ? ITEXTS[item.material - 1]! : ITEXTS[94]!;
  const materialIdx = Math.min(8, Math.max(1, item.material)) - 1;
  const materialName = MATERIAL_NAMES[materialIdx]!;
  const forced = options.forcedType;

  let roll: number;
  let forcedIndex = forced;
  if (forced === undefined) roll = rng.range(1, 100);
  else if (forced <= 22) roll = 15;
  else if (forced <= 35) {
    roll = 60;
    forcedIndex = forced - 22;
  } else roll = 90;

  let baseValue = 1;
  if (roll <= 30) {
    const w = WEAPONS[(forcedIndex ?? rng.range(1, 22)) - 1]!;
    const [nameIdx, minDam, maxDam, type, value] = w;
    baseValue = value;
    item.name += ITEXTS[nameIdx];
    item.type = type;
    const melee = [...CONSTANTS.WEAPON_TYPES_1H, ...CONSTANTS.WEAPON_TYPES_2H].includes(type);
    const matBonus = WEAPON_MATERIAL_BONUS[materialIdx]!;
    if (melee) {
      item.bonus.dam_min = minDam + matBonus;
      item.bonus.dam_max = maxDam + matBonus;
    } else {
      item.bonus.ranged_dam_min = minDam + Math.floor(matBonus / 2);
      item.bonus.ranged_dam_max = maxDam + Math.floor(matBonus / 2);
    }
    const texture = `${WEAPON_TEXTURES[type]!}_${materialName}`;
    item.texture = MISSING_ICON_FALLBACK[texture] ?? texture;
  } else if (roll <= 80) {
    const bodyArmor = forced === undefined ? rng.chance(500) : forcedIndex! <= 8;
    let entry: [number, number, string, number];
    if (bodyArmor) {
      const i = forced === undefined ? rng.range(treasureLevel, treasureLevel + 3) : forcedIndex!;
      entry = BODY_ARMOR[Math.min(BODY_ARMOR.length, Math.max(1, i)) - 1]!;
    } else {
      const i = forced === undefined ? rng.range(1, 5) : forcedIndex! - 8;
      entry = EQUIPMENT[Math.min(EQUIPMENT.length, Math.max(1, i)) - 1]!;
    }
    const [nameIdx, arm, type, value] = entry;
    baseValue = value;
    item.name += ITEXTS[nameIdx];
    item.type = type;
    item.bonus.arm = arm + ARMOR_MATERIAL_BONUS[materialIdx]!;
    item.texture = CONSTANTS.ARMOR_TYPES.includes(type) ? `item_${type}_${materialName}` : `item_${type}`;
  } else {
    return fillRing(rng, item, rng.range(1, treasureLevel));
  }

  item.value = Math.floor(baseValue * MATERIAL_VALUE_MULTIPLIER[materialIdx]! + 0.9999);
  return item;
}

/** The highest ring level there is: three prefix levels and four suffix levels. */
export const MAX_RING_LEVEL = 7;
/** Obsidian, the best material. */
export const MAX_MATERIAL = 8;

/** A ring of the given level: its value is `100 * level^3`, the level is split between a prefix and a suffix. */
function fillRing(rng: Rng, item: Item, level: number): Item {
  item.type = "ring";
  item.name = ITEXTS[43]!;
  item.value = 100 * level ** 3;
  let prefix = rng.range(0, Math.min(3, level));
  let suffix = level - prefix;
  if (suffix > 4) {
    suffix = 4;
    prefix = level - suffix;
  }
  if (prefix > 0) {
    const entry = PREFIXES[prefix]![rng.int(PREFIXES[prefix]!.length)]!;
    item.name = ITEXTS[entry[0]]! + item.name;
    addBonuses(item, entry);
  }
  if (suffix > 0) {
    const entry = SUFFIXES[suffix]![rng.int(SUFFIXES[suffix]!.length)]!;
    item.name += ITEXTS[entry[0]];
    addBonuses(item, entry);
  }
  item.texture = `item_ring_${Math.min(5, level)}`;
  return item;
}

/** A new ring of exactly this level with affixes of its own (Combine and Transform Ring). */
export function generateRing(rng: Rng, level: number): Item {
  return fillRing(rng, makeItem({ name: "empty", type: "undefined" }), Math.max(1, Math.min(MAX_RING_LEVEL, level)));
}

/** The level of a ring; the value of a ring is `100 * level^3`. */
export function ringLevel(item: Item): number {
  return Math.max(1, Math.round(Math.cbrt(item.value / 100)));
}

/** The `forcedType` number (1..35) of a weapon, armor or piece of equipment, or null for anything else (rings, scrolls, quest items). */
export function itemKind(item: Item): number | null {
  const w = WEAPONS.findIndex((e) => e[3] === item.type);
  if (w >= 0) return w + 1;
  const a = BODY_ARMOR.findIndex((e) => e[2] === item.type);
  if (a >= 0) return 22 + a + 1;
  const e = EQUIPMENT.findIndex((x) => x[2] === item.type);
  return e >= 0 ? 30 + e + 1 : null;
}

/** The same item one material better (Combine). Null when it is as good as it gets or is not made of a material. */
export function betterMaterial(rng: Rng, item: Item): Item | null {
  if (item.quest) return null;
  if (item.type === "ring") return ringLevel(item) >= MAX_RING_LEVEL ? null : generateRing(rng, ringLevel(item) + 1);
  const kind = itemKind(item);
  if (kind === null || item.material >= MAX_MATERIAL) return null;
  return generateItem(rng, 1, { forcedMaterial: item.material + 1, forcedType: kind });
}

/** A quest item from the QUEST_ITEMS table, found by its type id. */
export function questItem(type: string): Item | null {
  const q = QUEST_ITEMS.find((i) => i.type === type);
  if (!q) return null;
  return makeItem({ name: q.name, type: q.type, texture: q.texture.replace("resources/textures/", ""), value: q.value, quest: true });
}

/** A spell scroll for the given spell id. */
export function spellScroll(spellId: number): Item {
  const spell = SPELLS[spellId];
  if (!spell) throw new Error(`unknown spell ${spellId}`);
  return makeItem({
    name: spell.title,
    type: "spell",
    spellId,
    texture: `item_spell_${spell.type.map((t) => t.toLowerCase()).join("_")}`,
    value: spell.value,
  });
}

const BONUS_LABELS: [BonusKey, string][] = [
  ["arm", "Armor"],
  ["str", "Strength"],
  ["int", "Intelligence"],
  ["per", "Personality"],
  ["end", "Endurance"],
  ["spd", "Speed"],
  ["acc", "Accuracy"],
  ["lck", "Luck"],
  ["res_fire", "Fire Resistance"],
  ["res_ice", "Ice Resistance"],
  ["res_acid", "Acid Resistance"],
  ["res_magic", "Magic Resistance"],
  ["dam_min", "Min. Damage"],
  ["dam_max", "Max. Damage"],
  ["ranged_dam_min", "Min. Ranged Damage"],
  ["ranged_dam_max", "Max. Ranged Damage"],
];

export interface BonusLine {
  label: string;
  value: number;
  /** What putting the item on would change compared with `replaced` (negative: worse), or null without a comparison. */
  change: number | null;
}

/**
 * The bonus lines of an item. With `replaced`, each line carries the change against that item, and a stat only one of the two has gets
 * a line too: a ring without endurance that would replace one with 5 reads "Endurance: 0", change -5.
 */
export function bonusLines(item: Item, replaced: Item | null = null): BonusLine[] {
  const has = (i: Item | null, key: BonusKey) => (i?.bonus[key] ?? 0) !== 0;
  return BONUS_LABELS.filter(([key]) => has(item, key) || has(replaced, key)).map(([key, label]) => {
    const value = item.bonus[key] ?? 0;
    return { label, value, change: replaced ? value - (replaced.bonus[key] ?? 0) : null };
  });
}

export type Hands = "one" | "two" | "ranged";

/** A one-hander leaves a hand for the shield, a two-hander takes both, ranged weapons have a slot of their own. Null for everything else. */
export function weaponHands(item: Item): Hands | null {
  const type = item.type.toLowerCase();
  if (CONSTANTS.WEAPON_TYPES_1H.includes(type)) return "one";
  if (CONSTANTS.WEAPON_TYPES_2H.includes(type)) return "two";
  if (CONSTANTS.RANGED_WEAPON_TYPES.includes(type)) return "ranged";
  return null;
}

export const isTwoHanded = (item: Item): boolean => weaponHands(item) === "two";

/** Several items taken together (a weapon and the shield it pushes off), so the tooltip can compare against all of them at once. */
export function combineItems(items: Item[]): Item | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0]!;
  const bonus: Bonus = {};
  for (const item of items) for (const [key, value] of Object.entries(item.bonus) as [BonusKey, number][]) bonus[key] = (bonus[key] ?? 0) + value;
  return makeItem({ name: items.map((i) => i.name.trim()).join(" and "), type: "combined", bonus });
}

/** Human readable bonus lines, as in the old Item.bonus_description. */
export function bonusDescription(item: Item): string {
  return bonusLines(item)
    .map((l) => `${l.label}: ${l.value}`)
    .join("\n");
}

export function sumBonus(items: (Item | null)[], key: BonusKey): number {
  let total = 0;
  for (const item of items) if (item) total += (item.bonus as Bonus)[key] ?? 0;
  return total;
}
