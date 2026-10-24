/**
 * The islands of a world: where they lie, what they look like, their climate and their levels (tiers), and which of them hold a town. The world is a
 * globe (see `WorldSize`): distances are measured round it, and no island comes within `ISLAND_EDGE` tiles of the seam, so that the sea there is
 * open water on both sides of it. Pure and integer only (no DOM, no Babylon; see the rules in CLAUDE.md).
 *
 * The rules of the layout (the user's, 21st and 22nd playtest), which hold for every seed and size:
 *  - levels 1 and 2 share one big island (the start island, index 0); its level-1 half lies on the side of `axis`, the level-2 half opposite;
 *  - a bridge always joins that island with the level-3 island (index 1), which lies beyond the level-2 half;
 *  - level 4 and level 5 each have an island of their own (indices 2 and 3) and never share one;
 *  - more big islands of level 4 or 5 the bigger the world, and **never more small islands than big ones** (the old outside map has seven of each);
 *  - no island is a circle: each one is a different shape (an organic continent, an oval with bulges, a triangle, a long strip, a ring of land round a
 *    bay with a small island in it), made of a few ellipses, warped and roughened by noise.
 *
 * An island is a raster of its own: `field` holds, for every tile of a square round its centre, how far inside the coast the tile lies (Q8, in
 * 1/256 tiles; zero or less is sea). The raster does not depend on where the island lies, so the placing can test a shape at many spots, and the
 * world reads the very same numbers.
 */
import { hash2, valueNoise2 } from "../core/noise";
import { derive, LAYER, rngFor, type Rng, type SeedState } from "../core/rng";
import { BIOME, WORLD_SIZES, wrap, wrapDelta, type Biome, type WorldSize } from "./types";

export type ShapeKind = "continent" | "blob" | "oval" | "triangle" | "bay" | "long";

export interface Island {
  index: number;
  /** Centre tile: the middle of the box of the land. */
  x: number;
  y: number;
  /** Radius of the circle of the same area (the nominal size: places, towns and the sea around the island go by it). */
  r: number;
  /** The farthest a tile of the island can lie from the centre (a circle round the centre holds all of it). */
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
  /** The look of the coast. */
  kind: ShapeKind;
  /** A big island (as the seven big ones of the old outside map) or a small one: a world never has more small islands than big ones. */
  big: boolean;
  /** Tiles of land. */
  area: number;
  /** Raster of the island, `stride` (2 `reach` + 1) tiles a side: Q8 distance inside the coast, zero or less is sea. Index (dy + reach) * stride + dx + reach. */
  field: Int32Array;
  stride: number;
  /** The box of the land, relative to the centre (both ends inclusive). */
  box: { x0: number; x1: number; y0: number; y1: number };
  /** The bay of an island that has one (relative to the centre): a small island may lie in it. */
  bay: { x: number; y: number; r: number } | null;
  /** The way into a mountain-ringed island (a lava island closes its coast with mountains, but never all of it): a direction in 1/1024, or (0, 0). */
  entry: { x: number; y: number };
}

export interface Layout {
  size: WorldSize;
  width: number;
  height: number;
  islands: Island[];
}

/** Q8: field values are 1/256 of a tile. */
export const FIELD_UNIT = 256;
/** Radii of the four big islands (levels 1+2, 3, 4, 5) by world size: the first one is what the old outside map has as its biggest island, the others scale with it. */
const MAIN_RADIUS: Record<WorldSize, readonly [number, number, number, number]> = {
  small: [15, 11, 9, 9],
  default: [34, 25, 19, 19],
  large: [44, 31, 24, 24],
  huge: [52, 37, 29, 29],
};
/**
 * The share of the world that is land, in permille (the user's wish, 22nd playtest, follow-up: half of a small world, 40 % of a huge one). Big islands of level 4 or 5
 * are added until nine tenths of it is reached (the small ones bring the rest), but at most `BIG_MAX` of them.
 */
const LAND_TARGET: Record<WorldSize, number> = { small: 500, default: 460, large: 430, huge: 400 };
const BIG_MAX: Record<WorldSize, number> = { small: 14, default: 28, large: 48, huge: 80 };
/** Radius of the big islands beyond the first four, and of the small ones (drawn mostly small: the old outside map has a handful of 4 to 6 tiles). */
const EXTRA_BIG: Record<WorldSize, { lo: number; hi: number }> = {
  small: { lo: 9, hi: 12 },
  default: { lo: 11, hi: 18 },
  large: { lo: 13, hi: 20 },
  huge: { lo: 14, hi: 22 },
};
const SMALL: Record<WorldSize, { lo: number; hi: number }> = {
  small: { lo: 4, hi: 6 },
  default: { lo: 4, hi: 8 },
  large: { lo: 4, hi: 8 },
  huge: { lo: 4, hi: 8 },
};
/** An island with a nominal radius under this is small. */
const BIG_RADIUS = 9;
/**
 * Water kept clear between the land of two islands: land to land at least this many tiles, five of sea (the old outside map has channels of 3 to 6). A place near a coast
 * clears up to two more tiles of sea (`FLATTEN`) and the shallows take a tile on each side, so that at least one deep tile is left between two islands.
 */
