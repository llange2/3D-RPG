import type { Rng } from "../core/rng";
import { CONSTANTS, MONSTERS, SPELLS, walksOnLand, type SpellDef } from "../data/tables";
import { orbSpellBonus } from "./balance";
import { addCondition, canAct, canBeHealed, healHp, isAlive, recalcValues, removeCondition } from "./character";
import { restartCondition } from "./conditions";
import { generateItem } from "./items";
import { addEffect } from "./party";
import type { SpecialSpell } from "./encounter";
import type { Character, ClassName, Condition, Item, LastCast, Party, Place, TimedEffect } from "./types";

/** Single-target projectile spells (the old "non-penetrating" list). */
const SINGLE_TARGET = new Set([3, 5, 8, 15, 29, 51, 59, 71, 74, 77]);
/** Spells that hit everything on the line through the target. Pain and Turn Undead have their own entry (`LIVING_OR_UNDEAD`). */
const PENETRATING = new Set([10, 14, 37, 38, 39, 44, 49, 50, 53, 60, 63, 68, 72, 73, 75]);
/** Spells whose rule for whom they hit is in `specialSpell` (`sim/encounter.ts`). */
const SPECIAL: Record<number, SpecialSpell> = { 43: "finger_of_death", 64: "mass_distortion", 69: "holy_word", 76: "star_burst" };
/** Spells that change the monster the party is looking at (no damage). */
const MONSTER_EFFECTS = new Set([31, 41]);

/** Condition cures: spell id to the conditions it removes. */
const CURES: Record<number, Condition[]> = {
  1: ["Sleeping"],
  9: ["Weak"],
  35: ["Poisoned"],
  40: ["Diseased"],
  48: ["Paralyzed"],
  54: ["Crazy"],
  61: ["Petrified"],
};
/** Moon Ray heals every hero by up to this much. */
const MOON_RAY_HEAL = 50;
/** Communion: the chance to lift a curse. */
const COMMUNION_CHANCE = 0.5;
/**
 * The "Suppress" spells (Poison, Madness, Disease) do not remove the condition, they set its timer back to the start: the old
 * game removed the event and set it again. The hero stays sick, but has the full time to find a cure.
 */
const SUPPRESS: Record<number, Condition> = { 11: "Poisoned", 18: "Crazy", 23: "Diseased" };
const HEALS = new Set([4, 7, 27, 28]);
const REVIVES = new Set([65, 70]);
/** The spells that work on what a hero carries: they ask whose backpack (`needsTarget`) and then which items. */
export const ITEM_SPELLS = new Set([55, 58, 67]);
/** Spells that need no hero or monster to aim at and are carried out by the game (they move the party, rest, or open a window). */
const WORLD_SPELLS = new Set([2, 13, 16, 22, 26, 32, 42, 45, 47, 52, 62, 66]);

/** The spell window shows this many plates across and down: four rows hold the 36 spells of the school with the most (Clerical), a test keeps it so. */
export const SPELL_GRID = { columns: 9, rows: 4 };

const HOUR = 60;
/** Years a hero ages from Resurrect (the caster) and Divine Intervention (the caster). */
export const SPELL_AGING = 5;
/** Dimensional Rift: monster turns. */
export const RIFT_TURNS = 5;

/** Pandora's box: what the rift pulls into the world, with the chances of the spell sheet. */
export type PandoraOutcome = { type: "gold"; amount: number } | { type: "item"; item: Item } | { type: "monster"; defId: number };
/** The monster Pandora's box brings at 1 in 100. */
export const DRAGON_LORD = 83;

export type FizzleReason =
  | "unknown"
  | "not_known"
  | "mana"
  | "cannot_act"
  | "not_implemented"
  | "needs_target"
  | "needs_element"
  | "needs_choice"
  | "in_town"
  | "in_battle"
  | "no_beacon"
  | "no_food"
  | "no_effect"
  | "cannot_revive"
  | "no_hp";

