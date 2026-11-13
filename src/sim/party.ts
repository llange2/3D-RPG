import { Rng, seedFromString } from "../core/rng";
import { TALENTS } from "../data/tables";
import { canAct, createCharacter, emptyInventory, isAlive, recalcValues, removeCondition, swapSlots } from "./character";
import { birthdays, refreshAge } from "./aging";
import { endBoon } from "./boons";
import { seedConditionTimers, tickConditions, type ConditionEvent } from "./conditions";
import { generateItem } from "./items";
import { BAG_SLOTS, type Character, type ClassName, type Item, type Party, type TimedEffect } from "./types";

export const MINUTES_PER_DAY = 1440;
/** Game minutes per tile step in towns, castles, dungeons and caves. */
export const STEP_MINUTES_INSIDE = 1;
/** Game minutes per tile step in the open country (the generated overworld and the campaign's outside map). */
export const STEP_MINUTES_OUTSIDE = 10;
/** The same step for a party with the Pathfinder talent. */
export const STEP_MINUTES_PATHFINDER = 7;
/** Game minutes per action (an attack, a spell, using an object), inside and outside alike. */
export const ACTION_MINUTES = 1;

/** `talents` are the party's: the Pathfinder shortens a step in the open country only (inside, a step is one minute for everybody). */
export function stepMinutes(outside: boolean, talents: readonly string[] = []): number {
  if (!outside) return STEP_MINUTES_INSIDE;
  return talents.includes("talent_pathfinder") ? STEP_MINUTES_PATHFINDER : STEP_MINUTES_OUTSIDE;
}

/** The four heroes of the old game. */
export function createDefaultParty(): Party {
  const characters: Character[] = [
    createCharacter({ name: "Maximus", classType: "Knight", raceType: "Orc", avatar: "character21", attrs: { str: 21, int: 8, per: 12, end: 20, spd: 16, acc: 14, lck: 10 } }),
    createCharacter({ name: "Elrin", classType: "Ninja", raceType: "Dwarf", avatar: "character16", attrs: { str: 16, int: 12, per: 11, end: 15, spd: 20, acc: 20, lck: 19 } }),
    createCharacter({ name: "Ralvar", classType: "Archer", raceType: "Human", avatar: "character05", attrs: { str: 15, int: 20, per: 11, end: 14, spd: 13, acc: 20, lck: 12 }, spells: [1, 3, 6] }),
    createCharacter({ name: "Lyneth", classType: "Druid", raceType: "Gnome", avatar: "character12", attrs: { str: 8, int: 19, per: 20, end: 18, spd: 14, acc: 10, lck: 13 }, spells: [1, 3, 4, 6] }),
  ];
  // the two heroes of the old game who wait in the inn from the start
  const reserve: Character[] = [
    createCharacter({ name: "Crack Hack", classType: "Barbarian", raceType: "Dwarf", avatar: "character17", attrs: { str: 18, int: 7, per: 12, end: 21, spd: 16, acc: 17, lck: 14 } }),
    createCharacter({ name: "Morris", classType: "Knight", raceType: "Human", avatar: "character04", attrs: { str: 17, int: 8, per: 12, end: 18, spd: 15, acc: 18, lck: 14 } }),
  ];
  const party: Party = {
    characters,
    gold: 2000, // monster gold and shop prices of the old game are in the hundreds and thousands
    bankGold: 0,
    food: 3,
    // 8:00 on the first day
    minutes: 480,
    talents: [],
    achievements: [],
    reserve,
    effects: [],
    itemCounter: 0,
    mascot: "Crow",
    mascots: ["Crow"],
    mascotBag: emptyInventory(),
  };
  equipStarterKit(party);
  return party;
}

