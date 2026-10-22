import type { Rng } from "../core/rng";
import { BASE_CLASS, CONSTANTS, SPELLS } from "../data/tables";
import { bornAtStart, createCharacter, recalcValues, removeCondition } from "./character";
import { equipRecruit } from "./party";
import { SPELL_SCHOOL } from "./spells";
import { ATTRIBUTES, type Attribute, type Character, type ClassName, type Party, type RaceName } from "./types";

/** Heroes that can wait in the inn at the same time (the old game had no limit, a save should not grow without one). */
export const MAX_RESERVE = 20;
export const MAX_NAME_LENGTH = 16;
/** Number of portraits; they also decide the race. */
export const AVATAR_COUNT = CONSTANTS.MAX_AVATARS;

/** The classes in the order of the old buttons. */
export const CLASSES: readonly ClassName[] = ["Knight", "Paladin", "Wizard", "Thief", "Barbarian", "Archer", "Cleric", "Ninja", "Druid", "Ranger"];

const ATTRIBUTE_OF: Record<string, Attribute> = { STR: "str", INT: "int", PER: "per", END: "end", SPD: "spd", ACC: "acc", LCK: "lck" };

/** Seven attributes, each 5 to 20 (the old reroll). */
export function rollAttributes(rng: Rng): Record<Attribute, number> {
  const attrs = {} as Record<Attribute, number>;
  for (const a of ATTRIBUTES) attrs[a] = rng.range(5, 20);
  return attrs;
}

/** What a class asks for: every listed attribute must reach the minimum (`STR+PER+END` at 13 means all three). */
export function classRequirement(cls: ClassName): { attributes: Attribute[]; minimum: number } {
  const def = BASE_CLASS[cls]!;
  return { attributes: def.requirements.split("+").map((r) => ATTRIBUTE_OF[r.trim()]!).filter(Boolean), minimum: def.minimum };
}

export function isEligible(cls: ClassName, attrs: Record<Attribute, number>): boolean {
  const { attributes, minimum } = classRequirement(cls);
  return attributes.length > 0 && attributes.every((a) => attrs[a] >= minimum);
}

export function eligibleClasses(attrs: Record<Attribute, number>): ClassName[] {
  return CLASSES.filter((c) => isEligible(c, attrs));
}

/** The portrait decides the race: 1-6 human, 7-10 elf, 11-14 gnome, 15-18 dwarf, 19-22 orc. */
export function raceOfAvatar(n: number): RaceName {
  if (n <= 6) return "Human";
  if (n <= 10) return "Elf";
  if (n <= 14) return "Gnome";
  if (n <= 18) return "Dwarf";
  return "Orc";
}

export const avatarKey = (n: number): string => `character${String(n).padStart(2, "0")}`;

const NAME_START = ["Ar", "Bel", "Cal", "Dar", "El", "Fen", "Gal", "Hal", "Ith", "Jar", "Kor", "Lyn", "Mor", "Nim", "Or", "Pel", "Quin", "Ral", "Syl", "Tor"];
const NAME_END = ["dor", "wyn", "mir", "thas", "rin", "las", "nor", "var", "ion", "eth", "gar", "lyn", "mon", "tis", "vor", "zar", "dil", "wynne", "thar", "iel"];

export function randomName(rng: Rng): string {
  return (NAME_START[rng.int(NAME_START.length)]! + NAME_END[rng.int(NAME_END.length)]!).slice(0, MAX_NAME_LENGTH);
}

/** Level 1 spells of the school of the class, for classes that have spell points (the old save_character). */
export function startingSpells(cls: ClassName): number[] {
  const type = SPELL_SCHOOL[cls];
  if (!type) return [];
  return Object.values(SPELLS)
    .filter((s) => s.level === 1 && s.type.includes(type))
    .map((s) => s.id)
    .sort((a, b) => a - b);
}

export interface RecruitSpec {
  name: string;
  classType: ClassName;
  /** Portrait number 1 to AVATAR_COUNT. */
  avatar: number;
  attrs: Record<Attribute, number>;
}

export type RosterResult = { ok: true } | { ok: false; reason: "no_reserve" | "reserve_full" | "quest_items" | "not_eligible" | "no_name" | "bad_slot" };

/**
 * A new hero for the reserve: level 1 with the class's starting spells and the starter kit. Fails when the class does
 * not accept the rolled attributes or the inn is full.
 */
export function addRecruit(party: Party, spec: RecruitSpec): RosterResult {
  const name = spec.name.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return { ok: false, reason: "no_name" };
  if (!isEligible(spec.classType, spec.attrs)) return { ok: false, reason: "not_eligible" };
  if (party.reserve.length >= MAX_RESERVE) return { ok: false, reason: "reserve_full" };
  const hero = createCharacter({ name, classType: spec.classType, raceType: raceOfAvatar(spec.avatar), avatar: avatarKey(spec.avatar), attrs: { ...spec.attrs }, spells: startingSpells(spec.classType), talents: party.talents });
  // a hero made in the inn is 18 today (the old game set the birthday to the day of making)
  hero.born = bornAtStart(party.minutes);
  equipRecruit(party, hero);
  party.reserve.push(hero);
  return { ok: true };
}

export function carriesQuestItem(c: Character): boolean {
  return Object.values(c.inventory).some((item) => item?.quest);
}

/** Takes a member out of the party: what is tied to the seat (the blessing) ends with it. */
function leave(party: Party, slot: number): Character {
  const c = party.characters[slot]!;
  removeCondition(c, "Blessed");
  party.effects = party.effects.filter((e) => !(e.kind === "blessed" && e.character === slot));
  return c;
}

/**
 * Exchanges the member in `slot` with the next (or the previous) hero of the reserve; the one who goes waits at the
 * other end of the list, so repeated clicks cycle through everybody (the old switch_character).
 */
export function swapMember(party: Party, slot: number, direction: "next" | "previous"): RosterResult {
  if (!party.characters[slot]) return { ok: false, reason: "bad_slot" };
  if (party.reserve.length === 0) return { ok: false, reason: "no_reserve" };
  if (carriesQuestItem(party.characters[slot]!)) return { ok: false, reason: "quest_items" };
  const going = leave(party, slot);
  const coming = direction === "next" ? party.reserve.shift()! : party.reserve.pop()!;
  if (direction === "next") party.reserve.push(going);
  else party.reserve.unshift(going);
  party.characters[slot] = coming;
  recalcValues(coming, party.talents, false, party.mascot);
  return { ok: true };
}

/** Sends a member away for good; the first hero of the reserve takes the seat (the old delete_character). */
export function dismissMember(party: Party, slot: number): RosterResult {
  if (!party.characters[slot]) return { ok: false, reason: "bad_slot" };
  if (party.reserve.length === 0) return { ok: false, reason: "no_reserve" };
  if (carriesQuestItem(party.characters[slot]!)) return { ok: false, reason: "quest_items" };
  leave(party, slot);
  const coming = party.reserve.shift()!;
  party.characters[slot] = coming;
  recalcValues(coming, party.talents, false, party.mascot);
  return { ok: true };
}
