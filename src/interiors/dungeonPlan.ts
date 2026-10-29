import { LAYER, Rng, rngFor, type SeedState } from "../core/rng";
import { buildLook, type DungeonClass } from "../data/dungeon-themes";
import {
  BOSS_PAIRS,
  CARD_COLORS,
  KEY_COLORS,
  MAX_ITEMS_PER_ROOM,
  ORBS_IN_WORLD,
  ORBS_PER_SECTION,
  QUESTS,
  SIZE_SCALE,
  SECTIONS,
  cardType,
  keyType,
  type LayoutId,
  type MonsterGroup,
  type QuestId,
} from "../data/quest-table";
import { MONSTERS } from "../data/tables";
import type { Poi, WorldSize } from "../world/types";
import type { World } from "../world/world";
import type { DungeonRef } from "./types";

/**
 * Which quest, layout and look every cave and dungeon of the generated world has, and how the places hang together by keys, key cards and
 * orbs (quest document 1.2, "End-Räume"). The unit is the whole world, not an island: the keys lie in the end rooms of level 1 and 2, the key cards
 * in the end rooms of level 4 and 5 dungeons, the orbs in the level 5 dungeons, and a key opens one dungeon wherever it stands. The five pyramids
 * (the entrances of the spaceship's five sections) are spread over the islands. A pure function of the world seed and the places.
 */

/** The orbs that lie in the dungeons: the rest of the 31 are in the spaceship. */
const DUNGEON_ORBS = ORBS_IN_WORLD - ORBS_PER_SECTION * SECTIONS;

const isDungeon = (p: Poi) => p.kind === "dungeon";

/** The pyramids: one dungeon on each island in turn, in an order the seed decides, until there are five. */
function pickPyramids(rng: Rng, dungeons: readonly Poi[]): Poi[] {
  const byIsland = new Map<number, Poi[]>();
  for (const p of dungeons) {
    const list = byIsland.get(p.region.rx);
    if (list) list.push(p);
    else byIsland.set(p.region.rx, [p]);
  }
  const islands = rng.shuffle([...byIsland.keys()].sort((a, b) => a - b));
  for (const i of islands) byIsland.set(i, rng.shuffle(byIsland.get(i)!));
  const out: Poi[] = [];
  for (let round = 0; out.length < SECTIONS; round++) {
    let any = false;
    for (const i of islands) {
      const list = byIsland.get(i)!;
      if (round < list.length && out.length < SECTIONS) {
        out.push(list[round]!);
        any = true;
      }
    }
    if (!any) break;
  }
  return out;
}

/** The deck of quests a kind of place draws from; a deck is shuffled again every time it is used up, so a world shows every quest. */
class Deck {
  private left: QuestId[] = [];
  constructor(
    private readonly rng: Rng,
    private readonly quests: readonly QuestId[],
  ) {}
  draw(): QuestId {
    if (this.left.length === 0) this.left = this.rng.shuffle([...this.quests]);
    return this.left.pop()!;
  }
}

const layoutsFor = (quest: QuestId, kind: "dungeon" | "cave"): LayoutId[] => QUESTS[quest].layouts.filter((l) => l.startsWith(kind));

/**
 * Quest 5: the population of the place's level, the boss that leads it. The population counts 60 % of the groups, so it is listed three times
 * against two of the others.
 */
function bossPair(rng: Rng, tier: number): { population: number; boss: number } {
  const fitting = BOSS_PAIRS.filter((p) => MONSTERS[p.population]!.treasure_level === tier);
  const pool = fitting.length > 0 ? fitting : BOSS_PAIRS.filter((p) => MONSTERS[p.population]!.treasure_level <= tier);
  return pool[rng.int(pool.length)]!;
}

