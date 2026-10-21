/**
 * The islands of a world: where they lie, how big they are, their climate and their levels (tiers), and which of them hold a town. The world is a
 * globe (see `WorldSize`): distances are measured round it, and no island comes within `ISLAND_EDGE` tiles of the seam, so that the sea there is
 * open water on both sides of it. Pure and integer only (no DOM, no Babylon; see the rules in CLAUDE.md).
 *
 * The rules of the layout (the user's, 21st playtest), which hold for every seed and size:
 *  - levels 1 and 2 share one big island (the start island, index 0); its level-1 half lies on the side of `axis`, the level-2 half opposite;
 *  - a bridge always joins that island with the level-3 island (index 1), which lies beyond the level-2 half;
 *  - level 4 and level 5 each have an island of their own (indices 2 and 3) and never share one;
 *  - the bigger the world, the more islands: small islands of level 4 or 5 with only a place or two, as the old outside map has them.
 */
import { ONE } from "../core/noise";
import { LAYER, rngFor, type Rng, type SeedState } from "../core/rng";
import { BIOME, WORLD_SIZES, wrapDelta, type Biome, type WorldSize } from "./types";

export interface Island {
  index: number;
  /** Centre tile. */
  x: number;
  y: number;
  /** Radius of the round blob the island grows from, in tiles. The coast is a little rougher than a circle (`SHAPE_AMPLITUDE`). */
  r: number;
  /** The farthest a tile of the island can lie from the centre. */
  reach: number;
  /** The levels (1 to 5) the island carries: the start island has 1 and 2, every other island exactly one. Ask `tierOn` for the level of a spot. */
  tiers: readonly number[];
  /** The climate of the whole island: one land, one kind of ground, as the islands of the old outside map. */
  biome: Biome;
  /** The level of each town it holds, the first one the anchor of the island (Starthaven on the start island). */
  townTiers: readonly number[];
  /** Number of towns (`townTiers.length`). */
  towns: number;
  /** Start island only: the direction (one of the four) from its middle towards the level-1 half; (0, 0) on every other island. */
  axis: { x: number; y: number };
  /** The island this one is joined to by a bridge (the start island and the level-3 island), or -1. */
  bridge: number;
}

export interface Layout {
  size: WorldSize;
  width: number;
  height: number;
  islands: Island[];
}

/** Radii of the four big islands (levels 1+2, 3, 4, 5) by world size: the first one is what the old outside map has as its biggest island, the others scale with it. */
const MAIN_RADIUS: Record<WorldSize, readonly [number, number, number, number]> = {
  small: [16, 11, 10, 10],
  default: [28, 20, 16, 16],
  large: [36, 25, 20, 20],
  huge: [44, 30, 24, 24],
};
/**
 * The small islands (level 4 or 5) that fill the sea between the big ones: at most `count`, until `land` permille of the world is land. Their radius
 * is drawn between `lo` and `hi`, mostly small ones (the old outside map has a handful of 4 to 6 tiles between a few of 11 and more).
 */
