import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FANTASTIC_GEN_VERSION, GEN_VERSION } from "../../src/core/version";
import { FANTASTIC_GOLDEN_SEEDS, fantasticGoldenHashes, goldenSize } from "../helpers/golden";

/**
 * The monsters of Fantastic Islands have golden values of their own (`FANTASTIC_GEN_VERSION`, `npm run golden:update:fantastic`): wild groups, huts and the populations of caves and dungeons. The
 * shape of the world is Classic's golden (`world.test.ts`), the same in both rule sets, so a change to the extension never touches Classic's file.
 */
describe("the monsters of Fantastic Islands", () => {
  it("match the golden values (raise FANTASTIC_GEN_VERSION and run golden:update:fantastic on purpose only)", { timeout: 240_000 }, () => {
    const file = join(import.meta.dirname, "..", "golden", "world-hashes-fantastic.json");
    expect(existsSync(file), "run `npm run golden:update:fantastic` once to create the golden file").toBe(true);
    const golden = JSON.parse(readFileSync(file, "utf-8")) as { genVersion: number; fantasticVersion: number; hashes: Record<string, number[]> };
    expect(golden.genVersion, "the shape of the world changed (GEN_VERSION): run `npm run golden:update:fantastic`").toBe(GEN_VERSION);
    expect(golden.fantasticVersion, "the extension changed: run `npm run golden:update:fantastic`").toBe(FANTASTIC_GEN_VERSION);
    for (const seed of FANTASTIC_GOLDEN_SEEDS) expect(fantasticGoldenHashes(seed), `seed ${seed} (${goldenSize(seed)})`).toEqual(golden.hashes[seed]);
  });
});
