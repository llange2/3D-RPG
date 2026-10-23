import type { Rng } from "../core/rng";
import { BASE_CLASS, BASE_RACE, CONSTANTS } from "../data/tables";
import { isTwoHanded, sumBonus } from "./items";
import { removeCondition } from "./conditions";
import {
  ATTRIBUTES,
  BAG_SLOTS,
  EQUIPMENT_SLOTS,
  INCAPACITATED,
  type Attribute,
  type BonusKey,
  type Character,
  type ClassName,
  type Condition,
  type Inventory,
  type Item,
  type RaceName,
  CONDITIONS,
} from "./types";

/** Python's round(): halves round to the even neighbour. The old game used it for health and mana. */
export function pyRound(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function emptyInventory(): Inventory {
  const inv: Inventory = {};
  for (const slot of BAG_SLOTS) inv[slot] = null;
  for (const slot of EQUIPMENT_SLOTS) inv[slot] = null;
  return inv;
}

export interface CharacterSpec {
  name: string;
  classType: ClassName;
  raceType: RaceName;
  avatar: string;
  attrs: Record<Attribute, number>;
  spells?: number[];
  level?: number;
  talents?: string[];
}

/** Class value plus race value (numbers are summed, strings come from the class first). */
export function getBaseValue(race: RaceName, cls: ClassName, key: string): number {
  const mapped = key === "health" ? "base_hp" : key === "mana" ? "base_mana" : key;
  const c = (BASE_CLASS[cls] as unknown as Record<string, unknown>)[mapped];
  const r = (BASE_RACE[race] as unknown as Record<string, unknown>)[mapped];
  return (typeof c === "number" ? c : 0) + (typeof r === "number" ? r : 0);
}

export function createCharacter(spec: CharacterSpec): Character {
  const c: Character = {
    name: spec.name,
    classType: spec.classType,
    raceType: spec.raceType,
    avatar: spec.avatar,
    level: spec.level ?? 1,
    xp: 0,
    ...spec.attrs,
    resFire: getBaseValue(spec.raceType, spec.classType, "res_fire"),
    resIce: getBaseValue(spec.raceType, spec.classType, "res_ice"),
    resAcid: getBaseValue(spec.raceType, spec.classType, "res_acid"),
    resMagic: getBaseValue(spec.raceType, spec.classType, "res_magic"),
    thievery: getBaseValue(spec.raceType, spec.classType, "thievery"),
    health: 1,
    hp: 1,
    mana: 0,
    sp: 0,
    conditions: ["Healthy"],
    defensiveStance: false,
    spells: [...(spec.spells ?? [])],
    inventory: emptyInventory(),
  };
  recalcValues(c, spec.talents ?? [], true);
  return c;
}

const ATTR_BONUS_KEY: Record<Attribute, BonusKey> = { str: "str", int: "int", per: "per", end: "end", spd: "spd", acc: "acc", lck: "lck" };

export function equippedItems(c: Character): (Item | null)[] {
  return EQUIPMENT_SLOTS.map((s) => c.inventory[s] ?? null);
}

export function itemBonus(c: Character, key: BonusKey): number {
  return sumBonus(equippedItems(c), key);
}

/** Attributes after condition effects (port of update_conditions). Equipment bonuses are not included. */
export function conditionAdjusted(c: Character): Record<Attribute, number> & { bonusArmor: number } {
  const cur: Record<Attribute, number> & { bonusArmor: number } = {
    str: c.str,
    int: c.int,
    per: c.per,
    end: c.end,
    spd: c.spd,
    acc: c.acc,
    lck: c.lck,
    bonusArmor: 0,
  };
  const all = (f: (v: number, a: Attribute) => number) => {
    for (const a of ATTRIBUTES) cur[a] = f(cur[a], a);
  };
  const lower = (a: Attribute, n: number) => Math.max(1, c[a] - n);
  for (const condition of c.conditions) {
    switch (condition) {
      case "Blessed": {
        cur.bonusArmor = Math.max(1, c.level * 2);
        const bonus = Math.max(1, pyRound(c.level / 2));
        all((v) => v + bonus);
        break;
      }
      case "Crazy":
        cur.str += 1;
        cur.spd += 1;
        for (const a of ["int", "per", "end", "acc", "lck"] as Attribute[]) cur[a] = lower(a, 3);
        break;
      case "Cursed":
        cur.lck = Math.max(1, Math.floor(c.lck / 10));
        break;
      case "Diseased":
        for (const a of ["int", "per", "end"] as Attribute[]) cur[a] = lower(a, 5);
        break;
      case "Drunk":
        cur.per += 3;
        cur.lck += 3;
        for (const a of ["str", "int", "end", "spd", "acc"] as Attribute[]) cur[a] = lower(a, 3);
        break;
      case "Lovestruck":
        all((v) => v + 1);
        break;
      case "Poisoned":
        for (const a of ["str", "spd", "acc"] as Attribute[]) cur[a] = lower(a, 5);
        break;
      case "Weak":
        all((_, a) => Math.max(1, Math.floor(c[a] / 2)));
        break;
      default:
        break;
    }
  }
  return cur;
}

/** Attribute including equipment. `base = true` uses the unmodified value, false the condition-adjusted one. */
export function attr(c: Character, a: Attribute, base = true): number {
  const value = base ? c[a] : conditionAdjusted(c)[a];
  const total = value + itemBonus(c, ATTR_BONUS_KEY[a]);
  // Stone Skin halves the speed (see `fightSpeed`); the sheet shows it
  return a === "spd" && !base && c.mods?.stoneSkin ? Math.max(1, Math.trunc(total / 2)) : total;
}

const RESISTANCE_FIELD = { fire: "resFire", ice: "resIce", acid: "resAcid", magic: "resMagic" } as const;
const RESISTANCE_BONUS = { fire: "res_fire", ice: "res_ice", acid: "res_acid", magic: "res_magic" } as const;

/** Resistance in percent against an element: the hero's own value plus what the worn items add. */
export function resistance(c: Character, element: keyof typeof RESISTANCE_FIELD): number {
  return c[RESISTANCE_FIELD[element]] + itemBonus(c, RESISTANCE_BONUS[element]);
}

/** Armor of the worn items; Rage halves it, Stone Skin adds to what is left. */
export function armor(c: Character): number {
  let total = itemBonus(c, "arm");
  if (c.mods?.rage) total = Math.trunc(total / 2);
  if (c.mods?.stoneSkin) total += c.mods.stoneSkin;
  return total;
}

/** Speed in a fight: Stone Skin halves it (never below 1). */
export function fightSpeed(c: Character): number {
  return c.mods?.stoneSkin ? Math.max(1, Math.trunc(c.spd / 2)) : c.spd;
}

/** Game minutes in a year (the old `get_age`: ten weeks of ten days). */
export const MINUTES_PER_YEAR = 60 * 24 * 10 * 10;
/** Heroes begin at 18; the default birth is that many years before the first game minute (480, eight in the morning). */
const START_AGE = 18;
const START_MINUTE = 480;

/** Natural age in years and the years magic added on top (the sheet shows the sum, the tooltip both). */
export function ageOf(c: Character, minutes: number): { natural: number; magic: number; total: number } {
  const born = c.born ?? START_MINUTE - START_AGE * MINUTES_PER_YEAR;
  const natural = Math.max(0, Math.floor((minutes - born) / MINUTES_PER_YEAR));
  const magic = c.magicAge ?? 0;
  return { natural, magic, total: natural + magic };
}

/** Birth minute of a hero who is 18 now (a hero made in the inn). */
export function bornAtStart(minutes: number): number {
  return minutes - START_AGE * MINUTES_PER_YEAR;
}

/** Dimensional Rift: out of the fight, untouchable. */
export function isRifted(c: Character): boolean {
  return (c.mods?.rift ?? 0) > 0;
}

/** The Orb mascot raises the spell points of every hero who has any by this share. */
export const ORB_MANA_BONUS = 0.2;

/** Recomputes maximum health and mana (port of update_values). `mascot` is the party's: the Orb adds to the mana. */
export function recalcValues(c: Character, talents: readonly string[], refill: boolean, mascot = ""): void {
  const use = (a: Attribute) => Math.max(1, attr(c, a, true));
  const base = (key: string) => getBaseValue(c.raceType, c.classType, key);
  let calc = use("end") / 2 + base("health");
  if (calc <= 0) calc = 1;
  c.health = pyRound(c.level * calc);

  const mana = base("mana");
  const lvl = c.level;
  const prestidigitator = talents.includes("talent_prestidigitator") ? lvl * 2 : 0;
  const prayerMaster = talents.includes("talent_prayer_master") ? lvl * 2 : 0;
  switch (c.classType) {
    case "Archer":
      c.mana = pyRound(lvl * (10 - 90 / use("int") + mana)) + prestidigitator;
      break;
    case "Cleric":
      c.mana = pyRound(lvl * (25 - 250 / use("per") + mana)) + prayerMaster;
      break;
    case "Druid":
      c.mana = pyRound(lvl * (25 - 500 / (use("per") + use("int")) + mana));
      break;
    case "Paladin":
      c.mana = pyRound(lvl * (10 - 90 / use("per") + mana)) + prayerMaster;
      break;
    case "Ranger":
      c.mana = pyRound(lvl * (10 - 180 / (use("per") + use("int")) + mana));
      break;
    case "Wizard":
      c.mana = pyRound(lvl * (25 - 250 / use("int") + mana)) + prestidigitator;
      break;
    default:
      c.mana = 0;
  }
  c.mana = Math.max(0, c.mana);
  if (mascot === "Orb" && c.mana > 0) c.mana = pyRound(c.mana * (1 + ORB_MANA_BONUS));
  if (refill) {
    c.hp = c.health;
    c.sp = c.mana;
  } else {
    c.hp = Math.min(c.hp, c.health);
    c.sp = Math.min(c.sp, c.mana);
  }
}

/** Total XP needed to reach `level + 1` minus the current XP (never negative). Port of xp_to_next_level. */
export function xpToNextLevel(c: Character, level = c.level): number {
  const base = CONSTANTS.CHARACTER_XP[c.classType] ?? 2000;
  let total = 0;
  if (level <= 10) {
    for (let i = 0; i < level; i++) total += 2 ** i * base;
  } else {
    for (let i = 0; i < 10; i++) total += 2 ** i * base;
    total += 1_024_000 * (level - 10);
  }
  return Math.max(0, total - c.xp);
}

/** Raises the level by `levels` (the old training grounds: pay, get the XP, level up). */
export function levelUp(c: Character, talents: readonly string[], levels = 1, mascot = ""): void {
  for (let i = 0; i < levels; i++) {
    c.xp += xpToNextLevel(c);
    c.level += 1;
  }
  recalcValues(c, talents, true, mascot);
}

export function canAct(c: Character): boolean {
  return !c.conditions.some((cond) => INCAPACITATED.includes(cond)) && !isRifted(c);
}

/** Somebody who is (or will be again) able to fight: a hero in the Rift counts, because the spell ends. */
export function anyoneLeft(characters: readonly Character[]): boolean {
  return characters.some((c) => canAct(c) || isRifted(c) && !c.conditions.some((cond) => INCAPACITATED.includes(cond)));
}

export function isAlive(c: Character): boolean {
  return !c.conditions.includes("Dead") && !c.conditions.includes("Rotten");
}

/** Whether healing can reach the hero: the dead and the petrified cannot be healed, everybody else (the knocked out too) can. */
export function canBeHealed(c: Character): boolean {
  return isAlive(c) && !c.conditions.includes("Petrified");
}

/**
 * Gives hit points back, up to the maximum, and returns how many were gained. Unconscious is not a condition of its own to cure:
 * a hero who is above 0 again is awake (the old game made it a state of "hp <= 0"), so every healing goes through here.
 */
export function healHp(c: Character, amount: number): number {
  const before = c.hp;
  c.hp = Math.max(before, Math.min(c.health, before + amount));
  if (amount > 0 && c.hp > 0) removeCondition(c, "Unconscious");
  return c.hp - before;
}

/** Most severe condition, in the order of the CONDITIONS table. */
export function worstCondition(c: Character): Condition {
  return CONDITIONS.find((cond) => c.conditions.includes(cond)) ?? "Healthy";
}

export { addCondition, removeCondition } from "./conditions";

/** Thievery roll: random between a third of the skill and the full skill (port of get_thievery_roll_value). */
export function thieveryRoll(c: Character, rng: Rng): number {
  const skill = Math.max(1, Math.floor(((attr(c, "lck") + attr(c, "acc")) / 2 + c.thievery) * c.level * 0.1));
  return rng.range(Math.floor(skill / 3), skill);
}

// ---------------------------------------------------------------- equipment

const WEAPONS_1H = CONSTANTS.WEAPON_TYPES_1H;
const WEAPONS_2H = CONSTANTS.WEAPON_TYPES_2H;

/**
 * Whether `item` may go into `slot` (port of Inventory.equip_item). A two-hander fits the weapon hand even with a shield on: it pushes
 * the shield off (`equipSlots`), which the old game did not allow, so a shield simply blocked it.
 */
export function canEquip(inv: Inventory, item: Item, slot: string): boolean {
  const type = item.type.toLowerCase();
  if (slot.startsWith("slot")) return true;
  switch (slot) {
    case "helmet":
      return type === "helmet" || type === "tiara";
    case "body_armor":
      return CONSTANTS.BODY_ARMOR_TYPES.includes(type);
    case "left_hand":
      return WEAPONS_1H.includes(type) || WEAPONS_2H.includes(type);
    case "right_hand": {
      if (type !== "shield") return false;
      const left = inv.left_hand;
      return !(left && WEAPONS_2H.includes(left.type.toLowerCase()));
    }
    case "belt":
      return type === "belt";
    case "left_ring":
    case "right_ring":
      return type === "ring";
    case "boots":
      return type === "boots";
    case "ranged_weapon":
      return CONSTANTS.RANGED_WEAPON_TYPES.includes(type);
    default:
      return false;
  }
}

export type EquipResult = "ok" | "no_fit" | "bag_full";

/**
 * Moves an item between two slots of one inventory, swapping if the target is occupied and the swap is legal. A two-hander put into
 * the weapon hand takes the shield off into the backpack: into the place the two-hander leaves when no weapon was worn, else into
 * another free one. With weapon and shield on and a full backpack that is one place too few, nothing moves (`bag_full`).
 */
export function equipSlots(inv: Inventory, from: string, to: string): EquipResult {
  const item = inv[from];
  if (!item || !canEquip(inv, item, to)) return "no_fit";
  const other = inv[to] ?? null;
  if (other && !canEquip(inv, other, from)) return "no_fit";
  const shield = to === "left_hand" && from.startsWith("slot") && isTwoHanded(item) ? (inv.right_hand ?? null) : null;
  let shieldSlot: string | null = null;
  if (shield) {
    shieldSlot = other === null ? from : (BAG_SLOTS.find((s) => s !== from && inv[s] === null) ?? null);
    if (!shieldSlot) return "bag_full";
  }
  inv[from] = other;
  inv[to] = item;
  if (shield && shieldSlot) {
    inv.right_hand = null;
    inv[shieldSlot] = shield;
  }
  return "ok";
}

export function swapSlots(c: Pick<Character, "inventory">, from: string, to: string): boolean {
  return equipSlots(c.inventory, from, to) === "ok";
}

/** The slot a double click puts `item` into: one that fits, a free one before a taken one. */
export function equipTarget(inv: Inventory, item: Item): string | undefined {
  return EQUIPMENT_SLOTS.filter((s) => canEquip(inv, item, s)).sort((a, b) => Number((inv[a] ?? null) !== null) - Number((inv[b] ?? null) !== null))[0];
}

/** What wearing `item` would take off: whatever sits in the slot `equipTarget` picks, plus the shield for a two-hander. Empty when a free slot takes it. */
export function replacedItems(inv: Inventory, item: Item): Item[] {
  const slot = equipTarget(inv, item);
  if (!slot) return [];
  const out: Item[] = [];
  const there = inv[slot];
  if (there) out.push(there);
  if (slot === "left_hand" && isTwoHanded(item) && inv.right_hand) out.push(inv.right_hand);
  return out;
}

export function freeBagSlot(c: Character): string | null {
  return BAG_SLOTS.find((s) => c.inventory[s] === null) ?? null;
}
