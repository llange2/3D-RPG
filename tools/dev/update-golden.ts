/** Rewrites tests/golden/world-hashes.json from the current generator. Run only after bumping GEN_VERSION on purpose. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GEN_VERSION } from "../../src/core/version";
import { GOLDEN_CHUNKS, GOLDEN_SEEDS, worldGoldenHashes } from "../../tests/helpers/golden";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tests", "golden", "world-hashes.json");
mkdirSync(dirname(out), { recursive: true });
const hashes: Record<string, number[]> = {};
for (const seed of GOLDEN_SEEDS) hashes[seed] = worldGoldenHashes(seed);
writeFileSync(out, JSON.stringify({ genVersion: GEN_VERSION, chunks: GOLDEN_CHUNKS, hashes }, null, 1) + "\n");
console.log(`golden: ${GOLDEN_SEEDS.length} seeds x ${GOLDEN_CHUNKS.length} chunks written for genVersion ${GEN_VERSION}`);