/** A save from before `achievements`, `reserve` and the condition timers existed: the party gets them, empty or started. */
export function normalizeParty(party: Party): Party {
  party.achievements ??= [];
  party.reserve ??= [];
  party.mascotBag ??= emptyInventory();
  party.mascots ??= [party.mascot];
  seedConditionTimers(party);
  // old age (13. 11. 2026): the share that age takes off is derived, never saved; a save from before it has nobody of 80 and more, a later one gets it back here
  for (const c of [...party.characters, ...party.reserve]) {
    if (c.diedOfAge && !c.conditions.includes("Dead")) c.conditions = ["Dead"];
    refreshAge(party, c);
  }
  // bug_fix_50, point 27: saves from before `gainAttribute` kept the health and mana of the old attributes after a chalice, a statue or a shrine; they get what they gained
  for (const c of [...party.characters, ...party.reserve]) {
    const health = c.health;
    const mana = c.mana;
    if (!Number.isFinite(health) || !Number.isFinite(mana)) continue;
    recalcValues(c, party.talents ?? [], false, party.mascot);
    if (c.health > health && c.hp > 0) c.hp = Math.min(c.health, c.hp + c.health - health);
    if (c.mana > mana) c.sp = Math.min(c.mana, c.sp + c.mana - mana);
  }
  return party;
}

/** Item numbers as in generateItem's forcedType: 1-22 weapons, 23-30 body armour, 31-35 boots/belt/helmet/shield/tiara. */
const STARTER: Record<ClassName, { weapon: number; ranged?: number; body: number; shield?: boolean }> = {
  Knight: { weapon: 13, body: 25, shield: true },
  Paladin: { weapon: 3, body: 25, shield: true },
  Barbarian: { weapon: 3, body: 25 },
  Ninja: { weapon: 11, ranged: 19, body: 25 },
  Thief: { weapon: 18, ranged: 19, body: 25 },
  Archer: { weapon: 6, ranged: 17, body: 24 },
  Ranger: { weapon: 18, ranged: 17, body: 25 },
  Cleric: { weapon: 14, body: 24, shield: true },
  Druid: { weapon: 21, body: 23 },
  Wizard: { weapon: 6, body: 23 },
};

/** Copper weapon, armour and (where it fits) a shield or ranged weapon, so a new party can fight. Deterministic. */
export function equipStarterKit(party: Party): void {
  const rng = new Rng(seedFromString("starter-kit"));
  for (const c of [...party.characters, ...party.reserve]) equipWithKit(party, c, rng);
}

/** The same kit for a hero who joins later (made in the inn). Deterministic in the name and the items handed out so far. */
export function equipRecruit(party: Party, c: Character): void {
  equipWithKit(party, c, new Rng(seedFromString(`starter-kit:${c.name}:${party.itemCounter}`)));
}

function equipWithKit(party: Party, c: Character, rng: Rng): void {
  const kit = STARTER[c.classType];
  const put = (type: number, slot: string) => {
    const item = generateItem(rng, 1, { forcedMaterial: 2, forcedType: type });
    item.id = `i${(party.itemCounter++).toString(36)}`;
    c.inventory.slot1 = item;
    if (!swapSlots(c, "slot1", slot)) {
      c.inventory.slot1 = null;
      return false;
    }
    return true;
  };
  put(kit.weapon, "left_hand");
  if (kit.ranged) put(kit.ranged, "ranged_weapon");
  put(kit.body, "body_armor");
  if (kit.shield) put(34, "right_hand");
  recalcValues(c, party.talents, true, party.mascot);
}

/** A new mascot joins; the Orb changes everyone's maximum spell points, so they are worked out again (current points stay). */
export function setMascot(party: Party, name: string): void {
  party.mascot = name;
  for (const c of party.characters) recalcValues(c, party.talents, false, name);
}

export function activeCharacters(party: Party): number[] {
  return party.characters.map((c, i) => (isAlive(c) && c.conditions.every((x) => x !== "Unconscious") ? i : -1)).filter((i) => i >= 0);
}

export function isDefeated(party: Party): boolean {
  return activeCharacters(party).length === 0;
}

/** Puts an item into the first free bag slot of the party: the four heroes first, then the Donkey's bag; false when every bag is full. */
/** Adds a talent to the party; the ones that change attributes recalculate every hero. */
export function grantTalent(party: Party, talent: string): void {
  if (!party.talents.includes(talent)) party.talents.push(talent);
  if (TALENTS[talent]?.recalc_attribute_values) for (const c of party.characters) recalcValues(c, party.talents, false, party.mascot);
}

