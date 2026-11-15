import { LAYER, rngFor } from "../core/rng";
import { hintTale } from "../data/caravan-hints";
import { hutIndex } from "./huts";
import { overworldMascotSpots } from "./mascots";
import type { Island } from "./islands";
import { DECO, GROUND, poiBounds, type Poi } from "./types";
import type { World } from "./world";

/** The old "Rustic caravan" (map item 26), the stall of the talent traders. */
export const CARAVAN_ITEM = 26;

/**
 * Which talents the rusty caravans near a town of this tier sell, one caravan each: orientation, perception and swimming near the towns of
 * the first tier (so near Starthaven), the bargainer near the towns of tier 2, the merchant near those of tier 4.
 */
export const CARAVAN_TALENTS: Readonly<Record<number, readonly string[]>> = {
  1: ["talent_orientation", "talent_perceptive", "talent_swimmer"],
  2: ["talent_bargainer"],
  4: ["talent_merchant"],
};

/** A caravan on the overworld: where it stands, the talent it sells and the tile it faces (the entrance of the town it belongs to). */
export interface CaravanSpot {
  /** `caravan:<town id>:<talent>`. */
  id: string;
  town: string;
  /** The talent it sells; null for a wagon that only tells a tale (`hint`). */
  talent: string | null;
  x: number;
  y: number;
  faceX: number;
  faceY: number;
  /** Drawn as the cottage (`obj_cottage`) instead of the rustic caravan: every third wagon of a town, the same stall in another house. */
  cottage: boolean;
  /** A wagon near a locked place (49th playtest): the tale it tells about the place `place` (a dungeon that asks for a key, a pyramid that asks for a key card) and about where the thing lies. */
  hint?: { place: string; need: string; holder: string };
  /** The cottage of the cartographer of an island (58th playtest, point 8): he sells the map of the island `island` for `price` gold. */
  islandMap?: { island: number; price: number; size: IslandMapSize };
}

export type IslandMapSize = "small" | "medium" | "large";

/** Land tiles from which an island counts as medium or large (58th playtest: 45 to 206 tiles are small, 498 to 540 medium on a default world, 712 and up large). */
export const MEDIUM_ISLAND_TILES = 300;
export const LARGE_ISLAND_TILES = 620;

/** What the map of an island costs by its size. */
export const ISLAND_MAP_PRICE: Readonly<Record<IslandMapSize, number>> = { small: 500, medium: 2000, large: 10_000 };

export function islandMapSize(island: Pick<Island, "area">): IslandMapSize {
  return island.area >= LARGE_ISLAND_TILES ? "large" : island.area >= MEDIUM_ISLAND_TILES ? "medium" : "small";
}

/** The flag in `GameState.opened` that says the party owns the map of this island. */
export const islandMapFlag = (island: number): string => `islandmap:${island}`;

/** One in this many caravans is a cottage. */
export const COTTAGE_EVERY = 3;

/**
 * How far from the town's entrance a caravan stands, as (nearest ring, farthest ring, free neighbours it needs): in sight of the town, not
 * in front of its door and with room to walk round it. A town squeezed into a wood or between mountains has no such ground, so the
 * search relaxes step by step (the last step takes any free tile next to the entrance's clearing).
 */
const SEARCH: readonly (readonly [number, number, number])[] = [[3, 16, 3], [2, 16, 2], [1, 16, 1], [1, 22, 0]];

const cache = new WeakMap<World, Map<string, CaravanSpot[]>>();

/**
 * The caravans of a town: each on plain, open ground as near to its entrance as there is some (three tiles at the least), off the roads and
 * not next to each other. The towns of tier 1, 2 and 4 have them, the others none. A pure function of the world seed and the town (nothing in
 * the generated world changes, so no `GEN_VERSION`).
 */
