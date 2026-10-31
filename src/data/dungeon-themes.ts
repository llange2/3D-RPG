/**
 * The look of a cave or dungeon of the generated world: who lives in it (monsters, boss), which trap it has, what stands in it (props by old
 * item id), which chest and shrine. Since the quest document 1.2 a place is no longer one of the maps of the old game: its quest, layout and
 * level decide, and this module draws the rest from them (`buildLook`). Pure data: no DOM, no Babylon.
 */
import type { Rng } from "../core/rng";
import type { PoiKind } from "../world/types";
import { allowedIn, isFunctional, type Place } from "./item-rules";
import { BOSS_PAIRS, type MonsterGroup, type QuestId } from "./quest-table";
import { BOOKSHELVES } from "./spell-loot";
import { MONSTERS, MONSTER_IDS, monsterGroup, walksOnLand } from "./tables";

export { CARD_COLORS, KEY_COLORS, QUEST_PROP, cardType, keyType, type CardColor, type KeyColor } from "./quest-table";

/**
 * A: free to enter, may hold keys. B: needs one key, may hold key cards. C: a pyramid, needs a key card; its inside is the spaceship, which
 * holds orbs and no key.
 */
export type DungeonClass = "A" | "B" | "C";

/** Who lives here decides what may stand here. */
export type Inhabitants = "vermin" | "goblinoid" | "human" | "mage" | "undead" | "fire" | "dragon" | "construct";

export type ThemeTrap = "guillotine" | "spring" | "pit" | "steal_gold" | "generic" | "none";

export interface DungeonTheme {
  id: string;
  /** Name for the log and the entry prompt. */
  name: string;
  /** One line for the entry prompt. */
  blurb: string;
  kinds: PoiKind[];
  klass: DungeonClass;
  inhabitants: Inhabitants;
  /** Monster ids of the ordinary groups, a monster that counts more often is listed more often. */
  monsters: number[];
  boss: number;
  trap: ThemeTrap;
  /** Element of a `generic` trap; absent = by chance from the trap's uid. */
  trapElement?: "fire" | "ice" | "acid" | "magic";
  /** Old item ids of the decoration (weights are equal). */
  props: number[];
  /** Old item id of the objects that hold loot. */
  chest: number;
  /** Old item id of the objects that bless the party (crystal, altar, well), or null for none. */
  shrine: number | null;
  quest: QuestId;
  /** Added to the level of the chests, and the gold in percent of the usual. */
  loot: { level: number; gold: number };
}

/** Old item ids that do not belong to a kind of inhabitant. */
export const FORBIDDEN_PROPS: Record<Inhabitants, readonly number[]> = {
  // spiders and beasts use no furniture, no books, no fire place
  vermin: [94, 14, 75, 97, 15, 104, 105, 71],
  // wild folk have no ritual circle, no altar, no shelf and no banners of orderly realms
  goblinoid: [35, 73, 75, 97, 104, 105],
  // orderly folk do not decorate with bones and hanging skeletons
  human: [70, 93],
  mage: [5],
  undead: [5, 14, 94],
  fire: [75, 97, 117],
  dragon: [94, 14, 15, 75, 97, 104, 105],
  construct: [70, 62, 127, 93, 5],
};

const INHABITANTS: Record<MonsterGroup, Inhabitants> = {
  beast: "vermin",
  plant: "vermin",
  humanoid: "human",
  monster_humanoid: "goblinoid",
  magical_construct: "construct",
  undead: "undead",
  robot: "construct",
};

/** The decoration of a dungeon; the caves have the short list of the document (mining tools, wheelbarrow, skull on a spike, bone pile, crystals). */
const DUNGEON_DECOR = [12, 13, 14, 15, 16, 27, 29, 32, 34, 61, 62, 63, 69, 70, 71, 75, 76, 83, 94, 95, 97, 98, 99, 125, 127, 128];
const CAVE_DECOR = [12, 16, 38, 70, 117];
const CHESTS = [1, 74, 72, 96, 4];
const SHRINES = [35, 37, 88, 117, 86];

/** The effect a shrine of this kind tends to have (crystals raise attributes, red wells heal, altars guard against the elements). */
export const SHRINE_EFFECT: Record<number, "resist" | "attribute" | "heal"> = { 117: "attribute", 88: "attribute", 14: "attribute", 35: "resist", 37: "heal", 86: "heal" };

const BOSS_IDS = new Set(BOSS_PAIRS.map((p) => p.boss));
const levelOf = (id: number): number => MONSTERS[id]!.treasure_level;