export function planPlaces(rootSeed: SeedState, size: WorldSize, pois: readonly Poi[]): Map<string, DungeonRef> {
  const out = new Map<string, DungeonRef>();
  const places = pois.filter((p) => p.kind === "dungeon" || p.kind === "cave");
  if (places.length === 0) return out;
  const rng = rngFor(rootSeed, LAYER.INTERIOR, "quest-plan");
  const perRoom = MAX_ITEMS_PER_ROOM[size] ?? 1;

  // 1. the pyramids and their cards
  const pyramids = pickPyramids(rng, places.filter(isDungeon));
  const pyramidIds = new Set(pyramids.map((p) => p.id));
  const ordinary = places.filter((p) => !pyramidIds.has(p.id));
  const dungeons = ordinary.filter(isDungeon);

  // 2. the keys: the dungeons of level 3 to 5 are locked as far as the nine keys go, each key lies in the end room of a level 1 or 2 place
  const keyHolders = ordinary.filter((p) => p.tier <= 2);
  const lockable = rng.shuffle(dungeons.filter((p) => p.tier >= 3));
  const keyCount = Math.min(KEY_COLORS.length, lockable.length, keyHolders.length * perRoom);
  const colours = rng.shuffle([...KEY_COLORS]);
  const requires = new Map<string, string>();
  const gives = new Map<string, string[]>();
  const give = (holder: Poi, type: string) => {
    const list = gives.get(holder.id);
    if (list) list.push(type);
    else gives.set(holder.id, [type]);
  };
  // each key goes to the holder that has the fewest, by chance among equals
  const leastLoaded = (holders: readonly Poi[], cap = perRoom): Poi => {
    const open = holders.filter((h) => (gives.get(h.id)?.length ?? 0) < cap);
    const least = Math.min(...open.map((h) => gives.get(h.id)?.length ?? 0));
    const tied = open.filter((h) => (gives.get(h.id)?.length ?? 0) === least);
    return tied[rng.int(tied.length)]!;
  };
  for (let i = 0; i < keyCount; i++) {
    requires.set(lockable[i]!.id, keyType(colours[i]!));
    give(leastLoaded(keyHolders), keyType(colours[i]!));
  }

  // 3. the key cards: one for each pyramid, in the end room of a level 4 or 5 dungeon
  // a small world may have fewer such dungeons than pyramids: then a room holds more cards than keys (three at most), so that every pyramid has its card
  const cardHolders = dungeons.filter((p) => p.tier >= 4).length > 0 ? dungeons.filter((p) => p.tier >= 4) : dungeons;
  const cardsPerRoom = Math.min(3, Math.max(perRoom, Math.ceil(pyramids.length / Math.max(1, cardHolders.length))));
  const cardCount = Math.min(CARD_COLORS.length, pyramids.length, cardHolders.length * cardsPerRoom);
  const sectionOf = new Map<string, number>();
  pyramids.forEach((p, i) => {
    sectionOf.set(p.id, i);
    if (i < cardCount) {
      requires.set(p.id, cardType(CARD_COLORS[i]!));
      give(leastLoaded(cardHolders, cardsPerRoom), cardType(CARD_COLORS[i]!));
    }
  });

  // 4. the orbs: 21 on the level 5 dungeons (the level 4 ones if the world has no level 5), as evenly as the number allows
  const orbHolders = dungeons.filter((p) => p.tier >= 5).length > 0 ? dungeons.filter((p) => p.tier >= 5) : dungeons.filter((p) => p.tier >= 4);
  const orbs = new Map<string, number>();
  const orbOrder = rng.shuffle([...orbHolders]);
  orbOrder.forEach((p, i) => orbs.set(p.id, Math.floor(DUNGEON_ORBS / orbOrder.length) + (i < DUNGEON_ORBS % orbOrder.length ? 1 : 0)));

  // 5. quest, layout and look of every place
  const decks = { dungeon: new Deck(rng, Object.keys(QUESTS) as QuestId[]), cave: new Deck(rng, (Object.keys(QUESTS) as QuestId[]).filter((q) => layoutsFor(q, "cave").length > 0)) };
  for (const poi of places) {
    const kind = poi.kind as "dungeon" | "cave";
    const look = rngFor(rootSeed, LAYER.INTERIOR, "quest-look", poi.id);
    const need = requires.get(poi.id) ?? null;
    const holds = gives.get(poi.id) ?? [];
    if (pyramidIds.has(poi.id)) {
      // (the same look for all five pyramids: behind each of them is the same level)
      const theme = buildLook(rngFor(rootSeed, LAYER.INTERIOR, "spaceship-look"), "dungeon", 5, "quest_6", "Spaceship", ["robot"], "C", "spaceship");
      out.set(poi.id, { id: "spaceship", klass: "C", quest: "spaceship", layout: "spaceship_1", look: theme, requires: need, gives: [], orbs: ORBS_PER_SECTION, minis: 0, coins: 0, skulls: 0, scale: SIZE_SCALE[size] ?? 1, section: sectionOf.get(poi.id)! });
      continue;
    }
    const quest = decks[kind].draw();
    const layout = rngPick(look, layoutsFor(quest, kind));
    const def = QUESTS[quest];
    const klass: DungeonClass = need ? "B" : "A";
    const name = `${def.name} (${layout})`;
    const theme = buildLook(look, kind, poi.tier, quest, name, def.groups as MonsterGroup[], klass, `${quest}/${layout}`, quest === "quest_5" ? bossPair(look, poi.tier) : undefined);
    out.set(poi.id, { id: `${quest}/${layout}`, klass, quest, layout, look: theme, requires: need, gives: holds, orbs: orbs.get(poi.id) ?? 0, minis: 0, coins: 0, skulls: 0, scale: SIZE_SCALE[size] ?? 1 });
  }
  distributeItems(rng, out, places, pois);
  return out;
}

