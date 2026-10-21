import { CHUNK_SIZE, type WorldSize } from "../../src/world/types";
import { World, chunkHash } from "../../src/world/world";

/** 100 reproducible seeds: a few readable ones plus numbered ones. */
export const GOLDEN_SEEDS: string[] = ["alpha", "beta", "gamma", "delta", ...Array.from({ length: 96 }, (_, i) => `seed-${i}`)];

/** The size of the golden world of a seed: all four sizes come up, the small and default ones most (they are the quick ones). */
const SIZES: WorldSize[] = ["default", "small", "default", "large", "small", "default", "huge", "small"];
export const goldenSize = (seed: string): WorldSize => SIZES[GOLDEN_SEEDS.indexOf(seed) % SIZES.length]!;

/** Chunks sampled per seed (of 10 x 10 tiles): in the middle of the world, near the seam, across it and far outside it (the world is a globe). */
export const GOLDEN_CHUNKS: [number, number][] = [
  [0, 0],
  [-1, -1],
  [5, 3],
  [3, 5],
  [12, -4],
];

/** The fixed chunks, then the one with Starthaven and the one east of it (the fixed ones are mostly sea: the world is mostly sea). */
export function goldenChunkList(seed: string): [number, number][] {
  const town = new World(seed, goldenSize(seed)).anchorOf(0, 0);
  const cx = Math.floor(town.x / CHUNK_SIZE);
  const cy = Math.floor(town.y / CHUNK_SIZE);
  return [...GOLDEN_CHUNKS, [cx, cy], [cx + 1, cy]];
}

export function worldGoldenHashes(seed: string): number[] {
  const world = new World(seed, goldenSize(seed));
  return goldenChunkList(seed).map(([x, y]) => chunkHash(world.chunk(x, y)));
}