const GAP = 4;
/** Land to land between the big island and the level-3 island: the bridge crosses it. */
const BRIDGE_GAP = 6;
/** The small islands keep this much water away from the start and the level-3 island, so that they do not crowd the first levels (not those in a bay). */
const START_CLEARANCE = 12;
/** Land keeps this far from the seam: two rows of sea on each side of it (the user's minimum), the shallows included. */
export const ISLAND_EDGE = 2;
/** Climates by weight; the start island is always a meadow. */
const BIOME_WEIGHTS: readonly (readonly [Biome, number])[] = [
  [BIOME.MEADOW, 24],
  [BIOME.FOREST, 20],
  [BIOME.DESERT, 14],
  [BIOME.SNOW, 14],
  [BIOME.SWAMP, 14],
  [BIOME.LAVA, 14],
];
/** The look of a coast by climate (weights): lava lies in ovals, snow in strips, desert in triangles, as on the old outside map; any climate may have a bay. */
const KIND_WEIGHTS: Record<number, readonly (readonly [ShapeKind, number])[]> = {
  [BIOME.MEADOW]: [["blob", 40], ["bay", 25], ["triangle", 20], ["oval", 15]],
  [BIOME.FOREST]: [["blob", 40], ["bay", 25], ["oval", 20], ["triangle", 15]],
  [BIOME.DESERT]: [["triangle", 40], ["blob", 30], ["oval", 20], ["bay", 10]],
  [BIOME.SNOW]: [["long", 35], ["blob", 30], ["triangle", 20], ["bay", 15]],
  [BIOME.SWAMP]: [["blob", 50], ["oval", 30], ["bay", 20]],
  [BIOME.LAVA]: [["oval", 60], ["blob", 30], ["triangle", 10]],
};
const SMALL_KINDS: readonly (readonly [ShapeKind, number])[] = [["blob", 60], ["triangle", 20], ["oval", 20]];
/** The four compass directions the axis of the start island can take, so that the bridge to the level-3 island is a straight one. */
const DIRECTIONS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
/** Sixteen directions as (x, y) in 1/1024 (no sine or cosine in the generator): index k points 22.5 degrees x k from east, turning towards south. */
const DIR: readonly (readonly [number, number])[] = [
  [1024, 0], [946, 392], [724, 724], [392, 946], [0, 1024], [-392, 946], [-724, 724], [-946, 392],
  [-1024, 0], [-946, -392], [-724, -724], [-392, -946], [0, -1024], [392, -946], [724, -724], [946, -392],
];

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

/** How far inside the coast a tile (relative to the centre of the island) lies, Q8: above zero is land. */
export function fieldAt(isl: Island, dx: number, dy: number): number {
  const r = isl.reach;
  if (dx < -r || dx > r || dy < -r || dy > r) return 0;
  return isl.field[(dy + r) * isl.stride + dx + r]!;
}

// ---------------------------------------------------------------- shapes

interface Lobe {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** Radius of the circle of the same area: scales the field so that it counts in tiles. */
  eq: number;
}

/** What an island is made of: ellipses (a union), a convex polygon cut round by a circle (the triangle), a circle that is bitten out (the bay). Lengths are tiles. */
interface Spec {
  lobes: Lobe[];
  poly: { x: number; y: number }[] | null;
  clip: number;
  cut: { x: number; y: number; r: number } | null;
  /** The coast is warped by this many tiles in swells `swell` tiles long, and roughened by `fine` (Q8). */
  warp: number;
  swell: number;
  fine: number;
}

/** What `build` makes of a spec. */
interface Built {
  field: Int32Array;
  stride: number;
  reach: number;
  area: number;
  box: { x0: number; x1: number; y0: number; y1: number };
  bay: { x: number; y: number; r: number } | null;
  /** The land tiles on the coast (one of the four neighbours is sea) as (dx, dy) pairs: the placing tests only these against the other islands. */
  edge: Int16Array;
}

/** The coast of a raster: its land tiles with a sea tile beside them, as a flat list of (dx, dy) pairs relative to the centre. */
function edgeOf(field: Int32Array, stride: number, reach: number): Int16Array {
  const out: number[] = [];
  for (let y = 0; y < stride; y++) {
    for (let x = 0; x < stride; x++) {
      if (field[y * stride + x]! <= 0) continue;
      const sea = (nx: number, ny: number): boolean => nx < 0 || ny < 0 || nx >= stride || ny >= stride || field[ny * stride + nx]! <= 0;
      if (sea(x - 1, y) || sea(x + 1, y) || sea(x, y - 1) || sea(x, y + 1)) out.push(x - reach, y - reach);
    }
  }
  return Int16Array.from(out);
}

const lobe = (x: number, y: number, rx: number, ry: number): Lobe => {
  const a = Math.max(2, Math.round(rx));
  const b = Math.max(2, Math.round(ry));
  return { x: Math.round(x), y: Math.round(y), rx: a, ry: b, eq: isqrt(a * b) };
};

const at = (k: number, d: number): { x: number; y: number } => ({ x: Math.round((DIR[k & 15]![0] * d) / 1024), y: Math.round((DIR[k & 15]![1] * d) / 1024) });

