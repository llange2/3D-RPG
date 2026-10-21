import { LAYER, rngFor } from "../core/rng";
import { DECO, GROUND, type Poi } from "./types";
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
  talent: string;
  x: number;
  y: number;
  faceX: number;
  faceY: number;
}

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
  const talents = town.kind === "town" ? CARAVAN_TALENTS[town.tier] : undefined;
  if (!talents) return [];
  let known = cache.get(world);
  if (!known) cache.set(world, (known = new Map()));
  const cached = known.get(town.id);
  if (cached) return cached;
  const front = world.frontOf(town);
  const out: CaravanSpot[] = [];
  for (const talent of talents) {
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
          spot = { id: `caravan:${town.id}:${talent}`, town: town.id, talent, x, y, faceX: front.x, faceY: front.y };
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

/** The caravans of the towns inside a tile rectangle (the towns near the party). */
export function caravansIn(world: World, x0: number, y0: number, x1: number, y1: number): CaravanSpot[] {
  return world.poisInRect(x0, y0, x1, y1).flatMap((poi) => {
    // a town seen across the seam stands where the copy is: its caravans are shifted with it
    const home = world.poiById(poi.id) ?? poi;
    const dx = poi.x - home.x;
    const dy = poi.y - home.y;
    return caravansOf(world, home).map((c) => (dx === 0 && dy === 0 ? c : { ...c, x: c.x + dx, y: c.y + dy, faceX: c.faceX + dx, faceY: c.faceY + dy }));
  });
}