/** The Quatloo coins (25), the silver skulls (15) and Seth Squirm are spread over the places that may hold them (ue_quest_1 and ue_quest_2). */
export const COINS_IN_WORLD = 25;
export const SKULLS_IN_WORLD = 15;
/** Coins in the chests of a castle's yard, for each castle of level 2 and 3. */
export const COINS_PER_CASTLE = 2;

function distributeItems(rng: Rng, refs: Map<string, DungeonRef>, places: readonly Poi[], all: readonly Poi[]): void {
  const spread = (holders: Poi[], total: number, cap: number, add: (p: Poi) => void): void => {
    const order = rng.shuffle([...holders]);
    const given = new Map<string, number>();
    for (let n = 0; n < total && order.length > 0; n++) {
      const open = order.filter((p) => (given.get(p.id) ?? 0) < cap);
      if (open.length === 0) break;
      const least = Math.min(...open.map((p) => given.get(p.id) ?? 0));
      const poi = open.find((p) => (given.get(p.id) ?? 0) === least)!;
      given.set(poi.id, (given.get(poi.id) ?? 0) + 1);
      add(poi);
    }
  };
  const ordinary = places.filter((p) => refs.get(p.id)?.klass !== "C");
  const castles = all.filter((p) => p.kind === "castle" && (p.tier === 2 || p.tier === 3));
  const coinHolders = ordinary.filter((p) => p.tier <= 3);
  spread(coinHolders, COINS_IN_WORLD - COINS_PER_CASTLE * castles.length, 4, (p) => void (refs.get(p.id)!.coins += 1));
  const low = ordinary.filter((p) => p.tier === 1);
  spread(low, SKULLS_IN_WORLD, Math.max(3, Math.ceil(SKULLS_IN_WORLD / Math.max(1, low.length))), (p) => void (refs.get(p.id)!.skulls += 1));
  // Seth Squirm and the machines: a dungeon of level 2
  const seth = rng.shuffle(ordinary.filter((p) => p.kind === "dungeon" && p.tier === 2));
  const home = seth[0] ?? rng.shuffle(ordinary.filter((p) => p.kind === "dungeon" && p.tier <= 3))[0];
  if (home) refs.get(home.id)!.seth = true;
}