/** The scaffold of an island of nominal radius `r`. The kinds differ in the parts they use; the area is corrected afterwards (`buildShape`). */
function makeSpec(rng: Rng, kind: ShapeKind, r: number, width: number): Spec {
  const small = r < BIG_RADIUS;
  const spec: Spec = { lobes: [], poly: null, clip: 0, cut: null, warp: small ? 2 : Math.max(3, Math.round((r * 22) / 100)), swell: small ? 10 : Math.min(30, Math.max(14, r)), fine: Math.round(FIELD_UNIT * (small ? 1 : 1.8)) };
  const p = (percent: number): number => (r * percent) / 100;
  const blob = (count: number): void => {
    // a small core with lumps round it; some of them are arms (peninsulas), and between two lumps the sea reaches in (a cape, a bay)
    spec.lobes.push(lobe(0, 0, p(34), p(34)));
    for (let i = 0; i < count; i++) {
      const k = rng.int(16);
      const arm = !small && rng.chance(350);
      const horizontal = Math.abs(DIR[k]![0]) >= Math.abs(DIR[k]![1]);
      const long = p(48 + rng.int(26));
      const short = p(20 + rng.int(12));
      const rad = p(34 + rng.int(26));
      const rx = arm ? (horizontal ? long : short) : rad;
      const ry = arm ? (horizontal ? short : long) : (rad * (75 + rng.int(50))) / 100;
      // far enough out to make a shape of it, near enough to touch the core
      const d = Math.min(p(45 + rng.int(40)), p(34) + 0.75 * Math.max(rx, ry));
      const o = at(k, d);
      spec.lobes.push(lobe(o.x, o.y, rx, ry));
    }
  };
  const bite = (): void => {
    // a bay needs room for a small island in it: radius at least 3 tiles of island, 4 of water round it
    const o = at(rng.int(16), p(74));
    spec.cut = { x: o.x, y: o.y, r: Math.max(7, Math.round(p(46))) };
  };
  switch (kind) {
    case "continent":
      blob(5 + rng.int(2));
      if (r >= 16 && rng.chance(650)) bite();
      break;
    case "blob":
      blob(small ? 2 + rng.int(2) : 3 + rng.int(3));
      break;
    case "bay":
      blob(3 + rng.int(2));
      if (r >= 12) bite();
      break;
    case "oval": {
      // an ellipse of the area of the circle, wide or tall, with bulges on its rim
      const stretch = 125 + rng.int(45);
      const wide = rng.chance(700);
      const a = p(stretch);
      const b = (r * 100) / stretch;
      spec.lobes.push(lobe(0, 0, wide ? a : b, wide ? b : a));
      const bulges = small ? 1 + rng.int(2) : 3 + rng.int(3);
      for (let i = 0; i < bulges; i++) {
        const k = rng.int(16);
        const d = DIR[k]!;
        const rad = p(26 + rng.int(18));
        const ex = ((wide ? a : b) * (82 + rng.int(14))) / 100;
        const ey = ((wide ? b : a) * (82 + rng.int(14))) / 100;
        spec.lobes.push(lobe((d[0] * ex) / 1024, (d[1] * ey) / 1024, rad, rad * (85 + rng.int(30)) / 100));
      }
      break;
    }
    case "triangle": {
      // three corners about a third of the way round apart, one of them nearer than the others; the corners are cut off by a circle
      const k0 = rng.int(16);
      const ks = [k0, k0 + 4 + rng.int(3), k0 + 10 + rng.int(3)];
      const reachOf = (percent: number): number => p(percent);
      spec.poly = ks.map((k) => {
        const o = at(k, reachOf(130 + rng.int(36)));
        return { x: o.x, y: o.y };
      });
      spec.clip = Math.max(3, Math.round(p(122)));
      if (!small) {
        const k = rng.int(16);
        const o = at(k, p(30));
        const rad = p(30 + rng.int(14));
        spec.lobes.push(lobe(o.x, o.y, rad, rad));
      }
      break;
    }
    case "long": {
      // a strip, as the snow island of the old outside map: four to six lumps along it
      const rx = Math.min(p(200 + rng.int(60)), width / 3);
      const ry = Math.max(3, (r * r) / rx);
      spec.lobes.push(lobe(0, 0, rx, ry));
      const n = 3 + rng.int(3);
      for (let i = 0; i < n; i++) {
        const x = (-rx * 70) / 100 + (rx * 140 * (i * 100 + rng.int(100))) / (100 * n * 100);
        const side = rng.chance(500) ? 1 : -1;
        const rad = p(30 + rng.int(25));
        spec.lobes.push(lobe(x, side * ry * (50 + rng.int(40)) / 100, rad, rad * (80 + rng.int(40)) / 100));
      }
      break;
    }
  }
  return spec;
}

function scaleSpec(spec: Spec, percent: number): Spec {
  const k = (n: number): number => Math.round((n * percent) / 100);
  return {
    lobes: spec.lobes.map((l) => lobe(k(l.x), k(l.y), k(l.rx), k(l.ry))),
    poly: spec.poly ? spec.poly.map((v) => ({ x: k(v.x), y: k(v.y) })) : null,
    clip: k(spec.clip),
    cut: spec.cut ? { x: k(spec.cut.x), y: k(spec.cut.y), r: Math.max(3, k(spec.cut.r)) } : null,
    warp: spec.warp,
    swell: spec.swell,
    fine: spec.fine,
  };
}

/** How far a spec reaches from its origin, in tiles (the raster has to be this big, with the warp). */
function extentOf(spec: Spec): number {
  let e = 1;
  for (const l of spec.lobes) e = Math.max(e, Math.abs(l.x) + l.rx, Math.abs(l.y) + l.ry);
  if (spec.poly) {
    let corner = 1;
    for (const v of spec.poly) corner = Math.max(corner, Math.abs(v.x), Math.abs(v.y));
    // the corners are cut off by the circle
    e = Math.max(e, spec.clip > 0 ? Math.min(corner, spec.clip) : corner);
  }
  return e;
}

