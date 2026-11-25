/**
 * Rewrites tests/golden/world-hashes.json (the shape of the world, `GEN_VERSION`) and tests/golden/world-hashes-fantastic.json (the monsters of Fantastic Islands, `FANTASTIC_GEN_VERSION`) from the
 * current generator. Run only after bumping the version on purpose; with `--fantastic` only the second file is written, so that a change to the extension can never touch Classic's golden values.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FANTASTIC_GEN_VERSION, GEN_VERSION } from "../../src/core/version";
import { FANTASTIC_GOLDEN_SEEDS, GOLDEN_CHUNKS, GOLDEN_SEEDS, fantasticGoldenHashes, worldGoldenHashes } from "../../tests/helpers/golden";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tests", "golden");
mkdirSync(dir, { recursive: true });
const onlyFantastic = process.argv.includes("--fantastic");

if (!onlyFantastic) {
  const hashes: Record<string, number[]> = {};
  for (const seed of GOLDEN_SEEDS) hashes[seed] = worldGoldenHashes(seed);
  writeFileSync(join(dir, "world-hashes.json"), JSON.stringify({ genVersion: GEN_VERSION, chunks: GOLDEN_CHUNKS, hashes }, null, 1) + "\n");
  console.log(`golden: ${GOLDEN_SEEDS.length} seeds x ${GOLDEN_CHUNKS.length} chunks written for genVersion ${GEN_VERSION}`);
}

const fantastic: Record<string, number[]> = {};
for (const seed of FANTASTIC_GOLDEN_SEEDS) fantastic[seed] = fantasticGoldenHashes(seed);
writeFileSync(join(dir, "world-hashes-fantastic.json"), JSON.stringify({ genVersion: GEN_VERSION, fantasticVersion: FANTASTIC_GEN_VERSION, hashes: fantastic }, null, 1) + "\n");
console.log(`golden (Fantastic Islands): ${FANTASTIC_GOLDEN_SEEDS.length} seeds written for genVersion ${GEN_VERSION}, fantasticVersion ${FANTASTIC_GEN_VERSION}`);