/** The land monsters of the groups, without the bosses of quest 5 (they lead a population, they are no ordinary monsters). */
export function monstersOfGroups(groups: readonly MonsterGroup[]): number[] {
  return MONSTER_IDS.filter((id) => groups.includes(monsterGroup(id) as MonsterGroup) && walksOnLand(MONSTERS[id]!) && !BOSS_IDS.has(id));
}

/**
 * Up to three ordinary monsters of the groups for a tier: the ones of the tier's own level and the one below (a place keeps to its level), or
 * the weakest of the groups if all of them are above it, and the boss: the strongest that is at most one level above the tier (not above the
 * tier at all on tier 1, so a new party can win).
 */
export function pickMonsters(rng: Rng, groups: readonly MonsterGroup[], tier: number): { monsters: number[]; boss: number } {
  const pool = monstersOfGroups(groups);
  let fit = pool.filter((id) => levelOf(id) <= tier);
  if (fit.length === 0) {
    const weakest = Math.min(...pool.map(levelOf));
    fit = pool.filter((id) => levelOf(id) === weakest);
  }
  const near = fit.filter((id) => levelOf(id) >= tier - 1);
  const candidates = near.length >= 2 ? near : fit;
  const monsters = rng.shuffle([...candidates]).slice(0, 3);
  const limit = Math.min(5, tier + (tier >= 2 ? 1 : 0));
  const strong = pool.filter((id) => levelOf(id) <= limit);
  const top = strong.length > 0 ? Math.max(...strong.map(levelOf)) : levelOf(monsters[0]!);
  const bosses = strong.filter((id) => levelOf(id) === top);
  return { monsters, boss: bosses.length > 0 ? bosses[rng.int(bosses.length)]! : monsters[0]! };
}

const placeOf = (kind: PoiKind): Place => (kind === "cave" ? "cave" : "dungeon");

/**
 * The look of a place: the props the inhabitants may have and the place allows (and that are no functional objects), a chest, a shrine, a
 * trap. `groups` are the monster groups of the quest; the first one decides the inhabitants.
 */
export function buildLook(
  rng: Rng,
  kind: "dungeon" | "cave",
  tier: number,
  quest: QuestId,
  name: string,
  groups: readonly MonsterGroup[],
  klass: DungeonClass,
  id: string,
  led?: { population: number; boss: number },
): DungeonTheme {
  const place = placeOf(kind);
  const picked = pickMonsters(rng, groups, tier);
  // a place led by a boss (quest 5): the population is 60 % of the monsters (three of five), the rest are two others of the groups
  const monsters = led ? [led.population, led.population, led.population, ...picked.monsters.filter((m) => m !== led.population).slice(0, 2)] : picked.monsters;
  const boss = led ? led.boss : picked.boss;
  const inhabitants = INHABITANTS[(monsterGroup(monsters[0]!) as MonsterGroup) || groups[0]!];
  const fits = (i: number) => allowedIn(i, place) && !FORBIDDEN_PROPS[inhabitants].includes(i);
  const chest = rng.shuffle(CHESTS.filter(fits))[0] ?? 1;
  const shrines = SHRINES.filter(fits);
  const shrine = shrines.length > 0 && rng.chance(700) ? shrines[rng.int(shrines.length)]! : null;
  // (a bookshelf is a container, but it stands as a prop: `generateContent` makes a container of it)
  const props = (kind === "cave" ? CAVE_DECOR : DUNGEON_DECOR).filter((i) => fits(i) && (!isFunctional(i) || BOOKSHELVES.includes(i)) && i !== chest && i !== shrine);
  // a dungeon has one kind of trap or none; a cave only the puddles of acid, lava and magic flames
  const traps: [ThemeTrap, number][] = kind === "cave" ? [["none", 3], ["generic", 4]] : [["guillotine", 2], ["spring", 2], ["pit", 2], ["generic", 2], ["none", 1]];
  const trap = traps[rng.weightedIndex(traps.map(([, w]) => w))]![0];
  const elements = kind === "cave" ? (["fire", "acid", "magic"] as const) : (["fire", "ice", "acid", "magic"] as const);
  return {
    id,
    name,
    blurb: name,
    kinds: [kind],
    klass,
    inhabitants,
    monsters,
    boss,
    trap,
    ...(trap === "generic" ? { trapElement: elements[rng.int(elements.length)]! } : {}),
    props,
    chest,
    shrine,
    quest,
    loot: { level: 0, gold: 100 },
  };
}
