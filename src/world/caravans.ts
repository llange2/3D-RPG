import { LAYER, rngFor } from "../core/rng";
import { hintTale } from "../data/caravan-hints";
import { hutIndex } from "./huts";
import { overworldMascotSpots } from "./mascots";
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
}

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
  return world.poisInRect(x0, y0, x1, y1).filter((poi) => withHints || poi.kind !== "dungeon").flatMap((poi) => {
    // a town seen across the seam stands where the copy is: its caravans are shifted with it
    const home = world.poiById(poi.id) ?? poi;
    const dx = poi.x - home.x;
    const dy = poi.y - home.y;
    return caravansOf(world, home).map((c) => (dx === 0 && dy === 0 ? c : { ...c, x: c.x + dx, y: c.y + dy, faceX: c.faceX + dx, faceY: c.faceY + dy }));
  });
}