export function giveItem(party: Party, item: Item): boolean {
  const bags = [...party.characters.map((c) => c.inventory), ...(party.mascot === "Donkey" ? [party.mascotBag] : [])];
  for (const bag of bags) {
    const slot = BAG_SLOTS.find((s) => bag[s] === null);
    if (slot) {
      if (!item.id) item.id = `i${(party.itemCounter++).toString(36)}`;
      bag[slot] = item;
      return true;
    }
  }
  return false;
}

/** Takes one item of a type out of the backpacks (and the Donkey's bag); returns whether there was one. */
export function takeOne(party: Party, type: string): boolean {
  const bags = [...party.characters.map((c) => c.inventory), ...(party.mascot === "Donkey" ? [party.mascotBag] : [])];
  for (const bag of bags) {
    for (const slot of BAG_SLOTS) {
      if (bag[slot]?.type === type) {
        bag[slot] = null;
        return true;
      }
    }
  }
  return false;
}

/** Takes every item of a type out of the backpacks (and the Donkey's bag); returns how many there were. */
export function takeItems(party: Party, type: string): number {
  const bags = [...party.characters.map((c) => c.inventory), ...(party.mascot === "Donkey" ? [party.mascotBag] : [])];
  let n = 0;
  for (const bag of bags) {
    for (const slot of BAG_SLOTS) {
      if (bag[slot]?.type === type) {
        bag[slot] = null;
        n++;
      }
    }
  }
  return n;
}

/** How many more items the backpacks (and the Donkey's bag) take. */
export function freeSlots(party: Party): number {
  const bags = [...party.characters.map((c) => c.inventory), ...(party.mascot === "Donkey" ? [party.mascotBag] : [])];
  return bags.reduce((n, bag) => n + BAG_SLOTS.filter((slot) => bag[slot] === null).length, 0);
}

/** Every item the party carries, the Donkey's bag included while the Donkey is the mascot (quests count what the Donkey holds too). */
export function carriedItems(party: Party): Item[] {
  const out: Item[] = [];
  const bags = [...party.characters.map((c) => c.inventory), ...(party.mascot === "Donkey" ? [party.mascotBag] : [])];
  for (const bag of bags) for (const item of Object.values(bag)) if (item) out.push(item);
  return out;
}

/**
 * XP is split by giving everyone who can still act the full amount, like the old add_xp_to_party, which asks
 * `get_active_characters` for the heroes whose worst condition lets them act: a sleeping, paralysed, petrified or knocked out
 * hero gets nothing (`activeCharacters` is wider: it only leaves out the dead and the unconscious).
 */
export function addXp(party: Party, xp: number): void {
  for (const c of party.characters) if (canAct(c)) c.xp += Math.max(0, Math.floor(xp));
}

export function addEffect(party: Party, effect: TimedEffect): void {
  // a new effect of the same kind and character replaces the old one
  party.effects = party.effects.filter((e) => !(e.kind === effect.kind && e.character === effect.character && e.element === effect.element));
  party.effects.push(effect);
}

export function hasEffect(party: Party, kind: TimedEffect["kind"]): boolean {
  return party.effects.some((e) => e.kind === kind && (e.until > party.minutes || e.held));
}

/**
 * What the sim must know about where the party stands, set by the game after every step: Walk on Water never runs out under the
 * party's feet (a party that sank would drown), so an expired spell holds until the party leaves the deep water.
 */
export const surroundings = { inDeepWater: false };

/** Can the party cross shallow water (a ford, a shore)? The Swimmer can, as in the old game's rivers; so can the Seafarer and whoever walks on water by a spell (Levitate only keeps the party out of pits, 8. 11. 2026). */
export function canSwim(party: Party): boolean {
  return party.talents.includes("talent_swimmer") || party.talents.includes("talent_seafarer") || hasEffect(party, "walk_on_water");
}

/** Can the party cross deep water? Only the Seafarer, or the spell Walk on Water. */
export function canSail(party: Party): boolean {
  return party.talents.includes("talent_seafarer") || hasEffect(party, "walk_on_water");
}

export function protectionLevel(party: Party, element: "acid" | "fire" | "ice" | "magic"): number {
  return party.effects.filter((e) => e.kind === "protection" && e.element === element && e.until > party.minutes).reduce((sum, e) => sum + (e.amount ?? 0), 0);
}