function rngPick<T>(rng: Rng, list: readonly T[]): T {
  return list[rng.int(list.length)]!;
}

/** A place that is not part of the plan of a world (a hand-made one in a test): a free place with a quest of its own, holding nothing for the chain. */
function standalone(world: World, poi: Poi): DungeonRef {
  const kind = poi.kind as "dungeon" | "cave";
  const rng = rngFor(world.rootSeed, LAYER.INTERIOR, poi.x, poi.y, 0, "dungeon");
  const quests = (Object.keys(QUESTS) as QuestId[]).filter((q) => layoutsFor(q, kind).length > 0);
  const quest = quests[rng.int(quests.length)]!;
  const layout = rngPick(rng, layoutsFor(quest, kind));
  const theme = buildLook(rng, kind, poi.tier, quest, `${QUESTS[quest].name} (${layout})`, QUESTS[quest].groups as MonsterGroup[], "A", `${quest}/${layout}`, quest === "quest_5" ? bossPair(rng, poi.tier) : undefined);
  return { id: `${quest}/${layout}`, klass: "A", quest, layout, look: theme, requires: null, gives: [], orbs: 0, minis: 0, coins: 0, skulls: 0, scale: 1 };
}

/** The plan of a cave or dungeon, from the plan of the world; null for towns and castles. */
export function planDungeon(world: World, poi: Poi): DungeonRef | null {
  if (poi.kind !== "dungeon" && poi.kind !== "cave") return null;
  return world.dungeonRef(poi.id) ?? standalone(world, poi);
}

export interface ChainPlace {
  id: string;
  ref: DungeonRef;
}

/**
 * Checks the rules of the chain for the places of a world. Returns the problems found; empty means it holds: every key or key card a place asks
 * for lies in exactly one place and opens only one, keys lie in level 1 or 2 places, key cards in level 4 or 5 dungeons, and a free place asks for nothing.
 */
export function checkKeyChain(places: readonly ChainPlace[], tierOf: (id: string) => number): string[] {
  const issues: string[] = [];
  const holders = new Map<string, string[]>();
  const openers = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, value: string) => map.set(key, [...(map.get(key) ?? []), value]);
  const isKey = (s: string) => s.startsWith("quest_key_");
  const isCard = (s: string) => s.endsWith("_keycard");
  for (const p of places) {
    for (const g of p.ref.gives) {
      add(holders, g, p.id);
      if (isKey(g) && tierOf(p.id) > 2) issues.push(`${p.id}: holds the key ${g} but is level ${tierOf(p.id)}`);
      if (isCard(g) && (tierOf(p.id) < 4 || p.ref.layout.startsWith("cave"))) issues.push(`${p.id}: holds the key card ${g} but is no level 4 or 5 dungeon`);
    }
    if (p.ref.requires) add(openers, p.ref.requires, p.id);
    if (p.ref.klass === "A" && p.ref.requires) issues.push(`${p.id}: a free place asks for ${p.ref.requires}`);
    if (p.ref.klass === "B" && (!p.ref.requires || !isKey(p.ref.requires))) issues.push(`${p.id}: a key place must ask for a key`);
    if (p.ref.klass === "C" && (!p.ref.requires || !isCard(p.ref.requires))) issues.push(`${p.id}: a pyramid must ask for a key card`);
    if (p.ref.klass === "B" && p.ref.layout.startsWith("cave")) issues.push(`${p.id}: a cave is never locked`);
    if (p.ref.klass === "B" && tierOf(p.id) < 3) issues.push(`${p.id}: a level 1 or 2 place is never locked`);
  }
  for (const [need, ids] of openers) {
    if (!holders.has(need)) issues.push(`${ids.join(", ")} ask for ${need}, which no place holds`);
    if (ids.length > 1) issues.push(`${need} opens ${ids.length} places: ${ids.join(", ")}`);
  }
  for (const [item, ids] of holders) if (ids.length > 1) issues.push(`${item} lies in ${ids.length} places`);
  return issues;
}