export type SpellResult =
  | { kind: "fizzle"; reason: FizzleReason }
  | { kind: "attack"; spellId: number; damage: number; type: string; penetrate: boolean; undead: boolean | null; special?: SpecialSpell; healed?: { target: number; amount: number }[] }
  | { kind: "heal"; target: number; amount: number; /** Half For Me: the hit points the caster paid. */ paid?: number }
  | { kind: "cure"; target: number; removed: Condition[] }
  /** `condition` is null when the hero did not have it (the spell is paid for all the same). */
  | { kind: "suppress"; target: number; condition: Condition | null }
  | { kind: "revive"; target: number; /** Resurrect took a point of Endurance. */ endurance?: boolean }
  | { kind: "buff"; effect: TimedEffect }
  | { kind: "bless"; target: number }
  | { kind: "jump" }
  /** Spells the game carries out, because they need the map or the encounter: the id says which. */
  | { kind: "world"; spellId: number; beacon?: "set" | "return"; place?: Place }
  /** Spells that change the monster in front of the party (Immobilize, Clumsy). */
  | { kind: "monster_effect"; spellId: number }
  | { kind: "rift"; target: number }
  | { kind: "pandora"; outcome: PandoraOutcome }
  | { kind: "food" }
  /** Divine Intervention: everybody who can still be helped is made whole; `revived` are the heroes that were dead. */
  | { kind: "intervention"; healed: number[]; revived: number[] }
  /** Combine, Duplication, Transform Ring: the game asks which items. */
  | { kind: "items"; spellId: number; target: number };

export interface CastOptions {
  /** Character index for heals, cures and the item spells. */
  target?: number;
  /** Element for Protection from Elements. */
  element?: "acid" | "fire" | "ice" | "magic";
  /** Lloyd's Beacon: light the fire here, or go back to it. */
  beacon?: "set" | "return";
  /** Where the party stands (Lloyd's Beacon "set"). */
  here?: Place;
  /** The party stands in a town: Pandora's box is too dangerous there. */
  town?: boolean;
  /** Monsters are next to the party: the spells that move it (`movesParty`) do not work. */
  battle?: boolean;
}

/** Jump, Time Distortion, Nature's Gate, Teleport, Etherealise and Town Portal: spells that carry the party off its tile. */
const PARTY_MOVERS: ReadonlySet<number> = new Set([16, 42, 45, 47, 62, 66]);

/**
 * Does the spell take the party away from where it stands (and so does not work while monsters are next to it)? Lloyd's Beacon does when it
 * brings the party back to its fire; lighting the fire is no move.
 */
export function movesParty(spellId: number, beacon?: "set" | "return"): boolean {
  return PARTY_MOVERS.has(spellId) || (spellId === 32 && beacon === "return");
}

/** Spells the game has code for. Every spell of the sheet is one of them. */
export function isSpellImplemented(id: number): boolean {
  return (
    SINGLE_TARGET.has(id) ||
    PENETRATING.has(id) ||
    id in SPECIAL ||
    MONSTER_EFFECTS.has(id) ||
    WORLD_SPELLS.has(id) ||
    ITEM_SPELLS.has(id) ||
    HEALS.has(id) ||
    id in CURES ||
    id in SUPPRESS ||
    REVIVES.has(id) ||
    [6, 12, 17, 19, 20, 21, 24, 25, 30, 33, 34, 36, 46, 56, 57, 60, 78].includes(id)
  );
}

export function needsTarget(id: number): boolean {
  return HEALS.has(id) || id in CURES || id in SUPPRESS || REVIVES.has(id) || ITEM_SPELLS.has(id) || [20, 25, 30, 46, 56].includes(id);
}

/** Teleport carries the party this many fields ahead; the player picks the distance. */
export const TELEPORT_DISTANCES: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9];

/** Lloyd's Beacon asks "Set" or "Return" before it is cast. */
export function needsBeaconChoice(id: number): boolean {
  return id === 32;
}

function attackDamage(spell: SpellDef, caster: Character, rng: Rng, mascot = ""): number {
  const lo = spell.dam_min ?? 0;
  const hi = Math.max(lo, spell.dam_max ?? lo);
  let damage = rng.range(lo, hi);
  if (spell.scales_with_level) damage *= caster.level;
  if (caster.defensiveStance) damage = Math.trunc(damage * (1 - CONSTANTS.STANCE_MODIFIER));
  // BALANCE v4: the Orb adds 20 % to the damage of attack spells (`orbSpellBonus()` is 0 in the legacy mode)
  if (mascot === "Orb" && orbSpellBonus() > 0) damage = Math.trunc(damage * (1 + orbSpellBonus()));
  return damage;
}

/** Monsters Pandora's box may bring: land monsters of the treasure level. */
function pandoraMonsters(level: number): number[] {
  return Object.values(MONSTERS)
    .filter((m) => m.treasure_level === level && walksOnLand(m))
    .map((m) => m.id)
    .sort((a, b) => a - b);
}