/** The bank pays this share of the vault on every turn of the week ("Deposit gold for 0.5% interest per week"), compounding, in whole gold pieces. */
export const BANK_INTEREST_PER_WEEK = 0.005;
export const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

/** The gold the bank adds after `weeks` turns of the week to `vault` (each week's interest is earned on the vault including the weeks before, and rounded down). */
export function bankInterest(vault: number, weeks: number): number {
  let total = Math.max(0, vault);
  for (let w = 0; w < weeks && total > 0; w++) total += Math.floor(total * BANK_INTEREST_PER_WEEK);
  return total - Math.max(0, vault);
}

export interface TimePassed {
  /** Gold the bank paid into the vault in the weeks that turned (0 if none did, or the vault was empty). */
  interest: number;
  daysPassed: number;
  /** Spells that ran out. */
  expired: TimedEffect[];
  /** Conditions that ran out or turned into another (poison killing, drink turning into weakness). */
  conditions: ConditionEvent[];
}

/** Advances the clock. Expired effects vanish, conditions whose time is up run out, and one food ration is eaten per day passed. */
export function advanceTime(party: Party, minutes: number): TimePassed {
  const before = party.minutes;
  party.minutes += minutes;
  const daysPassed = Math.floor(party.minutes / MINUTES_PER_DAY) - Math.floor(before / MINUTES_PER_DAY);
  for (let d = 0; d < daysPassed; d++) if (party.food > 0) party.food--;
  // the week turns at every multiple of seven days of game time (saves from before the interest simply start paying from their next turn)
  const weeksPassed = Math.floor(party.minutes / MINUTES_PER_WEEK) - Math.floor(before / MINUTES_PER_WEEK);
  const interest = weeksPassed > 0 ? bankInterest(party.bankGold, weeksPassed) : 0;
  party.bankGold += interest;
  const over = (e: TimedEffect) => e.until <= party.minutes && !(e.held && surroundings.inDeepWater);
  for (const e of party.effects) if (e.kind === "walk_on_water" && e.until <= party.minutes && surroundings.inDeepWater) e.held = true;
  const expired = party.effects.filter(over);
  party.effects = party.effects.filter((e) => !over(e));
  for (const e of expired) {
    const hero = e.character !== undefined ? party.characters[e.character] : undefined;
    if (e.kind === "blessed" && hero) {
      removeCondition(hero, "Blessed");
      if (hero.mods) delete hero.mods.blessing;
    }
    if (e.kind === "stone_skin" && hero?.mods) delete hero.mods.stoneSkin;
    if (e.kind === "rage" && hero?.mods) delete hero.mods.rage;
    if (e.kind === "boon" && e.character !== undefined) endBoon(party, e.character, e.stat);
  }
  // the conditions first (a hero who dies of poison on the day of the birthday does not roll), then the birthdays of the years that turned (old age, 13. 11. 2026)
  return { interest, daysPassed, expired, conditions: [...tickConditions(party), ...birthdays(party, before)] };
}

export function clockText(party: Party): { day: number; hour: number; minute: number } {
  return { day: Math.floor(party.minutes / MINUTES_PER_DAY) + 1, hour: Math.floor((party.minutes % MINUTES_PER_DAY) / 60), minute: party.minutes % 60 };
}

export function isNight(party: Party): boolean {
  const hour = Math.floor((party.minutes % MINUTES_PER_DAY) / 60);
  return hour < 6 || hour >= 20;
}

/**
 * Camp: needs one food ration for the party. The clock runs first, so poison can kill during the night; whoever is left wakes up
 * (sleepers and the knocked out) and is healed and gets the mana back. Drink and weakness are not cured by rest, they run their time
 * (the old `rest`). The dead, the rotten and the petrified do not regain anything.
 */
export function rest(party: Party, hours = 8): { ok: boolean; reason?: "no_food"; conditions?: ConditionEvent[] } {
  if (party.food <= 0) return { ok: false, reason: "no_food" };
  const { conditions } = advanceTime(party, hours * 60);
  for (const c of party.characters) {
    if (!isAlive(c) || c.conditions.includes("Petrified")) continue;
    for (const cond of ["Sleeping", "Unconscious"] as const) removeCondition(c, cond);
    recalcValues(c, party.talents, true, party.mascot);
  }
  return { ok: true, conditions };
}
