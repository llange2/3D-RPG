import { LAYER, rngFor } from "../core/rng";
import { hasLandMonster, pickMonster } from "../data/monsters";
import { OVERWORLD_THEMES } from "../data/overworld-themes";
import { wrapDist2 } from "./islands";
import { CHUNK_SIZE, GROUND, isTileWalkable, wrap } from "./types";
import type { World } from "./world";

export interface OverworldSpawn {
  /** `c:<cx>:<cy>:<n>`, the chunk counted inside the world; key of the save deltas (defeated groups). */
  uid: string;
  x: number;
  y: number;
  monsterIds: number[];
}

/** Within this many tiles of Starthaven no wild monsters appear. */
export const SAFE_RADIUS = 12;

/** Groups per chunk of 10 x 10 tiles, in permille by count: 0, 1, 2 or 3 (a tenth of the old 16 x 16 chunk's 1.75 groups on average per 100 tiles: 0.7). */
const COUNT_WEIGHTS: readonly number[] = [500, 350, 120, 30];

const cache = new WeakMap<World, Map<number, OverworldSpawn[]>>();

/**
 * Wild monster groups of one chunk of the world (`ccx`, `ccy` inside it). A pure function of (world seed, chunk): the same chunk always holds the same
 * groups, and the party only has to remember which ones it has defeated. Stronger with the level of the island, drawn from the monster family of the biome.
 */
function groupsOf(world: World, ccx: number, ccy: number): OverworldSpawn[] {
  let byChunk = cache.get(world);
  if (!byChunk) cache.set(world, (byChunk = new Map()));
  const key = ccy * world.chunksAcross + ccx;
  const cached = byChunk.get(key);
  if (cached) return cached;
  const start = world.anchorOf(0, 0);
  const rng = rngFor(world.rootSeed, LAYER.SPAWN, ccx, ccy);
  const roll = rng.int(1000);
  const count = roll < COUNT_WEIGHTS[0]! ? 0 : roll < COUNT_WEIGHTS[0]! + COUNT_WEIGHTS[1]! ? 1 : roll < 1000 - COUNT_WEIGHTS[3]! ? 2 : 3;
  const spawns: OverworldSpawn[] = [];
  for (let n = 0; n < count; n++) {
    // a group looks for a spot a few times: a chunk of mountains, trees and water would otherwise stay empty on most rolls
    let found: { x: number; y: number; tile: ReturnType<World["tile"]>; inWater: boolean } | null = null;
    for (let attempt = 0; attempt < 6 && !found; attempt++) {
      const x = ccx * CHUNK_SIZE + rng.int(CHUNK_SIZE);
      const y = ccy * CHUNK_SIZE + rng.int(CHUNK_SIZE);
      if (wrapDist2(x, y, start.x, start.y, world.width, world.height) < SAFE_RADIUS * SAFE_RADIUS) continue;
      const tile = world.tile(x, y);
      if (tile.poiId !== null) continue;
      const inWater = tile.ground === GROUND.WATER || tile.ground === GROUND.SHALLOW;
      if (inWater) {
        // only aquatic monsters live in water, and only in deep water; the open sea is big, so they are few
        if (tile.ground !== GROUND.WATER || !rng.chance(40)) continue;
      } else if (!isTileWalkable(tile) || tile.ground === GROUND.ROAD || tile.ground === GROUND.BRIDGE || tile.ground === GROUND.PASS) {
        continue;
      } else if (!world.isOpenGround(x, y)) {
        continue; // walled in by mountains, trees or water: the party could never get to it
      }
      found = { x, y, tile, inWater };
    }
    if (!found) continue;
    const { x, y, tile, inWater } = found;
    const theme = OVERWORLD_THEMES[tile.biome];
    const tier = Math.min(5, world.tierAt(x, y) + theme.lootLevelBias);
    const size = rng.range(1, Math.min(4, 1 + Math.ceil(tier / 2)));
    // land in the ocean biome (a shore, an island) has no water family of its own to draw from
    const family = inWater ? "aquatic" : hasLandMonster(theme.monsterTheme) ? theme.monsterTheme : "beast";
    const monsterIds: number[] = [];
    for (let i = 0; i < size; i++) monsterIds.push(pickMonster(rng, family, tier, inWater).id);
    spawns.push({ uid: `c:${ccx}:${ccy}:${n}`, x, y, monsterIds });
  }
  byChunk.set(key, spawns);
  return spawns;
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
  const groups = groupsOf(world, ccx, ccy);
  return dx === 0 && dy === 0 ? groups : groups.map((g) => ({ ...g, x: g.x + dx, y: g.y + dy }));
}
