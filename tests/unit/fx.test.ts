import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FX_PICTURES } from "../../tools/assets/build-fx";
import { QUALITY_PRESETS, applyQuality, qualityOf } from "../../src/game/quality";
import { DEFAULT_SETTINGS, parseSettings } from "../../src/game/settings";
import { EFFECT_LEVELS, FOUNTAIN_SHAPES, FX_FILES, IMPACT_FRAMES, IMPACT_GRID, IMPACT_KINDS, PARTICLE_CELLS, PARTICLE_GRID, cellUv } from "../../src/render/fxSheets";

const ROOT = join(import.meta.dirname, "..", "..");
const SOURCES = join(ROOT, "tools", "assets", "sources", "fx");
const PUBLIC = join(ROOT, "public", "assets");

describe("effects: the pictures", () => {
  it("names the cells of the particle sheet like the register of its source", () => {
    const register = JSON.parse(readFileSync(join(SOURCES, "fx_particles.json"), "utf-8")) as { grid: number[]; cell: number; cells: { name: string; cell: number; present?: boolean }[] };
    expect(register.grid).toEqual([PARTICLE_GRID, PARTICLE_GRID]);
    for (const c of register.cells) expect(PARTICLE_CELLS[c.name as keyof typeof PARTICLE_CELLS], c.name).toBe(c.cell);
    expect(Object.keys(PARTICLE_CELLS).length).toBe(register.cells.length);
  });

  it("has every source picture at the size the code counts on", async () => {
    const sizes: Record<string, [number, number]> = {
      particles: [1024, 1024], smoke: [1024, 256], water_ripple: [512, 512], water_jet: [128, 512],
      impact_fire: [1024, 1024], impact_ice: [1024, 1024], impact_acid: [1024, 1024], impact_magic: [1024, 1024], impact_water: [1024, 1024],
    };
    expect([...FX_PICTURES].sort()).toEqual(Object.keys(sizes).sort());
    for (const [name, [w, h]] of Object.entries(sizes)) {
      const meta = await sharp(join(SOURCES, `fx_${name}.png`)).metadata();
      expect([meta.width, meta.height], name).toEqual([w, h]);
      expect(meta.hasAlpha, name).toBe(true);
    }
    expect(IMPACT_GRID * IMPACT_GRID).toBe(IMPACT_FRAMES);
  });

  it("lists the built files the game loads (when the assets are built)", () => {
    if (!existsSync(join(PUBLIC, "manifest.json"))) return;
    const files = [FX_FILES.particles, FX_FILES.smoke, FX_FILES.ripple, FX_FILES.jet, ...IMPACT_KINDS.map((k) => FX_FILES.impact[k])];
    const manifest = JSON.parse(readFileSync(join(PUBLIC, "manifest.json"), "utf-8")) as { groups: Record<string, { files: string[] }> };
    for (const f of files) {
      expect(existsSync(join(PUBLIC, f)), f).toBe(true);
      expect(manifest.groups.fx?.files, f).toContain(f);
    }
  });

  it("cuts cells from the top left, row by row, with v growing upwards", () => {
    expect(cellUv(0, 4)).toEqual({ u0: 0, u1: 0.25, v0: 0.75, v1: 1 });
    expect(cellUv(5, 4)).toEqual({ u0: 0.25, u1: 0.5, v0: 0.5, v1: 0.75 });
    expect(cellUv(15, 4)).toEqual({ u0: 0.75, u1: 1, v0: 0, v1: 0.25 });
  });
});

describe("effects: the fountain", () => {
  it("fits its shape inside the model of the fountain", () => {
    const registry = JSON.parse(readFileSync(join(PUBLIC, "models.static.original.json"), "utf-8")) as Record<string, { bounds: number[] }>;
    for (const [model, shape] of Object.entries(FOUNTAIN_SHAPES)) {
      const b = registry[model]?.bounds;
      if (!b) continue;
      const height = b[4]! - b[1]!;
      const radius = Math.min(b[3]! - b[0]!, b[5]! - b[2]!) / 2;
      expect(shape.topY, model).toBeLessThanOrEqual(height + 0.01);
      expect(shape.basinY).toBeLessThan(shape.upperY);
      expect(shape.upperY).toBeLessThan(shape.topY);
      expect(shape.basinR).toBeLessThan(radius);
      expect(shape.upperR).toBeLessThan(shape.basinR);
    }
  });
});

describe("effects: the setting", () => {
  it("defaults to full, reads the stored level and ignores junk", () => {
    expect(DEFAULT_SETTINGS.effects).toBe("full");
    for (const level of EFFECT_LEVELS) expect(parseSettings(JSON.stringify({ effects: level })).effects).toBe(level);
    expect(parseSettings(JSON.stringify({ effects: "lots" })).effects).toBe("full");
    expect(parseSettings(JSON.stringify({})).effects).toBe("full");
  });

  it("is part of the quality presets", () => {
    expect(QUALITY_PRESETS.low.effects).toBe("low");
    expect(QUALITY_PRESETS.medium.effects).toBe("full");
    expect(QUALITY_PRESETS.high.effects).toBe("full");
    expect(qualityOf({ ...applyQuality("medium", DEFAULT_SETTINGS), effects: "off" })).toBe("custom");
    expect(qualityOf({ ...applyQuality("low", DEFAULT_SETTINGS), effects: "full" })).toBe("custom");
  });
});
