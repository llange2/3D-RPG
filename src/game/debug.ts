import { TALENTS, SPELLS } from "../data/tables";
import { isAlive, levelUp, recalcValues, removeCondition } from "../sim/character";
import { cheats } from "../sim/cheats";
import { SPELL_SCHOOL, isSpellImplemented } from "../sim/spells";
import type { Party } from "../sim/types";
import type { Poi, PoiKind } from "../world/types";

/**
 * The debug menu (Esc > Debug). Switch this to false and the entry is gone from the menu and no cheat can be turned on; nothing else
 * has to be removed.
 */
export const DEBUG_MENU = true;

/** Food rations a god-mode party is kept at, shown as the count in the corner. */
const GOD_FOOD = 99;

/** Conditions god mode leaves alone (a blessing helps). */
const KEPT_CONDITIONS = ["Healthy", "Blessed"];

/** Heals everybody, brings the dead back, takes every ailment away and fills the larder. Called on switching on and after every action. */
export function maintainGod(party: Party): void {
  for (const c of party.characters) {
    for (const cond of [...c.conditions]) if (!KEPT_CONDITIONS.includes(cond)) removeCondition(c, cond);
    c.hp = c.health;
    c.sp = c.mana;
  }
  party.food = Math.max(party.food, GOD_FOOD);
}

export function setGodMode(party: Party, on: boolean): void {
  cheats.god = on;
  if (on) maintainGod(party);
}

export const DEBUG_LEVELS = 10;
export const DEBUG_GOLD = 100_000;

/** Ten levels for every hero who lives, each with the XP of the level it reaches (the way the training hall raises one), not only the points. */
export function debugLevels(party: Party): void {
  for (const c of party.characters) if (isAlive(c)) levelUp(c, party.talents, DEBUG_LEVELS, party.mascot);
}

export function debugGold(party: Party): void {
  party.gold += DEBUG_GOLD;
}

/** Every implemented spell of each hero's school of magic, whatever the hero's level: what the class could learn in the end. Returns how many spells were added. */
export function debugAllSpells(party: Party): number {
  let added = 0;
  for (const c of party.characters) {
    const school = SPELL_SCHOOL[c.classType];
    if (!school) continue;
    for (const spell of Object.values(SPELLS)) {
      if (!spell.type.includes(school) || !isSpellImplemented(spell.id) || c.spells.includes(spell.id)) continue;
      c.spells.push(spell.id);
      added++;
    }
    c.spells.sort((a, b) => a - b);
  }
  return added;
}

const KIND_ORDER: Record<PoiKind, number> = { town: 0, cave: 1, dungeon: 2, castle: 3 };
const KIND_TITLE: Record<PoiKind, string> = { town: "Town", cave: "Cave", dungeon: "Dungeon", castle: "Castle" };

/** The places of the world for Esc > Debug > Teleport to Level: by level, then town, cave, dungeon, castle, then by name. A pyramid (a dungeon of size 3) leads into the spaceship. */
export function teleportTargets(pois: readonly Poi[]): { poi: Poi; kind: string }[] {
  return pois
    .map((poi) => ({ poi, kind: poi.kind === "dungeon" && poi.size === 3 ? "Pyramid" : KIND_TITLE[poi.kind] }))
    .sort((a, b) => a.poi.tier - b.poi.tier || KIND_ORDER[a.poi.kind] - KIND_ORDER[b.poi.kind] || a.poi.name.localeCompare(b.poi.name));
}

/** Every talent of the game. Returns how many were added. */
export function debugAllTalents(party: Party): number {
  let added = 0;
  let recalc = false;
  for (const id of Object.keys(TALENTS)) {
    if (party.talents.includes(id)) continue;
    party.talents.push(id);
    added++;
    if (TALENTS[id]?.recalc_attribute_values) recalc = true;
  }
  if (recalc) for (const c of party.characters) recalcValues(c, party.talents, false, party.mascot);
  return added;
}