/** The roll of Pandora's box (the percentages of the spell sheet). */
export function pandoraOutcome(rng: Rng): PandoraOutcome {
  const roll = rng.range(1, 100);
  const monster = (level: number): PandoraOutcome => {
    const list = pandoraMonsters(level);
    return { type: "monster", defId: list[rng.int(list.length)]! };
  };
  if (roll <= 30) return { type: "gold", amount: rng.range(1, 100) };
  if (roll <= 60) return { type: "item", item: generateItem(rng, 1) };
  if (roll <= 80) return monster(1);
  if (roll <= 85) return { type: "gold", amount: rng.range(101, 200) };
  if (roll <= 90) return { type: "item", item: generateItem(rng, 2) };
  if (roll <= 95) return monster(2);
  if (roll <= 99) return { type: "gold", amount: rng.range(1000, 10000) };
  return { type: "monster", defId: DRAGON_LORD };
}

/**
 * Casts a spell. Mana is only paid when the spell does something. Attack spells return the damage for the combat
 * engine to apply; spells that need the map or the monsters (`world`, `monster_effect`) return what to do and the game does it;
 * everything else is applied to the party here.
 */
export function castSpell(party: Party, casterIndex: number, spellId: number, rng: Rng, options: CastOptions = {}): SpellResult {
  const caster = party.characters[casterIndex];
  const spell = SPELLS[spellId];
  if (!caster || !spell) return { kind: "fizzle", reason: "unknown" };
  if (!caster.spells.includes(spellId)) return { kind: "fizzle", reason: "not_known" };
  if (!canAct(caster)) return { kind: "fizzle", reason: "cannot_act" };
  if (!isSpellImplemented(spellId)) return { kind: "fizzle", reason: "not_implemented" };
  if (caster.sp < spell.mana) return { kind: "fizzle", reason: "mana" };

  const pay = () => {
    caster.sp -= spell.mana;
  };
  const target = options.target !== undefined ? party.characters[options.target] : undefined;
  if (needsTarget(spellId) && !target) return { kind: "fizzle", reason: "needs_target" };

  if (SINGLE_TARGET.has(spellId) || PENETRATING.has(spellId) || spellId === 12 || spellId === 19 || spellId in SPECIAL) {
    pay();
    const types = spell.dam_type ?? ["magic"];
    const special = SPECIAL[spellId];
    const result: SpellResult = {
      kind: "attack",
      spellId,
      damage: attackDamage(spell, caster, rng, party.mascot),
      type: types[rng.int(types.length)]!,
      penetrate: !SINGLE_TARGET.has(spellId) && !special,
      // Pain hits the living and the dead alike since the spell sheet dropped "Doesn't affect undead"; Turn Undead only the undead
      undead: spellId === 19 ? true : null,
    };
    if (special) result.special = special;
    if (spellId === 60) {
      // Moon Ray heals every hero by up to 50
      result.healed = party.characters.flatMap((c, i) => (canBeHealed(c) ? [{ target: i, amount: healHp(c, MOON_RAY_HEAL) }] : []));
    }
    return result;
  }

  if (MONSTER_EFFECTS.has(spellId)) {
    pay();
    return { kind: "monster_effect", spellId };
  }

  if (ITEM_SPELLS.has(spellId)) {
    pay();
    return { kind: "items", spellId, target: options.target! };
  }

  if (HEALS.has(spellId)) {
    pay();
    let amount = rng.range(Math.min(spell.heal_min, spell.heal_max), Math.max(spell.heal_min, spell.heal_max));
    if (spell.scales_with_level) amount *= caster.level;
    const t = target!;
    healHp(t, amount);
    return { kind: "heal", target: options.target!, amount };
  }

  if (REVIVES.has(spellId)) {
    const t = target!;
    const dead = t.conditions.includes("Dead");
    const rotten = t.conditions.includes("Rotten");
    // Raise Dead brings back the dead; Resurrect also the rotten (what the old game called eradicated). Nobody with no Endurance left comes back.
    if (!(dead || (spellId === 70 && rotten))) return { kind: "fizzle", reason: "no_effect" };
    if (t.end <= 0) return { kind: "fizzle", reason: "cannot_revive" };
    pay();
    removeCondition(t, "Dead");
    removeCondition(t, "Rotten");
    removeCondition(t, "Unconscious");
    if (spellId === 70) {
      // the price: a point of Endurance for good, and the caster is five years older
      t.end -= 1;
      recalcValues(t, party.talents, false, party.mascot);
      t.hp = t.health;
      caster.magicAge = (caster.magicAge ?? 0) + SPELL_AGING;
    } else t.hp = 1;
    return { kind: "revive", target: options.target!, endurance: spellId === 70 };
  }

  if (spellId === 46) {
    pay();
    const t = target!;
    const removed: Condition[] = t.conditions.includes("Cursed") && rng.float() < COMMUNION_CHANCE ? ["Cursed"] : [];
    for (const c of removed) removeCondition(t, c);
    return { kind: "cure", target: options.target!, removed };
  }

  if (spellId in CURES) {
    pay();
    const t = target!;
    const removed = CURES[spellId]!.filter((c) => t.conditions.includes(c));
    for (const c of removed) removeCondition(t, c);
    return { kind: "cure", target: options.target!, removed };
  }

  if (spellId in SUPPRESS) {
    pay();
    const condition = SUPPRESS[spellId]!;
    return { kind: "suppress", target: options.target!, condition: restartCondition(target!, condition, party.minutes) ? condition : null };
  }

  if (WORLD_SPELLS.has(spellId)) {
    if (spellId === 2 && options.town) return { kind: "fizzle", reason: "in_town" };
    if (options.battle && movesParty(spellId, options.beacon)) return { kind: "fizzle", reason: "in_battle" };
    if (spellId === 52 && party.food <= 0) return { kind: "fizzle", reason: "no_food" };
    if (spellId === 32) {
      if (!options.beacon) return { kind: "fizzle", reason: "needs_choice" };
      if (options.beacon === "return" && !caster.beacon) return { kind: "fizzle", reason: "no_beacon" };
      if (options.beacon === "set" && !options.here) return { kind: "fizzle", reason: "needs_choice" };
      pay();
      if (options.beacon === "set") {
        caster.beacon = options.here;
        return { kind: "world", spellId, beacon: "set", place: options.here };
      }
      return { kind: "world", spellId, beacon: "return", place: caster.beacon };
    }
    pay();
    if (spellId === 16) return { kind: "jump" };
    if (spellId === 2) return { kind: "pandora", outcome: pandoraOutcome(rng) };
    return { kind: "world", spellId };
  }

  switch (spellId) {
    case 6: {
      pay();
      const effect: TimedEffect = { kind: "light", until: party.minutes + 8 * HOUR };
      addEffect(party, effect);
      return { kind: "buff", effect };
    }
    case 17: {
      if (!options.element) return { kind: "fizzle", reason: "needs_element" };
      pay();
      const effect: TimedEffect = { kind: "protection", until: party.minutes + 8 * HOUR, element: options.element, amount: caster.level };
      addEffect(party, effect);
      return { kind: "buff", effect };
    }
    case 20:
    case 25: {
      // Stone Skin: armor for speed; Rage: damage for armor. Twelve hours, one of each on a hero (a second cast starts the time again)
      const t = target!;
      if (!isAlive(t)) return { kind: "fizzle", reason: "no_effect" };
      pay();
      const mods = (t.mods ??= {});
      if (spellId === 20) mods.stoneSkin = caster.level;
      else mods.rage = caster.level;
      const effect: TimedEffect = { kind: spellId === 20 ? "stone_skin" : "rage", until: party.minutes + 12 * HOUR, character: options.target!, amount: caster.level };
      addEffect(party, effect);
      return { kind: "buff", effect };
    }
    case 30: {
      const t = target!;
      if (!isAlive(t) || !canAct(t)) return { kind: "fizzle", reason: "no_effect" };
      pay();
      (t.mods ??= {}).rift = RIFT_TURNS;
      return { kind: "rift", target: options.target! };
    }
    case 33: {
      pay();
      const effect: TimedEffect = { kind: "power_shield", until: party.minutes + HOUR };
      addEffect(party, effect);
      return { kind: "buff", effect };
    }
    case 36: {
      pay();
      const effect: TimedEffect = { kind: "detect_monster", until: party.minutes + 8 * HOUR };
      addEffect(party, effect);
      return { kind: "buff", effect };
    }
    case 56: {
      // Half For Me: the caster pays half of what the other one is healed by, and keeps one hit point
      const t = target!;
      if (t === caster) return { kind: "fizzle", reason: "needs_target" };
      if (!canBeHealed(t)) return { kind: "fizzle", reason: "no_effect" };
      const missing = t.health - t.hp;
      const paid = Math.min(Math.ceil(missing / 2), caster.hp - 1);
      if (missing <= 0) return { kind: "fizzle", reason: "no_effect" };
      if (paid <= 0) return { kind: "fizzle", reason: "no_hp" };
      pay();
      caster.hp -= paid;
      const amount = healHp(t, paid * 2);
      return { kind: "heal", target: options.target!, amount, paid };
    }
    case 57: {
      // Emergency rations: one ration, and never more than one
      if (party.food >= 1) return { kind: "fizzle", reason: "no_effect" };
      pay();
      party.food = 1;
      return { kind: "food" };
    }
    case 78: {
      pay();
      const healed: number[] = [];
      const revived: number[] = [];
      party.characters.forEach((c, i) => {
        // everything but the rot goes, the dead come back, everybody is whole
        if (c.conditions.includes("Rotten")) return;
        if (c.conditions.includes("Dead")) revived.push(i);
        for (const cond of [...c.conditions]) if (cond !== "Healthy") removeCondition(c, cond);
        c.hp = c.health;
        healed.push(i);
      });
      caster.magicAge = (caster.magicAge ?? 0) + SPELL_AGING;
      return { kind: "intervention", healed, revived };
    }
    case 21:
    case 34:
    case 24: {
      pay();
      // Wizard's Eye lasts eight hours; Levitate and Walk on Water four
      const hours = spellId === 24 ? 8 : 4;
      const effect: TimedEffect = { kind: spellId === 21 ? "levitate" : spellId === 34 ? "walk_on_water" : "wizard_eye", until: party.minutes + hours * HOUR };
      addEffect(party, effect);
      return { kind: "buff", effect };
    }
    default:
      return { kind: "fizzle", reason: "not_implemented" };
  }
}

