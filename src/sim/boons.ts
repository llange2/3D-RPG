import { recalcValues } from "./character";
import type { BoonKey, Party } from "./types";

/**
 * The boons of the open land (35th playtest): some wells, fountains and stone heads raise one attribute or one resistance of the whole party for twelve hours. The points sit on
 * the hero (`Character.mods.boon`, read by `attr` and `resistance`) and go with their `TimedEffect` of kind `boon` (`advanceTime`). A second boon of the same stat replaces the
 * first, so the points never add up.
 */
export const BOON_HOURS = 12;

/** Points of an attribute by the level of the land (+5 on level 1 up to +25 on level 5); a resistance gets twice as many percent. */
export function boonAmount(tier: number, stat: BoonKey): number {
  const points = 5 * Math.max(1, Math.min(5, tier));
  return stat.startsWith("res_") ? points * 2 : points;
}

/** Raises `stat` of every hero in the party by `amount` for twelve hours. Returns how many heroes got it. */
export function applyBoon(party: Party, stat: BoonKey, amount: number): number {
  party.characters.forEach((c, i) => {
    (c.mods ??= {}).boon ??= {};
    c.mods.boon![stat] = amount;
    party.effects = party.effects.filter((e) => !(e.kind === "boon" && e.character === i && e.stat === stat));
    party.effects.push({ kind: "boon", until: party.minutes + BOON_HOURS * 60, character: i, stat, amount });
    // the points of Endurance count in the health of the hero
    if (stat === "end") recalcValues(c, party.talents, false, party.mascot);
  });
  return party.characters.length;
}

/** Takes the boon of a hero's stat away (its time is up, or the hero leaves the party). */
export function endBoon(party: Party, slot: number, stat: BoonKey | undefined): void {
  const hero = party.characters[slot];
  if (!hero?.mods?.boon || !stat) return;
  delete hero.mods.boon[stat];
  if (Object.keys(hero.mods.boon).length === 0) delete hero.mods.boon;
  if (stat === "end") recalcValues(hero, party.talents, false, party.mascot);
}

/** A hero who leaves the party takes no boon with them: the effects of that seat end, and so do the points. */
export function dropBoons(party: Party, slot: number): void {
  const hero = party.characters[slot];
  if (hero?.mods?.boon) {
    const stats = Object.keys(hero.mods.boon) as BoonKey[];
    delete hero.mods.boon;
    if (stats.includes("end")) recalcValues(hero, party.talents, false, party.mascot);
  }
  party.effects = party.effects.filter((e) => !(e.kind === "boon" && e.character === slot));
}
