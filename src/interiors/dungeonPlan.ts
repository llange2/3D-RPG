import { LAYER, rngFor, type Rng, type SeedState } from "../core/rng";
import { CARD_COLORS, DUNGEON_THEMES, THEMES_BY_ID, cardType, keyType, type DungeonTheme } from "../data/dungeon-themes";
import type { Poi } from "../world/types";
import type { World } from "../world/world";
import type { DungeonRef } from "./types";

/**
 * Which theme every cave and dungeon of the generated world has, and how the places hang together by keys (chapter 1.2 of
 * docs/DUNGEON_THEMES.md). The unit is the region: its caves and dungeons are planned together, so that every key a Class B
 * dungeon asks for lies in a free Class A place of the same region and every key card a pyramid asks for in a Class B dungeon of it.
 * Without that a region could contain a door and no key. A pure function of the world seed and the region.
 */

/** Chance (permille) that a dungeon asks for a key, and that a high dungeon is a pyramid. */
const KEYED = 330;
const PYRAMID = 150;
/** A theme a region already has is this much less likely to come twice (percent). */
const REPEAT_PERCENT = 20;

const isClass = (t: DungeonTheme, ...k: DungeonTheme["klass"][]) => k.includes(t.klass);

/** Themes that can stand in a place of this kind and tier, or, if there are none, the ones closest in tier. */
function fitting(candidates: readonly DungeonTheme[], poi: Poi): DungeonTheme[] {
  const ofKind = candidates.filter((t) => t.kinds.includes(poi.kind));
  const exact = ofKind.filter((t) => poi.tier >= t.tier[0] && poi.tier <= t.tier[1]);
  if (exact.length > 0) return exact;
  const gap = (t: DungeonTheme) => (poi.tier < t.tier[0] ? t.tier[0] - poi.tier : poi.tier - t.tier[1]);
  const nearest = Math.min(...ofKind.map(gap));
  return ofKind.filter((t) => gap(t) === nearest);
}

function pickTheme(rng: Rng, options: readonly DungeonTheme[], used: ReadonlyMap<string, number>): DungeonTheme {
  const weights = options.map((t) => Math.max(1, Math.floor((t.weight * (used.has(t.id) ? REPEAT_PERCENT : 100)) / 100)));
  return options[rng.weightedIndex(weights)]!;
}

export const refOf = (t: DungeonTheme, requires: string | null): DungeonRef => ({
  id: t.id,
  klass: t.klass,
  requires,
  gives: [...t.givesKeys.map(keyType), ...(t.givesCard ? [cardType(t.givesCard)] : [])],
});

/**
 * The plan of every cave and dungeon of one region, by POI id, from the world seed and the region's places alone (the world needs it while it
 * builds the region: a dungeon that asks for a key card is a pyramid, and a pyramid stands on more tiles).
 */
export function planPlaces(rootSeed: SeedState, rx: number, ry: number, pois: readonly Poi[]): Map<string, DungeonRef> {
  const out = new Map<string, DungeonRef>();
  const places = pois.filter((p) => p.kind === "dungeon" || p.kind === "cave");
  if (places.length === 0) return out;
  const rng = rngFor(rootSeed, LAYER.INTERIOR, "plan", rx, ry);
  const used = new Map<string, number>();
  const take = (poi: Poi, t: DungeonTheme, requires: string | null) => {
    out.set(poi.id, refOf(t, requires));
    used.set(t.id, (used.get(t.id) ?? 0) + 1);
  };

  // what each place wants to be; one roll per place so the number of places does not shift the others' streams
  const wish = new Map<string, "A" | "B" | "C">();
  for (const poi of places) {
    const roll = rng.int(1000);
    wish.set(poi.id, poi.kind === "dungeon" && roll < KEYED ? "B" : poi.kind === "dungeon" && poi.tier >= 4 && roll < KEYED + PYRAMID ? "C" : "A");
  }

  // 1. free places: they hold the keys
  const free = DUNGEON_THEMES.filter((t) => isClass(t, "A"));
  const keys = new Set<string>();
  const freeOf = (poi: Poi) => {
    const t = pickTheme(rng, fitting(free, poi), used);
    take(poi, t, null);
    for (const k of t.givesKeys) keys.add(k);
  };
  for (const poi of places) if (wish.get(poi.id) === "A") freeOf(poi);

  // 2. key dungeons: only for a key some free place of the region holds, and each key opens one dungeon
  const cards = new Set<string>();
  const keyed = DUNGEON_THEMES.filter((t) => isClass(t, "B"));
  const openKeys = new Set(keys);
  for (const poi of places) {
    if (wish.get(poi.id) !== "B") continue;
    const options = fitting(
      keyed.filter((t) => t.needsKey !== undefined && openKeys.has(t.needsKey)),
      poi,
    ).filter((t) => poi.tier >= t.tier[0] && poi.tier <= t.tier[1]);
    if (options.length === 0) {
      freeOf(poi);
      continue;
    }
    const t = pickTheme(rng, options, used);
    openKeys.delete(t.needsKey!);
    take(poi, t, keyType(t.needsKey!));
    if (t.givesCard) cards.add(t.givesCard);
  }

  // 3. pyramids: only for a card a key dungeon of the region holds, and each card opens one pyramid
  const pyramid = DUNGEON_THEMES.find((t) => t.klass === "C")!;
  const openCards = [...CARD_COLORS].filter((c) => cards.has(c));
  for (const poi of places) {
    if (wish.get(poi.id) !== "C") continue;
    if (openCards.length === 0 || poi.tier < pyramid.tier[0]) {
      freeOf(poi);
      continue;
    }
    const card = openCards.splice(rng.int(openCards.length), 1)[0]!;
    take(poi, pyramid, cardType(card));
  }
  return out;
}