/** Offset that keeps the noise coordinates positive (the lattice noise floors them, which is fine either way; this just keeps the cells symmetric to nothing). */
const NOISE_OFFSET = 1024;

function fieldOf(spec: Spec, ns: readonly number[] | null, edges: readonly { ax: number; ay: number; dx: number; dy: number; len: number }[], x: number, y: number): number {
  const nx = x + NOISE_OFFSET;
  const ny = y + NOISE_OFFSET;
  // without noise (`ns` null) only the area is wanted: the scale of the shape is corrected by it before the real raster is made
  const wx = ns ? x + Math.floor(((valueNoise2(ns[0]!, nx, ny, spec.swell) - 32768) * spec.warp) / 32768) : x;
  const wy = ns ? y + Math.floor(((valueNoise2(ns[1]!, nx, ny, spec.swell) - 32768) * spec.warp) / 32768) : y;
  let f = -1_000_000;
  for (const l of spec.lobes) {
    const ux = Math.floor(((wx - l.x) * 65536) / l.rx);
    const uy = Math.floor(((wy - l.y) * 65536) / l.ry);
    const rho = isqrt(ux * ux + uy * uy);
    f = Math.max(f, Math.floor(((65536 - rho) * l.eq * FIELD_UNIT) / 65536));
  }
  if (spec.poly) {
    let g = 1_000_000;
    for (const e of edges) g = Math.min(g, Math.floor(((e.dx * (wy - e.ay) - e.dy * (wx - e.ax)) * FIELD_UNIT) / e.len));
    if (spec.clip > 0) g = Math.min(g, spec.clip * FIELD_UNIT - isqrt((wx * wx + wy * wy) * 65536));
    f = Math.max(f, g);
  }
  if (spec.cut) {
    const cx = wx - spec.cut.x;
    const cy = wy - spec.cut.y;
    f = Math.min(f, isqrt((cx * cx + cy * cy) * 65536) - spec.cut.r * FIELD_UNIT);
  }
  if (!ns) return f;
  const rough = Math.floor((valueNoise2(ns[2]!, nx, ny, 9) * 2 + valueNoise2(ns[3]!, nx, ny, 5)) / 3);
  return f + Math.floor(((rough - 32768) * spec.fine) / 32768);
}

/** The edges of a convex polygon, each with the inside on the side where the cross product is positive. */
function edgesOf(poly: readonly { x: number; y: number }[] | null): { ax: number; ay: number; dx: number; dy: number; len: number }[] {
  if (!poly) return [];
  const n = poly.length;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    area2 += a.x * b.y - b.x * a.y;
  }
  // the cross product dx * (y - ay) - dy * (x - ax) is positive to the left of an edge in a counter-clockwise polygon
  const flip = area2 < 0;
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = flip ? poly[(n - i) % n]! : poly[i]!;
    const b = flip ? poly[(n - i - 1 + n) % n]! : poly[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    edges.push({ ax: a.x, ay: a.y, dx, dy, len: Math.max(1, isqrt(dx * dx + dy * dy)) });
  }
  return edges;
}

/** Rasterises a spec, keeps the largest piece of land (an island is never two) and centres it. */
function build(spec: Spec, ns: readonly number[] | null): Built {
  const edges = edgesOf(spec.poly);
  const h = Math.ceil(extentOf(spec)) + spec.warp + 4;
  const side = 2 * h + 1;
  const cells = new Int32Array(side * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) cells[y * side + x] = fieldOf(spec, ns, edges, x - h, y - h);

  // the largest piece of land
  const label = new Int32Array(side * side);
  const sizes: number[] = [0];
  const stack: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]! <= 0 || label[i] !== 0) continue;
    const id = sizes.length;
    sizes.push(0);
    label[i] = id;
    stack.push(i);
    while (stack.length > 0) {
      const c = stack.pop()!;
      sizes[id]!++;
      const cx = c % side;
      const cy = (c - cx) / side;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= side || ny >= side) continue;
        const ni = ny * side + nx;
        if (cells[ni]! > 0 && label[ni] === 0) {
          label[ni] = id;
          stack.push(ni);
        }
      }
    }
  }
  let best = 1;
  for (let id = 2; id < sizes.length; id++) if (sizes[id]! > sizes[best]!) best = id;
  let minX = side;
  let maxX = -1;
  let minY = side;
  let maxY = -1;
  for (let i = 0; i < cells.length; i++) {
    if (label[i] !== best) {
      cells[i] = 0;
      continue;
    }
    const x = i % side;
    const y = (i - x) / side;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) >> 1;
  const cy = (minY + maxY) >> 1;
  let reach = 1;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]! <= 0) continue;
    const x = (i % side) - cx;
    const y = Math.floor(i / side) - cy;
    reach = Math.max(reach, isqrt(x * x + y * y) + 1);
  }
  const stride = 2 * reach + 1;
  const field = new Int32Array(stride * stride);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]! <= 0) continue;
    const x = (i % side) - cx;
    const y = Math.floor(i / side) - cy;
    field[(y + reach) * stride + x + reach] = cells[i]!;
  }
  return {
    field,
    stride,
    reach,
    area: sizes[best]!,
    box: { x0: minX - cx, x1: maxX - cx, y0: minY - cy, y1: maxY - cy },
    bay: spec.cut ? { x: spec.cut.x + h - cx, y: spec.cut.y + h - cy, r: spec.cut.r } : null,
    edge: edgeOf(field, stride, reach),
  };
}