/** Spells that need something to aim at: a monster in sight. */
export function isAttackSpell(id: number): boolean {
  return SINGLE_TARGET.has(id) || PENETRATING.has(id) || id === 12 || id === 19 || id in SPECIAL || MONSTER_EFFECTS.has(id);
}

/** Spells that only work on a monster next to the party. */
export function needsAdjacent(id: number): boolean {
  return id === 43;
}

export type QuickCastBlock = "gone" | "cannot_act" | "mana" | "no_target";

export interface QuickCast {
  caster: number;
  spellId: number;
  target?: number;
  element?: LastCast["element"];
  /** Why it cannot be cast right now, or null. */
  block: QuickCastBlock | null;
}

/**
 * The entry for the spell menu that repeats the last spell, or null when nothing was cast yet. `aimed` says whether an attack
 * spell has a monster in sight; `turn` is the hero whose turn it is in a fight (a spell is only cast by the one who may act).
 */
export function quickCast(party: Party, aimed: boolean, turn: number | null = null): QuickCast | null {
  const last = party.lastCast;
  if (!last) return null;
  const caster = party.characters.findIndex((c) => c.name === last.caster);
  const spell = SPELLS[last.spellId];
  const base = { caster, spellId: last.spellId, target: last.target, element: last.element };
  const c = party.characters[caster];
  if (!c || !spell || !c.spells.includes(last.spellId) || !isSpellImplemented(last.spellId)) return { ...base, block: "gone" };
  if (!canAct(c) || (turn !== null && turn !== caster)) return { ...base, block: "cannot_act" };
  if (c.sp < spell.mana) return { ...base, block: "mana" };
  if (isAttackSpell(last.spellId) && !aimed) return { ...base, block: "no_target" };
  return { ...base, block: null };
}

/** The one school of magic a class can learn from (the old `handle_right_click`); classes without an entry have no spells. */
export const SPELL_SCHOOL: Partial<Record<ClassName, "Arcane" | "Clerical" | "Nature">> = {
  Wizard: "Arcane",
  Archer: "Arcane",
  Cleric: "Clerical",
  Paladin: "Clerical",
  Druid: "Nature",
  Ranger: "Nature",
};

export type LearnBlock = "known" | "class" | "level";

/** Why this character cannot learn the spell (from a guild or a scroll), or null when it can. Same rules as the old game. */
export function learnBlock(c: Character, spellId: number): LearnBlock | null {
  const spell = SPELLS[spellId];
  const school = SPELL_SCHOOL[c.classType];
  if (!spell || !school || !spell.type.includes(school)) return "class";
  if (c.spells.includes(spellId)) return "known";
  if (c.level < spell.level) return "level";
  return null;
}

/** Spells a character of this class and level could learn (by caster type and the spell's level requirement). */
export function learnableSpells(c: Character): SpellDef[] {
  return Object.values(SPELLS).filter((s) => learnBlock(c, s.id) === null && isSpellImplemented(s.id));
}
