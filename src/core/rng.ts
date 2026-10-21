/**
 * Seedable, platform-independent randomness.
 *
 * Every generator decision must come from here. Only integer operations (Math.imul, shifts, +) are used,
 * so results are bit-identical in Node, Chrome, Firefox and Safari. `float()` divides by 2^32, which is exact.
 * Never call Math.random, Math.sin, Math.cos, Math.pow or Math.exp inside generator code.
 */

/** Four 32-bit words. */
export type SeedState = readonly [number, number, number, number];

/** Layers keep the random streams of different generator stages independent of each other. */
export const LAYER = {
  TERRAIN: 1,
  POI: 2,
  ROAD: 3,
  PROPS: 4,
  SPAWN: 5,
  INTERIOR: 6,
  ACTION: 7,
  LOOT: 8,
} as const;

/** cyrb128: hashes a string to four 32-bit words. */
export function seedFromString(text: string): SeedState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function murmurStep(h: number, k: number): number {
  k = Math.imul(k, 0xcc9e2d51);
  k = (k << 15) | (k >>> 17);
  k = Math.imul(k, 0x1b873593);
  h ^= k;
  h = (h << 13) | (h >>> 19);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
}

function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h | 0;
}

/** Folds a part (integer or string id such as a rule id) into one 32-bit integer. */
function partToInt(part: number | string): number {
  return typeof part === "string" ? seedFromString(part)[0] | 0 : part | 0;
}

/**
 * Derives a child seed from a parent seed. Pure function: the result depends only on the arguments,
 * never on how often or in which order other seeds were derived.
 */
export function derive(parent: SeedState, ...parts: (number | string)[]): SeedState {
  const s = [parent[0] | 0, parent[1] | 0, parent[2] | 0, parent[3] | 0];
  for (const part of parts) {
    const k = partToInt(part);
    for (let lane = 0; lane < 4; lane++) {
      s[lane] = murmurStep(s[lane]!, (k + Math.imul(lane + 1, 0x9e3779b9)) | 0);
    }
    // cross-lane mixing so every lane depends on every part
    s[0] = (s[0]! ^ s[3]!) | 0;
    s[1] = (s[1]! + s[0]!) | 0;
    s[2] = (s[2]! ^ s[1]!) | 0;
    s[3] = (s[3]! + s[2]!) | 0;
  }
  return [fmix(s[0]!) >>> 0, fmix(s[1]!) >>> 0, fmix(s[2]!) >>> 0, fmix(s[3]!) >>> 0];
}

/** sfc32 generator with integer helpers. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: SeedState) {
    this.a = seed[0] | 0;
    this.b = seed[1] | 0;
    this.c = seed[2] | 0;
    this.d = seed[3] | 0;
    for (let i = 0; i < 12; i++) this.nextU32(); // warm-up
  }

  /** Next unsigned 32-bit integer. */
  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Float in [0, 1). Exact, because the divisor is a power of two. Use for rendering variety, not for structure. */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  /** Unbiased integer in [0, n). */
  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > 4294967296) throw new RangeError(`Rng.int: invalid bound ${n}`);
    if (n === 1) return 0;
    const limit = 4294967296 - (4294967296 % n);
    let v = this.nextU32();
    while (v >= limit) v = this.nextU32();
    return v % n;
  }

  /** Integer in [lo, hi] (both inclusive). */
  range(lo: number, hi: number): number {
    if (hi < lo) throw new RangeError(`Rng.range: ${hi} < ${lo}`);
    return lo + this.int(hi - lo + 1);
  }

  /** True with the probability permille/1000 (integer arithmetic only). */
  chance(permille: number): boolean {
    return this.int(1000) < permille;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("Rng.pick: empty array");
    return items[this.int(items.length)]!;
  }

  /** Picks an index by integer weights. Zero or negative weights are never picked. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w > 0 ? w : 0;
    if (total <= 0) throw new RangeError("Rng.weightedIndex: no positive weight");
    let roll = this.int(total);
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i]! > 0 ? weights[i]! : 0;
      if (roll < w) return i;
      roll -= w;
    }
    return weights.length - 1;
  }

  /** In-place Fisher-Yates shuffle. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }
}

/** Root seed of a world, taken from the `?seed=` URL parameter or a typed string. */
export function worldSeed(text: string): SeedState {
  return seedFromString(text);
}

/** Independent random stream for one layer and integer coordinates (chunk, POI, floor, ...). */
export function rngFor(seed: SeedState, layer: number, ...coords: (number | string)[]): Rng {
  return new Rng(derive(seed, layer, ...coords));
}