/** Makes the shape of an island of nominal radius `r`: the area is brought to that of a circle of radius `r` by one correction. */
function buildShape(rng: Rng, kind: ShapeKind, r: number, ns: readonly number[], width: number): Built {
  const target = Math.floor((314 * r * r) / 100);
  let spec = makeSpec(rng, kind, r, width);
  const rough = build(spec, null);
  const percent = Math.min(170, Math.max(60, isqrt(Math.floor((target * 10000) / Math.max(1, rough.area)))));
  if (Math.abs(percent - 100) > 6) spec = scaleSpec(spec, percent);
  return build(spec, ns);
}

// ---------------------------------------------------------------- the layout

/** An island that was placed: where its centre lies, its shape and the numbers of the layout. */
interface Placed {
  built: Built;
  kind: ShapeKind;
  r: number;
  big: boolean;
  x: number;
  y: number;
}

const toInt = (seed: SeedState): number => seed[0] | 0;

/**
 * Lets the coasts grow until `goal` tiles of the world are land (the user's wish, 22nd playtest, follow-up: half of a small world, two fifths of a huge one). The shapes were
 * placed with room to spare between them; now every island pushes its coast out, layer after layer, wherever the sea between it and the next island is still at
 * least `GAP` tiles wide and the two rows at the edge of the world stay free. A tile is taken with a chance of 55 % in each round, so that the coast stays
 * ragged, and the rounds stop as soon as the goal is reached. The rasters of the islands are made new from the result.
 */
function growIslands(placed: Placed[], width: number, height: number, goal: number, noise: number): void {
  const owner = new Int16Array(width * height).fill(-1);
  let land = 0;
  placed.forEach((p, i) => {
    const b = p.built;
    for (let dy = b.box.y0; dy <= b.box.y1; dy++) {
      for (let dx = b.box.x0; dx <= b.box.x1; dx++) {
        if (b.field[(dy + b.reach) * b.stride + dx + b.reach]! <= 0) continue;
        owner[wrap(p.y + dy, height) * width + wrap(p.x + dx, width)] = i;
        land++;
      }
    }
  });
  const start = land;
  const free = (x: number, y: number, mine: number): boolean => {
    for (let oy = -(GAP - 1); oy <= GAP - 1; oy++) {
      const row = wrap(y + oy, height) * width;
      for (let ox = -(GAP - 1); ox <= GAP - 1; ox++) {
        const o = owner[row + wrap(x + ox, width)]!;
        if (o !== -1 && o !== mine) return false;
      }
    }
    return true;
  };
  for (let round = 0; round < 80 && land < goal; round++) {
    let grown = 0;
    const flip = round % 2 === 1;
    for (let yy = ISLAND_EDGE; yy <= height - 1 - ISLAND_EDGE && land < goal; yy++) {
      const y = flip ? height - 1 - yy : yy;
      for (let xx = ISLAND_EDGE; xx <= width - 1 - ISLAND_EDGE && land < goal; xx++) {
        const x = flip ? width - 1 - xx : xx;
        const here = y * width + x;
        if (owner[here] !== -1) continue;
        let mine = -1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const o = owner[wrap(y + dy, height) * width + wrap(x + dx, width)]!;
          if (o !== -1) {
            mine = o;
            break;
          }
        }
        if (mine === -1 || hash2(noise, x, y * 131 + round) % 1000 >= 550 || !free(x, y, mine)) continue;
        owner[here] = mine;
        land++;
        grown++;
      }
    }
    if (grown === 0) break;
  }
  if (land === start) return;
  placed.forEach((p, i) => {
    // the land of the island round its old centre: the box, the radius, and the distance from the coast (a two-pass chamfer, in 1/256 tile)
    let x0 = 0;
    let x1 = 0;
    let y0 = 0;
    let y1 = 0;
    let reach = 1;
    let area = 0;
    const around = Math.max(p.built.reach, 1) + 24;
    const tiles: { dx: number; dy: number }[] = [];
    for (let dy = -around; dy <= around; dy++) {
      for (let dx = -around; dx <= around; dx++) {
        if (owner[wrap(p.y + dy, height) * width + wrap(p.x + dx, width)] !== i) continue;
        tiles.push({ dx, dy });
        x0 = Math.min(x0, dx);
        x1 = Math.max(x1, dx);
        y0 = Math.min(y0, dy);
        y1 = Math.max(y1, dy);
        reach = Math.max(reach, isqrt(dx * dx + dy * dy) + 1);
        area++;
      }
    }
    const stride = 2 * reach + 1;
    const dist = new Int32Array(stride * stride);
    const FAR = 1 << 20;
    dist.fill(0);
    for (const t of tiles) dist[(t.dy + reach) * stride + t.dx + reach] = FAR;
    const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= stride || y >= stride ? 0 : dist[y * stride + x]!);
    for (let y = 0; y < stride; y++) {
      for (let x = 0; x < stride; x++) {
        const i0 = y * stride + x;
        if (dist[i0] === 0) continue;
        dist[i0] = Math.min(dist[i0]!, at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
      }
    }
    for (let y = stride - 1; y >= 0; y--) {
      for (let x = stride - 1; x >= 0; x--) {
        const i0 = y * stride + x;
        if (dist[i0] === 0) continue;
        dist[i0] = Math.min(dist[i0]!, at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
      }
    }
    const field = new Int32Array(stride * stride);
    for (let k = 0; k < dist.length; k++) if (dist[k]! > 0) field[k] = Math.max(1, Math.floor(((dist[k]! - 1) * FIELD_UNIT) / 3) + FIELD_UNIT / 2);
    p.built = { ...p.built, field, stride, reach, area, box: { x0, x1, y0, y1 }, edge: edgeOf(field, stride, reach) };
  });
}

