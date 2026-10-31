import type { Rng } from "../core/rng";
import { MAP_ITEMS } from "./tables";

/**
 * Traps in chests that are not locked (34th playtest): a chest without a lock (a barrel, a heap of treasure, a crate, a gravestone with something in it) springs a trap
 * on one in five. The trap is fixed when the place is generated (`trapped` = its element, `trapDamage`, `trapLevel` on the `treasure` action); when the party opens it, a hero
 * chosen by chance is hit unless luck saves them. The damage grows with the level of the place like the damage of an ordinary trap (`TRAP_DAMAGE.generic`).
 */
export const CHEST_TRAP_CHANCE = 200; // permille

export const CHEST_TRAP_ELEMENTS = ["fire", "ice", "acid", "magic"] as const;
export type ChestTrapElement = (typeof CHEST_TRAP_ELEMENTS)[number];

/** Luck is divided by 20 on level 1, 40 on level 2 and so on up to 100 on level 5: that fraction of the time the hero gets out of the way. */
export const DODGE_STEP = 20;

/** The chance (0 to 1) that a hero with this luck avoids a trap of a place of this level. */
export function dodgeChance(luck: number, level: number): number {
  const tier = Math.min(5, Math.max(1, Math.round(level)));
  return Math.min(1, Math.max(0, luck / (DODGE_STEP * tier)));
}

export interface TrapHero {
  name: string;
  female: boolean;
}

const pick = <T>(rng: Rng, list: readonly T[]): T => list[rng.int(list.length)]!;
const fill = (text: string, hero: TrapHero, damage = 0): string =>
  text
    .replaceAll("{hero}", hero.name)
    .replaceAll("{hero's}", `${hero.name}'s`)
    .replaceAll("{his}", hero.female ? "her" : "his")
    .replaceAll("{him}", hero.female ? "her" : "him")
    .replaceAll("{he}", hero.female ? "she" : "he")
    .replaceAll("{n}", String(damage));

/** How the party opens the container: the start of the first sentence. `{hero}` is the one who does it. */
function opening(chest: number, rng: Rng): string {
  if (chest === 5) return pick(rng, ["After {hero} opens the lid of the barrel", "As {hero} pries the lid off the barrel", "The moment {hero} lifts the lid of the barrel"]);
  if (chest === 4) return pick(rng, ["As {hero} digs into the heap of treasure", "The moment {hero} reaches into the pile of coins", "When {hero} shoves the gold aside"]);
  const name = MAP_ITEMS[chest]?.name ?? "";
  if (name.startsWith("Chest")) return pick(rng, ["After {hero} opens the lid of the chest", "As {hero} flips the latch of the chest", "The moment {hero} lifts the lid of the chest"]);
  const label = (name.replace(/\s*\(.*\)/, "").split(": ").reverse().join(" ") || "container").toLowerCase();
  return pick(rng, [`As {hero} rummages through the ${label}`, `The moment {hero} reaches into the ${label}`]);
}

interface ElementLines {
  /** The rest of the first sentence: what comes out. */
  rises: readonly string[];
  /** The second sentence when it hits (`{n}` is the damage). */
  hits: readonly string[];
  /** The second sentence when the hero is lucky. */
  misses: readonly string[];
}

const LINES: Record<ChestTrapElement, ElementLines> = {
  acid: {
    rises: ["a large acid bubble rises up quickly.", "a jet of green acid squirts out of a hidden vial.", "a bubbling cloud of acid hisses up from the inside."],
    hits: ["It hits {hero} in {his} face and deals {n} damage.", "The acid splashes over {hero's} face and deals {n} damage.", "{hero} gets the acid right in the eyes and takes {n} damage."],
    misses: ["{hero} was lucky, as the acid drops barely miss {his} face.", "{hero} jerks back just in time, and the acid eats a hole into the floor instead.", "{hero} ducks, and the acid hisses away on the stones."],
  },
  fire: {
    rises: ["a tongue of flame shoots out of the dark.", "a hidden charge bursts into a roaring fireball.", "a jet of fire whooshes up."],
    hits: ["It singes {hero's} face and deals {n} damage.", "The flames lick over {hero} and deal {n} damage.", "{hero} catches the fireball with {his} face and takes {n} damage."],
    misses: ["{hero} was lucky, as the flames barely miss {his} face.", "{hero} throws {his} head back just in time, and the fire licks the air.", "{hero} dives aside, and the fireball burns out against the wall."],
  },
  ice: {
    rises: ["a cloud of freezing mist billows out.", "a razor-sharp spike of ice shoots up.", "a blast of icy air bursts out with a crackle of frost."],
    hits: ["It hits {hero} in {his} face and deals {n} damage.", "The frost bites into {hero} and deals {n} damage.", "{hero} gets a faceful of ice and takes {n} damage."],
    misses: ["{hero} was lucky, as the icy air barely misses {his} face.", "{hero} leans away just in time, and the spike of ice shatters on the floor.", "{hero} ducks, and the frost crackles over {his} shoulder."],
  },
  magic: {
    rises: ["a swirl of violet sparks whirls up.", "a crackling bolt of raw magic leaps out.", "a glowing rune flares up and spits a ball of wild magic."],
    hits: ["It hits {hero} in {his} face and deals {n} damage.", "The sparks rip through {hero} and deal {n} damage.", "{hero} takes the bolt full in the chest and suffers {n} damage."],
    misses: ["{hero} was lucky, as the sparks barely miss {his} face.", "{hero} flinches aside just in time, and the bolt crashes into the ceiling.", "{hero} ducks, and the ball of magic fizzles out behind {him}."],
  },
};

/** The first sentence of the trap, the same whether it hits or not. */
export function trapOpening(chest: number, element: ChestTrapElement, hero: TrapHero, rng: Rng): string {
  return fill(`${opening(chest, rng)} ${pick(rng, LINES[element].rises)}`, hero);
}

/** The second sentence when the trap hits the hero for `damage`. */
export function trapHit(element: ChestTrapElement, hero: TrapHero, damage: number, rng: Rng): string {
  return fill(pick(rng, LINES[element].hits), hero, damage);
}

/** The second sentence when luck saves the hero. */
export function trapMiss(element: ChestTrapElement, hero: TrapHero, rng: Rng): string {
  return fill(pick(rng, LINES[element].misses), hero);
}

/** The second sentence when a spell of elemental protection takes all of the damage away. */
export function trapProtected(hero: TrapHero): string {
  return fill("It would have hit {hero} in {his} face, were it not for the active elemental protection spell.", hero);
}

/** The second sentence when resistance or the like takes all of the damage away without a spell. */
export function trapShrugged(hero: TrapHero): string {
  return fill("It hits {hero} in {his} face, but {he} does not even feel it.", hero);
}