/** The plan of every cave and dungeon of one region, by POI id. */
export function planRegion(world: World, rx: number, ry: number): Map<string, DungeonRef> {
  return planPlaces(world.rootSeed, rx, ry, world.region(rx, ry).pois);
}

const cache = new WeakMap<World, Map<string, Map<string, DungeonRef>>>();

/** A place that is not part of a region plan (a hand-made one in a test): a free place of its own. */
function standalone(world: World, poi: Poi): DungeonRef {
  const rng = rngFor(world.rootSeed, LAYER.INTERIOR, poi.x, poi.y, 0, "dungeon");
  const free = DUNGEON_THEMES.filter((t) => isClass(t, "A"));
  return refOf(pickTheme(rng, fitting(free, poi), new Map()), null);
}

/** The dungeon theme and key chain role of a cave or dungeon; null for towns and castles. */
export function planDungeon(world: World, poi: Poi): DungeonRef | null {
  if (poi.kind !== "dungeon" && poi.kind !== "cave") return null;
  let regions = cache.get(world);
  if (!regions) cache.set(world, (regions = new Map()));
  const key = `${poi.region.rx},${poi.region.ry}`;
  let plan = regions.get(key);
  if (!plan) regions.set(key, (plan = planRegion(world, poi.region.rx, poi.region.ry)));
  return plan.get(poi.id) ?? standalone(world, poi);
}

function add(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export interface ChainPlace {
  id: string;
  ref: DungeonRef;
}

/**
 * Checks the rules of chapter 1.2 for the places of one world region. Returns the problems found; empty means the chain holds:
 * every key or key card a place asks for is held by some place of the same list and opens only one place, and no place holds what its
 * class forbids.
 */
export function checkKeyChain(places: readonly ChainPlace[]): string[] {
  const issues: string[] = [];
  const holders = new Map<string, string[]>();
  const openers = new Map<string, string[]>();
  for (const p of places) {
    const t = THEMES_BY_ID[p.ref.id];
    if (!t) {
      issues.push(`${p.id}: unknown theme ${p.ref.id}`);
      continue;
    }
    for (const g of p.ref.gives) add(holders, g, p.id);
    if (p.ref.requires) add(openers, p.ref.requires, p.id);
    const gives = p.ref.gives;
    const isKey = (s: string) => s.startsWith("quest_key_");
    const isCard = (s: string) => s.endsWith("_keycard");
    if (t.klass === "A") {
      if (p.ref.requires) issues.push(`${p.id}: a free place asks for ${p.ref.requires}`);
      if (gives.some(isCard)) issues.push(`${p.id}: a free place holds a key card`);
    } else if (t.klass === "B") {
      if (!p.ref.requires || !isKey(p.ref.requires)) issues.push(`${p.id}: a key place must ask for a key`);
      if (gives.some(isKey)) issues.push(`${p.id}: a key place holds a key`);
      if (gives.filter(isCard).length > 1) issues.push(`${p.id}: a key place holds more than one key card`);
    } else {
      if (!p.ref.requires || !isCard(p.ref.requires)) issues.push(`${p.id}: a pyramid must ask for a key card`);
      if (gives.length > 0) issues.push(`${p.id}: a pyramid holds ${gives.join(", ")}`);
    }
  }
  for (const [need, ids] of openers) {
    if (!holders.has(need)) issues.push(`${ids.join(", ")} ask for ${need}, which no place of the region holds`);
    if (ids.length > 1) issues.push(`${need} opens ${ids.length} places: ${ids.join(", ")}`);
  }
  return issues;
}