/** The climate of island `index`: a pure function of the seed and the index (the shape depends on it, the placing does not). */
function biomeOf(seed: SeedState, index: number): Biome {
  if (index === 0) return BIOME.MEADOW;
  const rng = rngFor(seed, LAYER.TERRAIN, "island", index);
  return BIOME_WEIGHTS[rng.weightedIndex(BIOME_WEIGHTS.map((b) => b[1]))]![0];
}

/**
 * Places the islands. The start island and the level-3 island first (the latter beyond its level-2 half, slid up to it until the land is a bridge's
 * length away), then level 4 (the free spot nearest the start island out of many tries) and level 5 (the farthest), the other big islands, and last
 * the small ones, as many as there are big ones if there is room (the first of them into the bays). If the big ones do not fit, all radii shrink a
 * little and the world is tried again.
 */
export function buildLayout(seed: SeedState, size: WorldSize): Layout {
  // a layout is read-only and costs a tenth of a second or more: worlds of the same seed (a save loaded again, a test that builds one for every chunk) share it
  const key = `${seed.join(",")}:${size}`;
  const known = LAYOUTS.get(key);
  if (known) return known;
  const layout = makeLayout(seed, size);
  if (LAYOUTS.size >= LAYOUT_CACHE) LAYOUTS.delete(LAYOUTS.keys().next().value!);
  LAYOUTS.set(key, layout);
  return layout;
}

const LAYOUTS = new Map<string, Layout>();
const LAYOUT_CACHE = 24;

/**
 * About where Starthaven stands: the middle of the land of the start island that reaches farthest along its axis (the side of level 1), the place `World.placesOf`
 * aims at. In tiles of the world.
 */
function startEnd(p: { x: number; y: number; built: Built }, axis: readonly [number, number]): { x: number; y: number } {
  const b = p.built;
  const inland: { dx: number; dy: number; a: number }[] = [];
  let reach = -Infinity;
  for (let dy = b.box.y0; dy <= b.box.y1; dy++) {
    for (let dx = b.box.x0; dx <= b.box.x1; dx++) {
      if (b.field[(dy + b.reach) * b.stride + dx + b.reach]! < 2 * FIELD_UNIT) continue;
      const a = dx * axis[0] + dy * axis[1];
      inland.push({ dx, dy, a });
      reach = Math.max(reach, a);
    }
  }
  const band = inland.filter((t) => t.a >= reach - 8);
  if (band.length === 0) return { x: p.x, y: p.y };
  return { x: p.x + Math.round(band.reduce((n, t) => n + t.dx, 0) / band.length), y: p.y + Math.round(band.reduce((n, t) => n + t.dy, 0) / band.length) };
}