const EXTRAS: Record<WorldSize, { count: number; land: number; lo: number; hi: number }> = {
  small: { count: 2, land: 320, lo: 5, hi: 7 },
  default: { count: 40, land: 380, lo: 5, hi: 13 },
  large: { count: 90, land: 380, lo: 5, hi: 14 },
  huge: { count: 160, land: 370, lo: 5, hi: 14 },
};
/** How much rougher than a circle the coast is, in Q16 (0.17 of the radius; the islands of the old outside map are round blobs). The inner 0.83 of the radius is always land. */
export const SHAPE_AMPLITUDE = 11000;
/** Water kept clear between the land of two islands, shallows included. */
const GAP = 5;
/** Water between a small island and any other, a little less than between the big ones (the old outside map has channels of 3 to 6 tiles). */
const EXTRA_GAP = 4;
/** Water between the big island and the level-3 island: the bridge crosses it. */
const BRIDGE_GAP = 6;
/** The small islands keep this much water away from the start and the level-3 island, so that they do not crowd the first levels. */
const START_CLEARANCE = 12;
/** Land keeps this far from the seam; with the shallows round it, at least four deep tiles are left, more than the three the user asked for. */
export const ISLAND_EDGE = 5;
/** Climates by weight; the start island is always a meadow. */
const BIOME_WEIGHTS: readonly (readonly [Biome, number])[] = [
  [BIOME.MEADOW, 24],
  [BIOME.FOREST, 20],
  [BIOME.DESERT, 14],
  [BIOME.SNOW, 14],
  [BIOME.SWAMP, 14],
  [BIOME.LAVA, 14],
];
/** The four compass directions the axis of the start island can take, so that the bridge to the level-3 island is a straight one. */
const DIRECTIONS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Integer square root (Newton), so that distances are the same everywhere. */
export function isqrt(n: number): number {
  if (n < 2) return n;
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

/** Squared distance of two tiles round the globe. */
export function wrapDist2(ax: number, ay: number, bx: number, by: number, width: number, height: number): number {
  const dx = wrapDelta(ax, bx, width);
  const dy = wrapDelta(ay, by, height);
  return dx * dx + dy * dy;
}

/** A step of `d` tiles along a direction: a diagonal covers 7/10 of it on each axis (one over the square root of two). */
export function along(dir: { x: number; y: number }, d: number): { x: number; y: number } {
  const k = dir.x !== 0 && dir.y !== 0 ? 7 : 10;
  const step = Math.round((d * k) / 10);
  return { x: Math.sign(dir.x) * step, y: Math.sign(dir.y) * step };
}

/** The level of a spot of an island: the level of the island, or on the start island level 1 on the side of its axis and level 2 beyond its middle. */
export function tierOn(isl: Island, x: number, y: number, width: number, height: number): number {
  if (isl.tiers.length === 1) return isl.tiers[0]!;
  const dx = wrapDelta(isl.x, x, width);
  const dy = wrapDelta(isl.y, y, height);
  return dx * isl.axis.x + dy * isl.axis.y >= 0 ? isl.tiers[0]! : isl.tiers[1]!;
}

/** Radii of the islands that were placed, with their reach; `place` finds a spot for one more. */
interface Placed {
  x: number;
  y: number;
  r: number;
  reach: number;
}

function reachOf(r: number): number {
  return Math.floor((r * (ONE + SHAPE_AMPLITUDE)) / ONE) + 1;
}

/**
 * Places the islands. The start island and the level-3 island first (the latter beyond the level-2 half of the former, a bridge's length away), then
 * level 4 (the free spot nearest the start island out of many tries) and level 5 (the farthest), then the small ones at random spots. If the four
 * big ones do not fit, all radii shrink a little and the world is tried again.
 */
export function buildLayout(seed: SeedState, size: WorldSize): Layout {
  const { width, height } = WORLD_SIZES[size];
  const extras = EXTRAS[size];
  let placed: Placed[] = [];
  let axis = DIRECTIONS[0]!;
  for (let attempt = 0; attempt < 56; attempt++) {
    const rng = rngFor(seed, LAYER.TERRAIN, "islands", attempt);
    const scale = 100 - 5 * Math.floor(attempt / 4);
    const radii = MAIN_RADIUS[size].map((r) => Math.max(4, Math.round((r * scale) / 100)));
    const fits = (x: number, y: number, reach: number, others: readonly Placed[], gap: number): boolean =>
      x >= reach + ISLAND_EDGE &&
      x <= width - reach - ISLAND_EDGE &&
      y >= reach + ISLAND_EDGE &&
      y <= height - reach - ISLAND_EDGE &&
      others.every((o) => wrapDist2(x, y, o.x, o.y, width, height) >= (reach + o.reach + gap) * (reach + o.reach + gap));

    // 1. the start island and, beyond its level-2 half, the level-3 island
    placed = [];
    let pair: [Placed, Placed] | null = null;
    for (let t = 0; t < 400 && !pair; t++) {
      const dir = DIRECTIONS[rng.int(4)]!;
      const a: Placed = { x: 0, y: 0, r: radii[0]!, reach: reachOf(radii[0]!) };
      const b: Placed = { x: 0, y: 0, r: radii[1]!, reach: reachOf(radii[1]!) };
      const ma = a.reach + ISLAND_EDGE;
      a.x = ma + rng.int(width - 2 * ma);
      a.y = ma + rng.int(height - 2 * ma);
      const off = along({ x: -dir[0], y: -dir[1] }, a.reach + b.reach + BRIDGE_GAP);
      b.x = a.x + off.x;
      b.y = a.y + off.y;
      if (fits(b.x, b.y, b.reach, [], 0)) {
        pair = [a, b];
        axis = dir;
      }
    }
    if (!pair) continue;
    placed.push(pair[0], pair[1]);

    // 2. level 4 near, level 5 far
    const spots = (r: number, gap: number): { x: number; y: number }[] => {
      const reach = reachOf(r);
      const found: { x: number; y: number }[] = [];
      for (let t = 0; t < 500 && found.length < 40; t++) {
        const x = reach + ISLAND_EDGE + rng.int(width - 2 * (reach + ISLAND_EDGE) + 1);
        const y = reach + ISLAND_EDGE + rng.int(height - 2 * (reach + ISLAND_EDGE) + 1);
        if (fits(x, y, reach, placed, gap)) found.push({ x, y });
      }
      return found;
    };
    const start = placed[0]!;
    const far = (s: { x: number; y: number }) => wrapDist2(s.x, s.y, start.x, start.y, width, height);
    const four = spots(radii[2]!, GAP);
    if (four.length === 0) continue;
    const c = four.reduce((best, s) => (far(s) < far(best) ? s : best));
    placed.push({ ...c, r: radii[2]!, reach: reachOf(radii[2]!) });
    const five = spots(radii[3]!, GAP);
    if (five.length === 0) continue;
    const d = five.reduce((best, s) => (far(s) > far(best) ? s : best));
    placed.push({ ...d, r: radii[3]!, reach: reachOf(radii[3]!) });
    break;
  }
  if (placed.length < 4) throw new Error(`world ${size}: only ${placed.length} of the four big islands fit`);

  // 3. the small islands (level 4 or 5) fill the sea until `land` permille of the world is land or `count` of them stand
  const extraRng = rngFor(seed, LAYER.TERRAIN, "extras");
  let land = placed.reduce((sum, p) => sum + Math.floor((314 * p.r * p.r) / 100), 0);
  const tiersOfExtras: number[] = [];
  for (let n = 0, tries = 0; n < extras.count && tries < extras.count * 10 && (land * 1000) / (width * height) < extras.land; tries++) {
    const u = extraRng.int(1000);
    const r = extras.lo + Math.floor(((extras.hi - extras.lo + 1) * u * u) / 1_000_000);
    const reach = reachOf(r);
    const margin = reach + ISLAND_EDGE;
    let spot: { x: number; y: number } | null = null;
    for (let t = 0; t < 60 && !spot; t++) {
      const x = margin + extraRng.int(width - 2 * margin + 1);
      const y = margin + extraRng.int(height - 2 * margin + 1);
      const ok = placed.every((o, i) => {
        const gap = i < 2 ? START_CLEARANCE : EXTRA_GAP;
        return wrapDist2(x, y, o.x, o.y, width, height) >= (reach + o.reach + gap) * (reach + o.reach + gap);
      });
      if (ok) spot = { x, y };
    }
    if (!spot) continue;
    placed.push({ ...spot, r, reach });
    tiersOfExtras.push(extraRng.chance(500) ? 4 : 5);
    land += Math.floor((314 * r * r) / 100);
    n++;
  }

  const perTier = WORLD_SIZES[size].towns;
  const townTiers = (tiers: readonly number[]): number[] => tiers.flatMap((t) => new Array<number>(perTier).fill(t));
  const levels: (readonly number[])[] = [[1, 2], [3], [4], [5], ...tiersOfExtras.map((t) => [t])];
  const islands: Island[] = placed.map((p, index) => {
    const rng: Rng = rngFor(seed, LAYER.TERRAIN, "island", index);
    const biome = index === 0 ? BIOME.MEADOW : BIOME_WEIGHTS[rng.weightedIndex(BIOME_WEIGHTS.map((b) => b[1]))]![0];
    const tiers = levels[index]!;
    const towns = index < 4 ? townTiers(tiers) : [];
    return {
      index,
      x: p.x,
      y: p.y,
      r: p.r,
      reach: p.reach,
      tiers,
      biome,
      townTiers: towns,
      towns: towns.length,
      axis: index === 0 ? { x: axis[0], y: axis[1] } : { x: 0, y: 0 },
      bridge: index === 0 ? 1 : index === 1 ? 0 : -1,
    };
  });
  return { size, width, height, islands };
}
