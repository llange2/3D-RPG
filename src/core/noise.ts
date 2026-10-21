/**
 * Integer value noise in Q16.16 fixed point.
 *
 * Only +, -, *, Math.floor and Math.imul on integers are used. All intermediate values stay below 2^53,
 * so every JS engine returns bit-identical results. Output range of all noise functions: 0..65535.
 */

export const ONE = 65536;

export function hash2(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Smoothstep on Q16 values: t in 0..ONE returns 0..ONE. */
export function smooth(t: number): number {
  const t2 = Math.floor((t * t) / ONE);
  return Math.floor((t2 * (3 * ONE - 2 * t)) / ONE);
}

/** Linear interpolation of Q16 value `a`..`b` by `t` in 0..ONE. */
export function lerpQ(a: number, b: number, t: number): number {
  return a + Math.floor(((b - a) * t) / ONE);
}

/** 2D value noise. `period` is the lattice distance in tiles (positive integer). */
export function valueNoise2(seed: number, x: number, y: number, period: number): number {
  const gx = Math.floor(x / period);
  const gy = Math.floor(y / period);
  const fx = Math.floor(((x - gx * period) * ONE) / period);
  const fy = Math.floor(((y - gy * period) * ONE) / period);
  const v00 = hash2(seed, gx, gy) >>> 16;
  const v10 = hash2(seed, gx + 1, gy) >>> 16;
  const v01 = hash2(seed, gx, gy + 1) >>> 16;
  const v11 = hash2(seed, gx + 1, gy + 1) >>> 16;
  const sx = smooth(fx);
  const sy = smooth(fy);
  return lerpQ(lerpQ(v00, v10, sx), lerpQ(v01, v11, sx), sy);
}

/** 1D value noise, used for road wobble. */
export function valueNoise1(seed: number, x: number, period: number): number {
  const g = Math.floor(x / period);
  const f = Math.floor(((x - g * period) * ONE) / period);
  const a = hash2(seed, g, 0x51ed) >>> 16;
  const b = hash2(seed, g + 1, 0x51ed) >>> 16;
  return lerpQ(a, b, smooth(f));
}

/** Fractal noise: `octaves` layers, the period halves per octave, amplitude halves per octave. */
export function fbm2(seed: number, x: number, y: number, period: number, octaves: number): number {
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const amp = 1 << (octaves - 1 - o);
    const p = Math.max(1, period >> o);
    sum += valueNoise2((seed + Math.imul(o + 1, 0x9e3779b1)) | 0, x, y, p) * amp;
    norm += amp;
  }
  return Math.floor(sum / norm);
}

/** Integer square root; Math.sqrt is correctly rounded by IEEE 754, so this is deterministic. */
export function isqrt(n: number): number {
  return Math.floor(Math.sqrt(n));
}

/** Maps a hash to 0..999 for permille tests. */
export function permille(h: number): number {
  return (h >>> 0) % 1000;
}