function makeLayout(seed: SeedState, size: WorldSize): Layout {
  const { width, height } = WORLD_SIZES[size];
  const cellCount = width * height;
  let placed: Placed[] = [];
  let axis = DIRECTIONS[0]!;
  let ok = false;
  for (let attempt = 0; attempt < 60 && !ok; attempt++) {
    const rng = rngFor(seed, LAYER.TERRAIN, "islands", attempt);
    const scale = 100 - 4 * Math.floor(attempt / 4);
    const shrink = (r: number): number => Math.max(4, Math.round((r * scale) / 100));
    const gapArr = new Uint8Array(cellCount);
    const startArr = new Uint8Array(cellCount);
    /** The cells within a few tiles of the land placed so far: how much of a shape lies there says how snugly it sits against the others. */
    const nearArr = new Uint8Array(cellCount);
    placed = [];

    const make = (index: number, r: number, big: boolean): Placed => {
      const biome = biomeOf(seed, index);
      const table = index === 0 ? null : big ? KIND_WEIGHTS[biome]! : SMALL_KINDS;
      const kindRng = rngFor(seed, LAYER.TERRAIN, "kind", index, attempt);
      const kind: ShapeKind = index === 0 ? "continent" : table![kindRng.weightedIndex(table!.map((k) => k[1]))]![0];
      const ns = [0, 1, 2, 3].map((k) => toInt(derive(seed, LAYER.TERRAIN, "shape", index, attempt, k)));
      const built = buildShape(rngFor(seed, LAYER.TERRAIN, "spec", index, attempt), kind, r, ns, width);
      return { built, kind, r, big, x: 0, y: 0 };
    };
    const edgeOk = (p: Placed, x: number, y: number): boolean =>
      x + p.built.box.x0 >= ISLAND_EDGE && x + p.built.box.x1 <= width - 1 - ISLAND_EDGE && y + p.built.box.y0 >= ISLAND_EDGE && y + p.built.box.y1 <= height - 1 - ISLAND_EDGE;
    /** Does any land tile of the shape at (x, y) lie on a marked cell? */
    const hits = (b: Built, x: number, y: number, arr: Uint8Array): boolean => {
      const e = b.edge;
      for (let i = 0; i < e.length; i += 2) if (arr[wrap(y + e[i + 1]!, height) * width + wrap(x + e[i]!, width)] !== 0) return true;
      return false;
    };
    /** Marks the land of the shape at (x, y) and every cell within `rad` tiles (square) of its coast. */
    const stamp = (b: Built, x: number, y: number, arr: Uint8Array, rad: number): void => {
      for (let dy = b.box.y0; dy <= b.box.y1; dy++) {
        for (let dx = b.box.x0; dx <= b.box.x1; dx++) {
          if (b.field[(dy + b.reach) * b.stride + dx + b.reach]! > 0) arr[wrap(y + dy, height) * width + wrap(x + dx, width)] = 1;
        }
      }
      const e = b.edge;
      for (let i = 0; i < e.length; i += 2) {
        for (let oy = -rad; oy <= rad; oy++) {
          const row = wrap(y + e[i + 1]! + oy, height) * width;
          for (let ox = -rad; ox <= rad; ox++) arr[row + wrap(x + e[i]! + ox, width)] = 1;
        }
      }
    };
    const put = (p: Placed, x: number, y: number): void => {
      p.x = x;
      p.y = y;
      stamp(p.built, x, y, gapArr, GAP - 1);
      stamp(p.built, x, y, nearArr, GAP + 2);
      if (placed.length < 2) stamp(p.built, x, y, startArr, START_CLEARANCE - 1);
      placed.push(p);
    };
    const randomSpot = (p: Placed): { x: number; y: number } | null => {
      const b = p.built.box;
      const spanX = width - 1 - ISLAND_EDGE - b.x1 - (ISLAND_EDGE - b.x0) + 1;
      const spanY = height - 1 - ISLAND_EDGE - b.y1 - (ISLAND_EDGE - b.y0) + 1;
      if (spanX <= 0 || spanY <= 0) return null;
      return { x: ISLAND_EDGE - b.x0 + rng.int(spanX), y: ISLAND_EDGE - b.y0 + rng.int(spanY) };
    };
    /** Land tiles of the shape at (x, y) that lie close to other islands (the more, the closer it sits to them). */
    const contact = (b: Built, x: number, y: number): number => {
      let n = 0;
      const e = b.edge;
      for (let i = 0; i < e.length; i += 2) if (nearArr[wrap(y + e[i + 1]!, height) * width + wrap(x + e[i]!, width)] !== 0) n++;
      return n;
    };
    const spots = (p: Placed, wanted: number, tries: number, extra?: Uint8Array): { x: number; y: number }[] => {
      const found: { x: number; y: number }[] = [];
      const ok = (x: number, y: number): boolean => edgeOk(p, x, y) && !hits(p.built, x, y, gapArr) && !(extra && hits(p.built, x, y, extra));
      for (let t = 0; t < tries && found.length < wanted; t++) {
        const sp = randomSpot(p);
        if (sp && ok(sp.x, sp.y)) found.push(sp);
      }
      // a crowded world has few spots and chance misses them: look at every second tile, from a random start
      if (found.length < Math.min(wanted, 3)) {
        const b = p.built.box;
        const x0 = ISLAND_EDGE - b.x0;
        const y0 = ISLAND_EDGE - b.y0;
        const offX = rng.int(2);
        const offY = rng.int(2);
        for (let y = y0 + offY; y <= height - 1 - ISLAND_EDGE - b.y1 && found.length < wanted; y += 3) {
          for (let x = x0 + offX; x <= width - 1 - ISLAND_EDGE - b.x1 && found.length < wanted; x += 3) if (ok(x, y)) found.push({ x, y });
        }
      }
      return found;
    };

    // 1. the start island and, beyond its level-2 half, the level-3 island
    const a = make(0, shrink(MAIN_RADIUS[size][0]), true);
    const b = make(1, shrink(MAIN_RADIUS[size][1]), true);
    let pair = false;
    for (let t = 0; t < 200 && !pair; t++) {
      const dir = DIRECTIONS[rng.int(4)]!;
      const sa = randomSpot(a);
      if (!sa) break;
      const near = new Uint8Array(cellCount);
      stamp(a.built, sa.x, sa.y, near, BRIDGE_GAP - 1);
      const lateral = rng.range(-(a.r >> 2), a.r >> 2);
      const spot = (d: number): { x: number; y: number } => ({ x: sa.x - dir[0] * d - dir[1] * lateral, y: sa.y - dir[1] * d + dir[0] * lateral });
      const far = a.built.reach + b.built.reach + BRIDGE_GAP + 2;
      let best = -1;
      for (let d = far; d >= 0; d--) {
        const s = spot(d);
        if (hits(b.built, s.x, s.y, near)) break;
        best = d;
      }
      if (best < 0) continue;
      const s = spot(best);
      if (!edgeOk(a, sa.x, sa.y) || !edgeOk(b, s.x, s.y)) continue;
      put(a, sa.x, sa.y);
      put(b, s.x, s.y);
      axis = dir;
      pair = true;
    }
    if (!pair) continue;

    // 2. level 4 near the start island, level 5 far from it
    const start = placed[0]!;
    const dist = (s: { x: number; y: number }): number => wrapDist2(s.x, s.y, start.x, start.y, width, height);
    const c = make(2, shrink(MAIN_RADIUS[size][2]), true);
    const fours = spots(c, 40, 700);
    if (fours.length === 0) continue;
    // on a small world there is no far and near: the islands sit snugly (`contact`), or too little of the world would be land
    const snug = size === "small";
    const four = fours.reduce((best, s) => (snug ? contact(c.built, s.x, s.y) > contact(c.built, best.x, best.y) : dist(s) < dist(best)) ? s : best);
    put(c, four.x, four.y);
    const d = make(3, shrink(MAIN_RADIUS[size][3]), true);
    const fives = spots(d, 40, 700);
    if (fives.length === 0) continue;
    const five = fives.reduce((best, s) => (snug ? contact(d.built, s.x, s.y) > contact(d.built, best.x, best.y) : dist(s) > dist(best)) ? s : best);
    put(d, five.x, five.y);

    // 3. the other big islands of level 4 or 5, until the land is nine tenths of what the world should have (a big island that does not fit is tried smaller)
    const bigs = EXTRA_BIG[size];
    let land = placed.reduce((sum, p) => sum + p.built.area, 0);
    const goal = (cellCount * LAND_TARGET[size] * 9) / 10000;
    for (let n = 4, misses = 0; land < goal && n < BIG_MAX[size] && misses < 4; ) {
      let done = false;
      for (let r = shrink(bigs.lo + rng.int(bigs.hi - bigs.lo + 1)); r >= BIG_RADIUS && !done; r -= 2) {
        const p = make(placed.length, r, true);
        // the free spot that sits closest against the islands that are there already: they pack together and leave the open sea in one piece
        const found = spots(p, 16, 400);
        if (found.length === 0) continue;
        const spot = found.reduce((best, sp) => (contact(p.built, sp.x, sp.y) > contact(p.built, best.x, best.y) ? sp : best));
        put(p, spot.x, spot.y);
        land += p.built.area;
        done = true;
      }
      if (done) n++;
      else misses++;
    }
    const bigCount = placed.length;

    // 4. the small islands: the bays first (one island in each), then anywhere; never more than there are big ones
    const smalls = SMALL[size];
    const bays = placed.filter((p) => p.built.bay !== null);
    let bayAt = 0;
    for (let n = 0, tries = 0; n < bigCount && tries < bigCount * 6; tries++) {
      const u = rng.int(1000);
      const r = smalls.lo + Math.floor(((smalls.hi - smalls.lo + 1) * u * u) / 1_000_000);
      const p = make(placed.length, r, false);
      let spot: { x: number; y: number } | null = null;
      if (bayAt < bays.length) {
        // inside the next bay: the nearest free spot to its middle
        const host = bays[bayAt++]!;
        const bay = host.built.bay!;
        search: for (let k = 0; k <= bay.r; k++) {
          for (let dy = -k; dy <= k; dy++) {
            for (let dx = -k; dx <= k; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== k) continue;
              const x = host.x + bay.x + dx;
              const y = host.y + bay.y + dy;
              if (edgeOk(p, x, y) && !hits(p.built, x, y, gapArr)) {
                spot = { x, y };
                break search;
              }
            }
          }
        }
        if (spot) {
          put(p, spot.x, spot.y);
          n++;
        }
        continue;
      }
      const found = spots(p, 12, 300, startArr);
      spot = found.length === 0 ? null : found.reduce((best, sp) => (contact(p.built, sp.x, sp.y) > contact(p.built, best.x, best.y) ? sp : best));
      if (!spot) continue;
      put(p, spot.x, spot.y);
      n++;
    }
    growIslands(placed, width, height, Math.floor((cellCount * LAND_TARGET[size]) / 1000), toInt(derive(seed, LAYER.TERRAIN, "grow", attempt)));
    ok = true;
  }
  if (!ok) throw new Error(`world ${size}: the big islands do not fit`);

  const perTier = WORLD_SIZES[size].towns;
  const townTiers = (tiers: readonly number[]): number[] => tiers.flatMap((t) => new Array<number>(perTier).fill(t));
  // The stronger the monsters, the farther they live: of the two main islands the farther from the start island is the one of level 5 (on a small world the
  // islands sit snugly and the nearer one may have come out as level 5), and every other island is level 4 or 5 by whether it lies nearer than the middle between them.
  // measured from where Starthaven will stand, the end of the level-1 half of the start island (`World.placesOf`), not from the middle of that island
  const home = startEnd(placed[0]!, axis);
  const fromStart = (i: number): number => wrapDist2(placed[i]!.x, placed[i]!.y, home.x, home.y, width, height);
  if (fromStart(2) > fromStart(3)) [placed[2], placed[3]] = [placed[3]!, placed[2]!];
  const middle = (fromStart(2) + fromStart(3)) / 2;
  const levels: (readonly number[])[] = placed.map((_, i) => (i < 4 ? [[1, 2], [3], [4], [5]][i]! : [fromStart(i) < middle ? 4 : 5]));
  const islands: Island[] = placed.map((p, index) => {
    const tiers = levels[index]!;
    const towns = index < 4 ? townTiers(tiers) : [];
    const entryRng = rngFor(seed, LAYER.TERRAIN, "entry", index);
    const e = DIR[entryRng.int(8) * 2]!;
    return {
      index,
      x: p.x,
      y: p.y,
      r: p.r,
      reach: p.built.reach,
      tiers,
      biome: biomeOf(seed, index),
      townTiers: towns,
      towns: towns.length,
      axis: index === 0 ? { x: axis[0], y: axis[1] } : { x: 0, y: 0 },
      bridge: index === 0 ? 1 : index === 1 ? 0 : -1,
      kind: p.kind,
      big: p.big,
      area: p.built.area,
      field: p.built.field,
      stride: p.built.stride,
      box: p.built.box,
      bay: p.built.bay,
      entry: { x: e[0], y: e[1] },
    };
  });
  return { size, width, height, islands };
}