export function caravansOf(world: World, place: Poi): CaravanSpot[] {
  // the world is a globe: a copy of a town at the other side of the seam is the town itself, its caravans are computed once
  const town = world.poiById(place.id) ?? place;
  if (town.kind === "dungeon") return hintWagonOf(world, town);
  const talents = town.kind === "town" ? CARAVAN_TALENTS[town.tier] : undefined;
  if (!talents) return [];
  let known = cache.get(world);
  if (!known) cache.set(world, (known = new Map()));
  const cached = known.get(town.id);
  if (cached) return cached;
  const front = world.frontOf(town);
  const out: CaravanSpot[] = [];
  // the three wagons of Starthaven's tier are one cottage and two caravans; the towns with a single wagon draw it by their id
  const cottageAt = rngFor(world.rootSeed, LAYER.POI, "cottage", town.id).int(COTTAGE_EVERY);
  let index = -1;
  for (const talent of talents) {
    index++;
    const rng = rngFor(world.rootSeed, LAYER.POI, "caravan", town.id, talent);
    let spot: CaravanSpot | null = null;
    for (const [from, to, needRoom] of SEARCH) {
      for (let r = from; r <= to && !spot; r++) {
        const ring: [number, number][] = [];
        for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (Math.max(Math.abs(ox), Math.abs(oy)) === r) ring.push([front.x + ox, front.y + oy]);
        for (const [x, y] of rng.shuffle(ring)) {
          const t = world.tile(x, y);
          if (t.ground !== GROUND.LAND || t.deco !== DECO.NONE || t.poiId !== null || world.poiAtEntrance(x, y) !== null || !world.leavesPassage(x, y) || !world.keepsRingOpen(x, y, out) || !world.isOpenGround(x, y)) continue;
          // room to walk round every wagon, and between them
          if (out.some((c) => Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) < 2)) continue;
          let room = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (world.tile(x + dx, y + dy).ground === GROUND.LAND && world.tile(x + dx, y + dy).deco === DECO.NONE) room++;
          if (room < needRoom) continue;
          spot = { id: `caravan:${town.id}:${talent}`, town: town.id, talent, x, y, faceX: front.x, faceY: front.y, cottage: (index + cottageAt) % COTTAGE_EVERY === 0 };
          break;
        }
      }
      if (spot) break;
    }
    if (spot) out.push(spot);
  }
  known.set(town.id, out);
  return out;
}

/**
 * How far from the footprint of a locked place its wagon stands, as (nearest, farthest, free neighbours it needs): within three tiles as the user asked (the two tiles of cleared
 * ground round a place first), farther out only where the ground leaves no room (a place squeezed between mountains or the sea).
 */
const HINT_SEARCH: readonly (readonly [number, number, number])[] = [[2, 3, 3], [2, 3, 2], [1, 3, 1], [1, 3, 0], [4, 6, 1], [4, 8, 0]];

/** The place whose end room holds a key or a key card of this type. */
export function holderOf(world: World, need: string): Poi | undefined {
  return world.allPois().find((p) => world.dungeonRef(p.id)?.gives.includes(need));
}

/** A number from the id of a place, to pick the teller and the wording of its wagon. */
export function hintVariant(world: World, placeId: string): number {
  return rngFor(world.rootSeed, LAYER.POI, "hint-wagon", placeId).int(1 << 20);
}

/**
 * The wagon near a locked place (49th playtest, point 1): a dungeon that asks for a key and a pyramid that asks for a key card each have a rustic caravan or a cottage within
 * three tiles, where an old person tells where the key lies (`data/caravan-hints.ts`). Nothing in the generated tiles changes, so no `GEN_VERSION` (like the wagons of the
 * towns). Empty for a free place, for a cave, and when the ground round the place holds no wagon.
 */
