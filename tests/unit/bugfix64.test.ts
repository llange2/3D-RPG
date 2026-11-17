import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALIGNMENTS } from "../../src/data/castles";
import { CASTLE_RUIN_MODEL, meshChunk, setRuinedCastleKinds } from "../../src/render/terrainMesher";
import { CHUNK_SIZE } from "../../src/world/types";
import { World } from "../../src/world/world";

const ROOT = join(import.meta.dirname, "..", "..");

/** The models of the castles in the chunk that holds the place (the overworld draws a place once, by the chunk of its centre). */
function modelsOfCastle(world: World, poiId: string): string[] {
  const poi = world.poiById(poiId)!;
  const geo = meshChunk(world, Math.floor(world.wrapX(poi.x) / CHUNK_SIZE), Math.floor(world.wrapY(poi.y) / CHUNK_SIZE));
  return geo.props.map((p) => p.model).filter((m) => m === "poi_castle" || m === CASTLE_RUIN_MODEL);
}

describe("bug_fix_64, point 4: the castles of the kings that lost are ruins", () => {
  const world = new World("pearl-shore-794", "default");
  const castles = world.allPois().filter((p) => p.kind === "castle");

  it("a world has the three castles, one of each kind", () => {
    expect(castles.map((c) => world.castleAlignment(c.id)).sort()).toEqual([...ALIGNMENTS].sort());
  });

  it("draws every castle whole until a king has won", () => {
    setRuinedCastleKinds([]);
    for (const c of castles) expect(modelsOfCastle(world, c.id)).toContain("poi_castle");
  });

  it("draws the ruin in the place of the castle for the two kinds that lost, and the winner's castle stays", () => {
    const winner = "good";
    setRuinedCastleKinds(ALIGNMENTS.filter((k) => k !== winner));
    try {
      for (const c of castles) {
        const models = modelsOfCastle(world, c.id);
        if (world.castleAlignment(c.id) === winner) expect(models, c.name).toEqual(["poi_castle"]);
        else expect(models, c.name).toEqual([CASTLE_RUIN_MODEL]);
      }
    } finally {
      setRuinedCastleKinds([]);
    }
  });

  it("has the ruin built in both registries", () => {
    for (const file of ["models.static.original.json"]) {
      const registry = JSON.parse(readFileSync(join(ROOT, "public", "assets", file), "utf-8")) as Record<string, { file: string; tris: number }>;
      expect(registry[CASTLE_RUIN_MODEL], file).toBeDefined();
      expect(existsSync(join(ROOT, "public", "assets", registry[CASTLE_RUIN_MODEL]!.file)), file).toBe(true);
    }
  });
});

describe("bug_fix_64, point 3: the cave entrance is the user's model", () => {
  it("is built from Cave_Entrance.glb for the overworld and the old item 42, and shows its door on +z (no extra yaw)", () => {
    for (const file of ["models.static.original.json"]) {
      const registry = JSON.parse(readFileSync(join(ROOT, "public", "assets", file), "utf-8")) as Record<string, { bounds: number[] }>;
      // the user's file is 1.88 x 1.16 x 1.90 (the old one 1.65 x 1.21 x 2.0)
      for (const key of ["poi_cave", "ci_42"]) {
        const b = registry[key]!.bounds;
        expect(b[3]! - b[0]!, `${file} ${key} width`).toBeGreaterThan(1.8);
        expect(b[5]! - b[2]!, `${file} ${key} depth`).toBeLessThan(1.95);
      }
    }
    const items = JSON.parse(readFileSync(join(ROOT, "src", "data", "item-models.json"), "utf-8")) as Record<string, { yaw: number }>;
    expect(items["42"]!.yaw).toBe(0);
    expect(existsSync(join(ROOT, "tools", "assets", "sources", "models", "Cave_Entrance.glb"))).toBe(true);
    expect(existsSync(join(ROOT, "tools", "assets", "sources", "models", "Castle_destroyed.glb"))).toBe(true);
  });
});
