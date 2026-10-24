import { LAYER, rngFor, type Rng } from "../core/rng";
import { pickSeaMonster, pickWildMonster } from "./difficulty";
import { hutsOf } from "./huts";
import { isqrt, wrapDist2, type Island } from "./islands";
import { SAFE_RADIUS, inSafeZone } from "./safezone";
import { CHUNK_SIZE, GROUND, isTileWalkable, wrap } from "./types";
import type { World } from "./world";

export { SAFE_RADIUS, inSafeZone };

export interface OverworldSpawn {
  /** `c:<cx>:<cy>:<n>`, the chunk counted inside the world; key of the save deltas (defeated groups). */
  uid: string;
  x: number;
  y: number;
  monsterIds: number[];
}

/** One wild group on land for every this many tiles of an island (and at least one on every island, however small): the groups follow the land, not the map. */
const LAND_PER_GROUP = 90;
/** One group of the open sea for every this many tiles of deep water. */
const SEA_PER_GROUP = 700;
/** The candidates a group looks at for its place: it takes the one farthest from every group and hut already there, so that they spread evenly. */
const CANDIDATES = 8;
/** Tries to find a first candidate at all (a chunk of mountains, trees and water would otherwise stay empty). */
const GIVE_UP = 400;
/** How much ground `reachesShore` looks at. */
const COAST_LOOK = 300;

interface Planned {
  x: number;
  y: number;
  monsterIds: number[];
}

const plans = new WeakMap<World, Map<number, OverworldSpawn[]>>();

/** The sea monsters' scale: half the diagonal of the globe, the farthest a spot can lie from Starthaven. */
function farthestOnGlobe(world: World): number {
  return isqrt((world.width >> 1) ** 2 + (world.height >> 1) ** 2);
}

/** Does the walkable ground round this tile reach a shore, where a party that comes by boat or swimming can step on it? (Looks at no more than `COAST_LOOK` tiles.) */
function reachesShore(world: World, x: number, y: number): boolean {
  const seen = new Set<number>([y * world.width + x]);
  const stack: [number, number][] = [[x, y]];
  while (stack.length > 0 && seen.size < COAST_LOOK) {
    const [cx, cy] = stack.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = world.wrapX(cx + dx);
      const ny = world.wrapY(cy + dy);
      const t = world.tile(nx, ny);
      if (t.ground === GROUND.WATER || t.ground === GROUND.SHALLOW) return true;
      const k = ny * world.width + nx;
      if (seen.has(k) || !isTileWalkable(t)) continue;
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  return false;
}

/**
 * Is this spot of the island fit for a group: land the party can walk, off the roads and places, outside the safe zone and in the open (`World.isOpenGround`)?
 * A small island may have no such ground at all, nothing but pockets between rocks and trees; `shore` then takes the pockets that a party landing from the sea can reach.
 */
function fitsLand(world: World, isl: Island, x: number, y: number, shore: boolean): boolean {
  if (world.islandAt(x, y) !== isl || inSafeZone(world, x, y)) return false;
  const t = world.tile(x, y);
  if (t.poiId !== null || !isTileWalkable(t) || t.ground === GROUND.ROAD || t.ground === GROUND.BRIDGE || t.ground === GROUND.PASS || t.ground === GROUND.WATER || t.ground === GROUND.SHALLOW) return false;
  return shore ? reachesShore(world, x, y) : world.isOpenGround(x, y);
}

/**
 * Picks the candidate farthest from every point already there (a best-candidate sample: the next point of an even spread). `fits` says whether a tile may
 * hold a group, `near` the points to keep away from (the other groups, the huts, the places). Null when no candidate fits within `GIVE_UP` tries.
 */
function bestSpot(world: World, rng: Rng, draw: () => { x: number; y: number }, fits: (x: number, y: number) => boolean, near: readonly { x: number; y: number }[]): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestGap = -1;
  let found = 0;
  for (let tries = 0; tries < GIVE_UP && found < CANDIDATES; tries++) {
    const c = draw();
    const x = world.wrapX(c.x);
    const y = world.wrapY(c.y);
    if (!fits(x, y)) continue;
    found++;
    let gap = Infinity;
    for (const p of near) gap = Math.min(gap, wrapDist2(x, y, p.x, p.y, world.width, world.height));
    if (gap > bestGap) {
      bestGap = gap;
      best = { x, y };
    }
  }
  void rng;
  return best;
}

/**
 * The wild groups of the whole world: the land groups island by island (a number that follows the land of the island, at least one, spread evenly over it and
 * away from the huts), the sea groups over the deep water. Every monster is picked by its distance from Starthaven (`difficulty.ts`): the stronger, the farther.
 * A pure function of the world seed; chunks only ask for their part of it.
 */
