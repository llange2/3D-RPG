/**
 * Determinism check across engines: computes world chunk hashes and interior/action hashes in Chrome (V8 with a browser
 * runtime) and in Node, and fails when a single value differs.
 * Chunk hashes are also compared with tests/golden/world-hashes.json.
 * Usage: tsx tools/dev/chrome-golden.ts
 */
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { interiorFingerprints } from "../../src/actions/fingerprint";
import { GOLDEN_CHUNKS, GOLDEN_SEEDS, goldenChunkList, goldenSize, worldGoldenHashes } from "../../tests/helpers/golden";

const golden = JSON.parse(readFileSync(new URL("../../tests/golden/world-hashes.json", import.meta.url), "utf-8")) as { hashes: Record<string, number[]> };
const base = process.env.GAME_URL ?? "http://localhost:5173/";
// the regions of a world are its islands: index and 0
const REGIONS: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
const INTERIOR_SEEDS = GOLDEN_SEEDS.slice(0, 12);

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"],
  defaultViewport: { width: 800, height: 600 },
});
let failures = 0;
try {
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined && typeof window.__game.hashes === 'function'", { timeout: 60000 });

  const chromeChunks = (await page.evaluate(
    (jobs) => jobs.map((j) => (window as unknown as { __game: { hashes: (s: string, c: [number, number][], size: string) => number[] } }).__game.hashes(j.seed, j.chunks, j.size)),
    GOLDEN_SEEDS.map((seed) => ({ seed, chunks: goldenChunkList(seed), size: goldenSize(seed) })),
  )) as number[][];
  let chunkMismatch = 0;
  GOLDEN_SEEDS.forEach((seed, i) => {
    const node = worldGoldenHashes(seed);
    const stored = golden.hashes[seed]!;
    if (JSON.stringify(chromeChunks[i]) !== JSON.stringify(node) || JSON.stringify(node) !== JSON.stringify(stored)) {
      chunkMismatch++;
      console.log(`chunk mismatch for ${seed}: chrome ${chromeChunks[i]} node ${node} golden ${stored}`);
    }
  });
  console.log(`world chunks: ${GOLDEN_SEEDS.length} seeds x ${GOLDEN_CHUNKS.length} chunks, mismatching seeds: ${chunkMismatch}`);
  failures += chunkMismatch;

  type Fp = { id: string; map: number; content: number };
  const chromeInteriors = (await page.evaluate(
    (seeds, regions) => seeds.map((s) => (window as unknown as { __game: { interiorHashes: (s: string, r: [number, number][]) => Fp[] } }).__game.interiorHashes(s, regions)),
    INTERIOR_SEEDS,
    REGIONS,
  )) as Fp[][];
  let interiorMismatch = 0;
  let total = 0;
  INTERIOR_SEEDS.forEach((seed, i) => {
    const node = interiorFingerprints(seed, REGIONS);
    total += node.length;
    if (JSON.stringify(node) !== JSON.stringify(chromeInteriors[i])) {
      interiorMismatch++;
      const a = node.find((n, k) => JSON.stringify(n) !== JSON.stringify(chromeInteriors[i]![k]));
      console.log(`interior mismatch for ${seed} at ${a?.id}`);
    }
  });
  console.log(`interiors: ${total} POIs in ${INTERIOR_SEEDS.length} worlds, mismatching worlds: ${interiorMismatch}`);
  failures += interiorMismatch;
} finally {
  await browser.close();
}
console.log(failures === 0 ? "OK: Node and Chrome generate identical worlds." : `FAILED: ${failures} mismatches`);
process.exit(failures === 0 ? 0 : 1);
