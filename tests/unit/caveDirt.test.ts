import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEIGHT_FACTOR, WIDTH_FACTOR } from "../../src/data/item-tuning";
import { setTileModels, tileToWorldX, tileToWorldZ } from "../../src/render/heights";
import { meshChunk } from "../../src/render/terrainMesher";
import { CHUNK_SIZE } from "../../src/world/types";
import { World } from "../../src/world/world";

describe("41st playtest, follow-up: the cave entrance", () => {
  beforeAll(() => setTileModels(true));
  afterAll(() => setTileModels(false));

  it("is 30 % larger in every dimension than the table says (bug_fix_65; the 10 % of the 41st playtest were taken back, this is the new model)", () => {
    expect(HEIGHT_FACTOR["42"]).toBe(1.3);
    expect(WIDTH_FACTOR["42"]).toBe(1.3);
  });

  it("always stands on dirt in the 3D ground, whatever the climate of its island", { timeout: 120_000 }, () => {
    for (const seed of ["cedar-peak-198", "north-ward-302", "frost-gate-324"]) {
      const world = new World(seed, "default");
      const caves = world.allPois().filter((p) => p.kind === "cave");
      expect(caves.length, seed).toBeGreaterThan(0);
      for (const p of caves) {
        const g = meshChunk(world, Math.floor(p.x / CHUNK_SIZE), Math.floor(p.y / CHUNK_SIZE));
        const x = tileToWorldX(p.x) + 1.5;
        const z = tileToWorldZ(p.y) - 1.5;
        const models = g.props.filter((q) => Math.abs(q.x - x) < 0.6 && Math.abs(q.z - z) < 0.6).map((q) => q.model);
        expect(models, `${seed} ${p.name}`).toContain("poi_cave");
        expect(models, `${seed} ${p.name}`).toContain("gnd_dirt");
        expect(models.some((m) => m.startsWith("gnd_") && m !== "gnd_dirt"), `${seed} ${p.name}`).toBe(false);
      }
    }
  });
});
