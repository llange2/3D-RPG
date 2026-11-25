import { hutsOf } from "../../src/world/huts";
import { chunkSpawns } from "../../src/world/spawns";
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

// ---------------------------------------------------------------- Fantastic Islands (`FANTASTIC_GEN_VERSION`)

/** The seeds of the golden values of Fantastic Islands: the monsters of a world, not its shape (that is Classic's golden, the same in both rule sets). Twenty are enough, the monsters are many per world. */
export const FANTASTIC_GOLDEN_SEEDS: string[] = GOLDEN_SEEDS.slice(0, 20);

function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= text.charCodeAt(i) >>> 8;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Three hashes of the monsters a Fantastic world draws: every wild group (place and monsters), every Monster Hut (monster and place) and the populations of its caves and dungeons. */
export function fantasticGoldenHashes(seed: string): number[] {
  const world = new World(seed, goldenSize(seed), "default", "fantastic");
  const groups: unknown[] = [];
  for (let cy = 0; cy < world.chunksDown; cy++) for (let cx = 0; cx < world.chunksAcross; cx++) groups.push(chunkSpawns(world, cx, cy));
  const huts = hutsOf(world).map((h) => [h.id, h.monster, h.x, h.y]);
  const looks = world
    .allPois()
    .filter((p) => p.kind === "dungeon" || p.kind === "cave")
    .map((p) => [p.id, world.dungeonRef(p.id)?.look.monsters, world.dungeonRef(p.id)?.look.boss]);
  return [fnv(JSON.stringify(groups)), fnv(JSON.stringify(huts)), fnv(JSON.stringify(looks))];
}