function hintWagonOf(world: World, place: Poi): CaravanSpot[] {
  const need = world.dungeonRef(place.id)?.requires;
  if (!need) return [];
  let known = cache.get(world);
  if (!known) cache.set(world, (known = new Map()));
  const cached = known.get(place.id);
  if (cached) return cached;
  const holder = holderOf(world, need);
  const out: CaravanSpot[] = [];
  if (holder) {
    // what already stands on the open land and keeps its place (the mascots, the Monster Huts): the wagon steps aside, they do not (they were there first)
    const taken: { x: number; y: number }[] = [...overworldMascotSpots(world), ...hutIndex(world).huts];
    const front = world.frontOf(place);
    const b = poiBounds(place);
    const rng = rngFor(world.rootSeed, LAYER.POI, "hint-wagon-spot", place.id);
    let spot: CaravanSpot | null = null;
    // a locked place on a lava island: the wagon stands at the end of the lane of dirt cut into the rock for it (51st playtest, point 11)
    const alley = world.hintAlleyEnd(place.id);
    if (alley) spot = { id: `hint:${place.id}`, town: place.id, talent: null, x: alley.x, y: alley.y, faceX: front.x, faceY: front.y, cottage: rngFor(world.rootSeed, LAYER.POI, "hint-cottage", place.id).int(2) === 0, hint: { place: place.id, need, holder: holder.id } };
    for (const [from, to, needRoom] of HINT_SEARCH) {
      if (spot) break;
      for (let r = from; r <= to && !spot; r++) {
        const ring: [number, number][] = [];
        for (let y = b.y0 - r; y <= b.y1 + r; y++) for (let x = b.x0 - r; x <= b.x1 + r; x++) if (x < b.x0 - r + 1 || x > b.x1 + r - 1 || y < b.y0 - r + 1 || y > b.y1 + r - 1) ring.push([x, y]);
        for (const [x, y] of rng.shuffle(ring)) {
          const t = world.tile(x, y);
          if (t.ground !== GROUND.LAND || t.deco !== DECO.NONE || t.poiId !== null || world.poiAtEntrance(x, y) !== null || !world.leavesPassage(x, y) || !world.keepsRingOpen(x, y, out) || !world.isOpenGround(x, y)) continue;
          // not in front of the way in: the party must walk up to the door past the wagon
          if (Math.max(Math.abs(x - front.x), Math.abs(y - front.y)) < 2) continue;
          if (taken.some((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) < 2)) continue;
          let room = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (world.tile(x + dx, y + dy).ground === GROUND.LAND && world.tile(x + dx, y + dy).deco === DECO.NONE) room++;
          if (room < needRoom) continue;
          spot = { id: `hint:${place.id}`, town: place.id, talent: null, x, y, faceX: front.x, faceY: front.y, cottage: rngFor(world.rootSeed, LAYER.POI, "hint-cottage", place.id).int(2) === 0, hint: { place: place.id, need, holder: holder.id } };
          break;
        }
      }
      if (spot) break;
    }
    if (spot) out.push(spot);
  }
  known.set(place.id, out);
  return out;
}

/** The tale a wagon near a locked place tells, or null for any other wagon. */
export function wagonTale(world: World, wagon: Pick<CaravanSpot, "cottage" | "hint">): string | null {
  if (!wagon.hint) return null;
  const place = world.poiById(wagon.hint.place);
  const holder = world.poiById(wagon.hint.holder);
  if (!place || !holder) return null;
  return hintTale({ need: wagon.hint.need, place: `the ${place.name}`, holder: `the ${holder.name}`, cottage: wagon.cottage, variant: hintVariant(world, place.id) });
}

/**
 * The caravans of the places inside a tile rectangle (the places near the party). `withHints`: the wagons near locked places too; the mascots and the huts, which the wagons of
 * those places step aside for, ask without them.
 */
export function caravansIn(world: World, x0: number, y0: number, x1: number, y1: number, withHints = false): CaravanSpot[] {
  const wagons = world.poisInRect(x0, y0, x1, y1).filter((poi) => withHints || poi.kind !== "dungeon").flatMap((poi) => {
    // a town seen across the seam stands where the copy is: its caravans are shifted with it
    const home = world.poiById(poi.id) ?? poi;
    const dx = poi.x - home.x;
    const dy = poi.y - home.y;
    return caravansOf(world, home).map((c) => (dx === 0 && dy === 0 ? c : { ...c, x: c.x + dx, y: c.y + dy, faceX: c.faceX + dx, faceY: c.faceY + dy }));
  });
  // the cartographers' cottages step aside for the mascots and the huts like the wagons of the locked places do, so they come with the hints only
  return withHints ? [...wagons, ...mapCottagesIn(world, x0, y0, x1, y1)] : wagons;
}

/** How far from its reference point the cottage of an island's cartographer is searched: past the far shore of the island (`reach`), so that the last free tile of a rocky island is found. */
const MAP_SEARCH_EXTRA = 8;

const mapCottageCache = new WeakMap<World, (CaravanSpot | null | undefined)[]>();

/**
 * The cottage of one island's cartographer (58th playtest, point 8): every island has one, on open ground (`isOpenGround`, `leavesPassage`) that belongs to the island itself,
 * as near as possible to the front of its first place (the town of an island that has one, any place otherwise), or to the middle of the island when it has no place at all.
 * It steps aside for everything else that stands on the open land (mascots, huts, the wagons of the towns and of the locked places) and nothing steps aside for it, so nothing in
 * the generated world changes (no `GEN_VERSION`). Null for an island with no ground to put it on.
 */
