import type { Rng } from "../core/rng";
import { CONSTANTS, SPELLS, type SpellDef } from "../data/tables";
import { addCondition, canAct, healHp, removeCondition } from "./character";
import { restartCondition } from "./conditions";
import { addEffect } from "./party";
import type { Character, ClassName, Condition, LastCast, Party, TimedEffect } from "./types";

/** Single-target projectile spells (the old "non-penetrating" list). */
const SINGLE_TARGET = new Set([3, 5, 8, 15, 29, 51, 71, 77]);
/** Spells that hit everything on the line through the target. */
const PENETRATING = new Set([10, 14, 37, 38, 39, 44, 49, 50, 53, 63, 68, 72, 73, 75, 76]);

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
/**
 * The "Suppress" spells (Poison, Madness, Disease) do not remove the condition, they set its timer back to the start: the old
 * game removed the event and set it again. The hero stays sick, but has the full time to find a cure.
 */
const SUPPRESS: Record<number, Condition> = { 11: "Poisoned", 18: "Crazy", 23: "Diseased" };
const HEALS = new Set([4, 7, 27, 28]);
const REVIVES = new Set([65, 70]);

const HOUR = 60;

export type SpellResult =
  | { kind: "fizzle"; reason: "unknown" | "not_known" | "mana" | "cannot_act" | "not_implemented" | "needs_target" | "needs_element" }
  | { kind: "attack"; spellId: number; damage: number; type: string; penetrate: boolean; undead: boolean | null }
  | { kind: "heal"; target: number; amount: number }
  | { kind: "cure"; target: number; removed: Condition[] }
  /** `condition` is null when the hero did not have it (the spell is paid for all the same). */
  | { kind: "suppress"; target: number; condition: Condition | null }
  | { kind: "revive"; target: number }
  | { kind: "buff"; effect: TimedEffect }
  | { kind: "bless"; target: number }
  | { kind: "jump" };

export interface CastOptions {
  /** Character index for heals and cures. */
  target?: number;
  /** Element for Protection from Elements. */
  element?: "acid" | "fire" | "ice" | "magic";
}

export function isSpellImplemented(id: number): boolean {
  return SINGLE_TARGET.has(id) || PENETRATING.has(id) || id === 12 || id === 19 || HEALS.has(id) || id in CURES || id in SUPPRESS || REVIVES.has(id) || [6, 16, 17, 20, 21, 24, 34].includes(id);
}

export function needsTarget(id: number): boolean {
  return HEALS.has(id) || id in CURES || id in SUPPRESS || REVIVES.has(id) || id === 20;
}

function attackDamage(spell: SpellDef, caster: Character, rng: Rng): number {
  const lo = spell.dam_min ?? 0;
  const hi = Math.max(lo, spell.dam_max ?? lo);
  let damage = rng.range(lo, hi);
  if (spell.scales_with_level) damage *= caster.level;
  if (caster.defensiveStance) damage = Math.trunc(damage * (1 - CONSTANTS.STANCE_MODIFIER));
  return damage;
}

/**
 * Casts a spell. Mana is only paid when the spell does something. Attack spells return the damage for the combat
 * engine to apply; everything else is applied to the party here. Spells that the old game never implemented
 * fizzle with `not_implemented` and cost nothing.
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

  if (SINGLE_TARGET.has(spellId) || PENETRATING.has(spellId) || spellId === 12 || spellId === 19) {
    pay();
    const types = spell.dam_type ?? ["magic"];
    return {
      kind: "attack",
      spellId,
      damage: attackDamage(spell, caster, rng),
      type: types[rng.int(types.length)]!,
      penetrate: !SINGLE_TARGET.has(spellId),
      undead: spellId === 12 ? false : spellId === 19 ? true : null,
    };
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
    pay();
    const t = target!;
    if (!t.conditions.includes("Dead") && !t.conditions.includes("Rotten")) return { kind: "revive", target: options.target! };
    removeCondition(t, "Dead");
    if (spellId === 70) removeCondition(t, "Rotten");
    t.hp = spellId === 70 ? t.health : 1;
    return { kind: "revive", target: options.target! };
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
    case 20: {
      pay();
      const t = target!;
      addCondition(t, "Blessed", party.minutes);
      const effect: TimedEffect = { kind: "blessed", until: party.minutes + 4 * HOUR, character: options.target! };
      addEffect(party, effect);
      return { kind: "bless", target: options.target! };
    }
    case 21:
    case 34:
    case 24: {
      pay();
      const effect: TimedEffect = { kind: spellId === 21 ? "levitate" : spellId === 34 ? "walk_on_water" : "wizard_eye", until: party.minutes + 4 * HOUR };
      addEffect(party, effect);
      return { kind: "buff", effect };
    }
    case 16:
      pay();
      return { kind: "jump" };
    default:
      return { kind: "fizzle", reason: "not_implemented" };
  }
}

/** Spells that need something to aim at: a monster in sight. */
export function isAttackSpell(id: number): boolean {
  return SINGLE_TARGET.has(id) || PENETRATING.has(id) || id === 12 || id === 19;
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
