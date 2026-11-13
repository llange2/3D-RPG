import { Rng, seedFromString } from "../core/rng";
import { ageOf, recalcValues } from "./character";
import type { ConditionEvent } from "./conditions";
import type { Character, Party } from "./types";

/**
 * Old age (formulas 1.2, section 6, 13. 11. 2026). From 80 years on (natural plus magical age) a hero rolls against dying of old age every time the age rises
 * (a birthday, or years that magic adds), and the same share is taken off every base attribute and resistance.
 *
 *   p(age) = 0                                   below 80
 *   p(age) = 1 / (1 + e^(-0.1874 * (age - 104.5)))    from 80
 *
 * The sim does not use `Math.exp` (it must give the same number in every engine), so the curve is a table in parts per million, one entry per year from 80 to 150.
 */
export const OLD_AGE = 80;

const TABLE_PPM = [
  10038, 12082, 14536, 17479, 21006, 25227, 30269, 36281, 43434, 51922, 61960, 73788, 87664, 103856, 122636, 144266, 168976, 196945, 228271, 262948, 300840, 341661, 384971, 430184,
  476592, 523408, 569816, 615029, 658339, 699160, 737052, 771729, 803055, 831024, 855734, 877364, 896144, 912336, 926212, 938040, 948078, 956566, 963719, 969731, 974773, 978994,
  982521, 985464, 987918, 989962, 991663, 993078, 994254, 995231, 996043, 996717, 997276, 997741, 998126, 998446, 998711, 998931, 999114, 999265, 999391, 999495, 999581, 999653,
  999712, 999761, 999802,
];

/** The share (0 to 1) of dying of old age, and of the base values lost, at an age in years. */
export function agingShare(age: number): number {
  if (age < OLD_AGE) return 0;
  return TABLE_PPM[Math.min(TABLE_PPM.length - 1, Math.floor(age) - OLD_AGE)]! / 1_000_000;
}

/** The temple takes the magical age off for 100 000 gold a year, whatever the level (the user, 13. 11. 2026). */
export const CURE_AGE_GOLD_PER_YEAR = 100_000;

export function cureAgeCost(c: Character): number {
  return (c.magicAge ?? 0) * CURE_AGE_GOLD_PER_YEAR;
}

/** Years, natural plus magical, at the party's clock. */
export function totalAge(party: Party, c: Character): number {
  return ageOf(c, party.minutes).total;
}

/** True once somebody in the party or the reserve is 80 or older. */
export function anyoneOld(party: Party): boolean {
  return [...party.characters, ...(party.reserve ?? [])].some((c) => totalAge(party, c) >= OLD_AGE);
}

/**
 * Sets `ageShare` from the age now and brings health and mana in line (the attributes shrink or come back). Call it after every change of the age:
 * time, magical years, the temple, loading a save.
 */
export function refreshAge(party: Party, c: Character): void {
  const share = agingShare(totalAge(party, c));
  if ((c.ageShare ?? 0) === share) return;
  if (share > 0) c.ageShare = share;
  else delete c.ageShare;
  recalcValues(c, party.talents ?? [], false, party.mascot);
}

/** Dead of old age: every other condition goes with the hero, and nothing brings them back (see `templeCureAge`). */
export function dieOfAge(party: Party, c: Character): void {
  c.conditions = ["Dead"];
  c.conditionDue = {};
  c.hp = 0;
  c.diedOfAge = true;
  delete c.mods;
  const seat = party.characters.indexOf(c);
  if (seat >= 0) party.effects = party.effects.filter((e) => e.character !== seat);
}

/** One roll against old age at `total` years. The seed holds the hero and the count of rolls, so loading a save does not give a second chance. */
function rollsDeath(c: Character, total: number): boolean {
  const p = agingShare(total);
  if (p <= 0) return false;
  c.ageRolls = (c.ageRolls ?? 0) + 1;
  return new Rng(seedFromString(`old-age:${c.name}:${c.born ?? 0}:${total}:${c.ageRolls}`)).float() < p;
}

/**
 * Years that magic adds (a ghost's touch, the price of Resurrect and Divine Intervention): the age grows, the base values shrink with it and from 80 on the hero rolls
 * once, at the new age. A hero who died of old age cannot age more (otherwise the old would be brought back by it). Returns whether the roll was lost.
 */
export function addMagicAge(party: Party, c: Character, years: number): { died: boolean } {
  if (c.diedOfAge || years <= 0) return { died: false };
  c.magicAge = (c.magicAge ?? 0) + years;
  refreshAge(party, c);
  if (!rollsDeath(c, totalAge(party, c))) return { died: false };
  dieOfAge(party, c);
  return { died: true };
}

/**
 * The birthdays between `before` and now (`party.minutes`): one roll for each year that turned, from 80 on, for the living and the dead alike, in the party and in the reserve.
 * A hero who loses the roll dies there and then (the rest of their birthdays are not rolled). Returns the deaths for the log.
 */
export function birthdays(party: Party, before: number): ConditionEvent[] {
  const events: ConditionEvent[] = [];
  const heroes = [...party.characters.map((c, seat) => ({ c, seat })), ...(party.reserve ?? []).map((c) => ({ c, seat: -1 }))];
  for (const { c, seat } of heroes) {
    if (c.diedOfAge) continue;
    const was = ageOf(c, before);
    const now = ageOf(c, party.minutes);
    for (let year = was.natural + 1; year <= now.natural; year++) {
      if (!rollsDeath(c, year + was.magic)) continue;
      dieOfAge(party, c);
      events.push({ character: seat, condition: "Dead", outcome: "died", cause: "old age", name: c.name });
      break;
    }
    refreshAge(party, c);
  }
  return events;
}

/** The temple takes all the magical age off: the hero is as old as they were born (a hero who died of old age is simply "Dead" then). False if there is none or the gold is short. */
export function templeCureAge(party: Party, index: number): boolean {
  const c = party.characters[index]!;
  const cost = cureAgeCost(c);
  if (cost <= 0 || party.gold < cost) return false;
  party.gold -= cost;
  c.magicAge = 0;
  delete c.diedOfAge;
  refreshAge(party, c);
  return true;
}