export function mapCottageOf(world: World, island: Island): CaravanSpot | null {
  let known = mapCottageCache.get(world);
  if (!known) mapCottageCache.set(world, (known = world.islands.map(() => undefined)));
  const cached = known[island.index];
  if (cached !== undefined) return cached;
  const mine = world.allPois().filter((p) => world.islandAt(p.x, p.y)?.index === island.index);
  const anchor = mine.find((p) => p.kind === "town") ?? mine[0];
  const ref = anchor ? world.frontOf(anchor) : { x: island.x, y: island.y };
  const taken: { x: number; y: number }[] = [...overworldMascotSpots(world), ...hutIndex(world).huts];
  for (const p of mine) taken.push(...caravansOf(world, p));
  const rng = rngFor(world.rootSeed, LAYER.POI, "island-map", String(island.index));
  let spot: CaravanSpot | null = null;
  // the demands ease step by step: a small island has no "open ground" of 300 tiles and no ring of a place to keep open, but it holds its cottage all the same (the party swims or sails
  // there, and the island is all it has); `strict` 0 asks for all of it, 1 for a passage that stays open, 2 for nothing but a free land tile of the island
  const steps: readonly (readonly [number, number])[] = [[3, 0], [2, 0], [1, 0], [0, 0], [1, 1], [0, 1], [0, 2]];
  for (const [needRoom, strict] of steps) {
    for (let r = anchor ? 3 : 0; r <= island.reach * 2 + MAP_SEARCH_EXTRA && !spot; r++) {
      const ring: [number, number][] = [];
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (Math.max(Math.abs(ox), Math.abs(oy)) === r) ring.push([ref.x + ox, ref.y + oy]);
      for (const [x, y] of rng.shuffle(ring)) {
        const t = world.tile(x, y);
        if (t.ground !== GROUND.LAND || t.deco !== DECO.NONE || t.poiId !== null || world.poiAtEntrance(x, y) !== null) continue;
        if (world.islandAt(x, y)?.index !== island.index) continue;
        if (strict === 0 && (!world.leavesPassage(x, y) || !world.keepsRingOpen(x, y, taken) || !world.isOpenGround(x, y))) continue;
        if (strict === 1 && !world.leavesPassage(x, y)) continue;
        // room to walk round it, and between it and everything else that stands there
        if (taken.some((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) < 2)) continue;
        let room = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (world.tile(x + dx, y + dy).ground === GROUND.LAND && world.tile(x + dx, y + dy).deco === DECO.NONE) room++;
        if (room < needRoom) continue;
        const size = islandMapSize(island);
        spot = { id: islandMapFlag(island.index), town: anchor?.id ?? "", talent: null, x: world.wrapX(x), y: world.wrapY(y), faceX: ref.x, faceY: ref.y, cottage: true, islandMap: { island: island.index, price: ISLAND_MAP_PRICE[size], size } };
        break;
      }
    }
    if (spot) break;
  }
  known[island.index] = spot;
  return spot;
}

/** The cottages of the cartographers of every island. */
export function mapCottages(world: World): CaravanSpot[] {
  return world.islands.flatMap((isl) => mapCottageOf(world, isl) ?? []);
}

/** The cartographers' cottages inside a tile rectangle (the player's coordinates run over the seam, so the copies on the other side of it count as well). */
export function mapCottagesIn(world: World, x0: number, y0: number, x1: number, y1: number): CaravanSpot[] {
  const out: CaravanSpot[] = [];
  for (const c of mapCottages(world)) {
    for (const ox of [-world.width, 0, world.width]) {
      for (const oy of [-world.height, 0, world.height]) {
        const x = c.x + ox;
        const y = c.y + oy;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) out.push(ox === 0 && oy === 0 ? c : { ...c, x, y, faceX: c.faceX + ox, faceY: c.faceY + oy });
      }
    }
  }
  return out;
}

/** The tiles the map of an island shows: its land and two tiles of sea round it (canonical coordinates). */
export function islandMapTiles(world: World, island: Island): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const m = 2;
  for (let dy = island.box.y0 - m; dy <= island.box.y1 + m; dy++) {
    for (let dx = island.box.x0 - m; dx <= island.box.x1 + m; dx++) {
      const x = world.wrapX(island.x + dx);
      const y = world.wrapY(island.y + dy);
      let near = false;
      for (let ey = -m; ey <= m && !near; ey++) for (let ex = -m; ex <= m && !near; ex++) near = world.islandAt(x + ex, y + ey)?.index === island.index;
      if (near) out.push({ x, y });
    }
  }
  return out;
}
