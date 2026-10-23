import type { Rng } from "../core/rng";
import { MONSTER_ACTION_RADIUS, isPhased, type Encounter } from "../sim/encounter";
import { chunkSpawns } from "../world/spawns";
import { BIOME, CHUNK_SIZE, GROUND, isTileWalkable, wrap, type Biome } from "../world/types";
import type { World } from "../world/world";

/** The places the travelling spells (Time Distortion, Nature's Gate) put the party on. Pure, so the tests can ask them. */

export interface Spot {
  x: number;
  y: number;
}

/**
 * Time Distortion: the cells nearest to the party where no monster can strike (none within the action radius). Only the first ring
 * that has any counts, and of its cells the ones about as near as the nearest, so the choice among them is the "random" of the spell.
 */
export function safeCells(enc: Encounter, px: number, py: number, canStand: (x: number, y: number) => boolean, maxRadius = 16): Spot[] {
  const hostile = enc.monsters.filter((m) => m.hp > 0 && !isPhased(m));
  const reached = (x: number, y: number) => hostile.some((m) => (m.x - x) ** 2 + (m.y - y) ** 2 <= MONSTER_ACTION_RADIUS ** 2);
  for (let r = 1; r <= maxRadius; r++) {
    const found: (Spot & { d: number })[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = px + dx;
        const y = py + dy;
        if (canStand(x, y) && !reached(x, y)) found.push({ x, y, d: dx * dx + dy * dy });
      }
    }
    if (found.length === 0) continue;
    const nearest = Math.min(...found.map((f) => f.d));
    return found.filter((f) => f.d <= nearest + 2 * r).map(({ x, y }) => ({ x, y }));
  }
  return [];
}

/** How far from a wild group Nature's Gate keeps its destination (tiles): the groups stand within three tiles of their centre. */
const GATE_QUIET = MONSTER_ACTION_RADIUS + 3;

/** Whether no wild group of the overworld stands near the tile (a group is a few tiles around its centre). */
export function isQuiet(world: World, x: number, y: number): boolean {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  for (let j = cy - 1; j <= cy + 1; j++) {
    for (let i = cx - 1; i <= cx + 1; i++) {
      if (chunkSpawns(world, i, j).some((g) => (g.x - x) ** 2 + (g.y - y) ** 2 <= GATE_QUIET ** 2)) return false;
    }
  }
  return true;
}

/**
 * Nature's Gate on the generated world: a random biome other than the one the party stands in (the world has one climate per island),
 * a random island of it, a random free tile there that the party can walk out of (`isOpenGround`) with no wild monsters about. Null when
 * the world has no other climate or no such tile turned up.
 */
export function pickGateSpot(world: World, rng: Rng, current: Biome): (Spot & { biome: Biome }) | null {
  const biomes = [...new Set(world.islands.map((i) => i.biome))].filter((b) => b !== current && b !== BIOME.OCEAN).sort((a, b) => a - b);
  if (biomes.length === 0) return null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const biome = biomes[rng.int(biomes.length)]!;
    const islands = world.islands.filter((i) => i.biome === biome);
    const island = islands[rng.int(islands.length)]!;
    for (let k = 0; k < 80; k++) {
      const x = wrap(island.x + rng.range(island.box.x0, island.box.x1), world.width);
      const y = wrap(island.y + rng.range(island.box.y0, island.box.y1), world.height);
      const t = world.tile(x, y);
      if (t.biome !== biome || t.poiId !== null || t.deco !== 0 || (t.ground !== GROUND.LAND && t.ground !== GROUND.ROAD) || !isTileWalkable(t)) continue;
      if (!world.isOpenGround(x, y) || !isQuiet(world, x, y)) continue;
      return { x, y, biome };
    }
  }
  return null;
}