function planOf(world: World): Map<number, OverworldSpawn[]> {
  const known = plans.get(world);
  if (known) return known;
  const planned: Planned[] = [];
  const huts = hutsOf(world);
  const hutSlots = new Set<number>(huts.flatMap((h) => h.slots.map((s) => world.wrapY(s.y) * world.width + world.wrapX(s.x))));

  for (const isl of world.islands) {
    const rng = rngFor(world.rootSeed, LAYER.SPAWN, "wild", isl.index);
    const count = Math.max(1, Math.round(isl.area / LAND_PER_GROUP));
    // what the groups keep away from: the huts and the places of the island, and every group of it as it is set
    const near: { x: number; y: number }[] = [...huts.filter((h) => h.island === isl.index).map((h) => ({ x: h.x, y: h.y })), ...world.allPois().filter((p) => world.islandAt(p.x, p.y) === isl).map((p) => ({ x: p.x, y: p.y }))];
    const draw = () => ({ x: isl.x + rng.range(isl.box.x0, isl.box.x1), y: isl.y + rng.range(isl.box.y0, isl.box.y1) });
    let shore = false;
    const fits = (x: number, y: number) => fitsLand(world, isl, x, y, shore) && !hutSlots.has(y * world.width + x);
    for (let n = 0; n < count; n++) {
      let spot = bestSpot(world, rng, draw, fits, near);
      if (!spot && n === 0) {
        shore = true;
        spot = bestSpot(world, rng, draw, fits, near);
      }
      if (!spot) continue;
      near.push(spot);
      const tier = world.tierAt(spot.x, spot.y);
      const size = rng.range(1, Math.min(4, 1 + Math.ceil(tier / 2)));
      const monsterIds: number[] = [];
      for (let i = 0; i < size; i++) monsterIds.push(pickWildMonster(rng, world, spot.x, spot.y).id);
      planned.push({ x: spot.x, y: spot.y, monsterIds });
    }
  }

  // the open sea: as many groups as its deep water allows, spread over all of it (the water counted on a sample of the globe)
  const rng = rngFor(world.rootSeed, LAYER.SPAWN, "sea");
  // open sea: no land within three tiles (the shore is shallow, the sea beyond it deep), told from the rasters of the islands: no chunk has to be built for it
  const ring: readonly (readonly [number, number])[] = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2]];
  const deep = (x: number, y: number) => ring.every(([dx, dy]) => !world.islandAt(x + dx, y + dy)) && !inSafeZone(world, x, y);
  let wet = 0;
  const samples = 1200;
  for (let i = 0; i < samples; i++) if (deep(rng.int(world.width), rng.int(world.height))) wet++;
  const seaCount = Math.floor((wet * world.width * world.height) / (samples * SEA_PER_GROUP));
  const near = planned.map((g) => ({ x: g.x, y: g.y }));
  const farthest = farthestOnGlobe(world);
  for (let n = 0; n < seaCount; n++) {
    const spot = bestSpot(world, rng, () => ({ x: rng.int(world.width), y: rng.int(world.height) }), deep, near);
    if (!spot) continue;
    near.push(spot);
    const size = rng.range(1, 2);
    const monsterIds: number[] = [];
    for (let i = 0; i < size; i++) monsterIds.push(pickSeaMonster(rng, world, spot.x, spot.y, farthest).id);
    planned.push({ x: spot.x, y: spot.y, monsterIds });
  }

  // by chunk, with the uid of the chunk it stands in
  const byChunk = new Map<number, OverworldSpawn[]>();
  for (const g of planned) {
    const ccx = Math.floor(g.x / CHUNK_SIZE);
    const ccy = Math.floor(g.y / CHUNK_SIZE);
    const key = ccy * world.chunksAcross + ccx;
    const list = byChunk.get(key) ?? [];
    list.push({ uid: `c:${ccx}:${ccy}:${list.length}`, x: g.x, y: g.y, monsterIds: g.monsterIds });
    byChunk.set(key, list);
  }
  plans.set(world, byChunk);
  return byChunk;
}

/**
 * Wild monster groups of the chunk (`cx`, `cy`), anywhere on the plane the globe is laid out on: the groups of the chunk it is a copy of, shifted by whole worlds.
 * The uid is that of the original, so a group that was defeated is gone from every copy of the chunk.
 */
export function chunkSpawns(world: World, cx: number, cy: number): OverworldSpawn[] {
  const ccx = wrap(cx, world.chunksAcross);
  const ccy = wrap(cy, world.chunksDown);
  const dx = ((cx - ccx) / world.chunksAcross) * world.width;
  const dy = ((cy - ccy) / world.chunksDown) * world.height;
  const groups = planOf(world).get(ccy * world.chunksAcross + ccx) ?? [];
  return dx === 0 && dy === 0 ? groups : groups.map((g) => ({ ...g, x: g.x + dx, y: g.y + dy }));
}
