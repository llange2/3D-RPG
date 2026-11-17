import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FX_PICTURES } from "../../tools/assets/build-fx";
import { QUALITY_PRESETS, applyQuality, qualityOf } from "../../src/game/quality";
import { DEFAULT_SETTINGS, parseSettings } from "../../src/game/settings";
import { EFFECT_LEVELS, FOUNTAIN_SHAPES, FX_FILES, IMPACT_FRAMES, IMPACT_GRID, IMPACT_KINDS, PARTICLE_CELLS, PARTICLE_GRID, cellUv, impactOfElement } from "../../src/render/fxSheets";

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
      particles: [1024, 1024], smoke: [1024, 256], water_ripple: [512, 512], water_flow: [128, 512], water_drop: [148, 256], foam: [512, 512],
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
    const files = [FX_FILES.particles, FX_FILES.smoke, FX_FILES.ripple, FX_FILES.flow, FX_FILES.drop, FX_FILES.foam, ...IMPACT_KINDS.map((k) => FX_FILES.impact[k])];
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
      expect(shape.basinR, model).toBeLessThan(radius);
      if (shape.kind === "tiered") {
        expect(shape.topY, model).toBeLessThanOrEqual(height + 0.01);
        // the sheet of water runs from the rim down to the water and stays inside the basin
        expect(shape.basinY).toBeLessThan(shape.topY);
        expect(shape.flow[0]![0]).toBeCloseTo(shape.topY, 6);
        expect(shape.flow.at(-1)![0]).toBeCloseTo(shape.basinY, 6);
        for (const [y, r] of shape.flow) {
          expect(r, `flow at ${y}`).toBeLessThan(shape.basinR);
          expect(y).toBeLessThanOrEqual(shape.topY);
        }
        expect(shape.footR).toBeLessThan(shape.basinR);
      } else {
        // the stream stands inside the basin, from the water up to the mouth, narrows downwards, and the drops drift in a unit direction over the water
        expect(shape.mouthY, model).toBeLessThanOrEqual(height + 0.01);
        expect(shape.basinY).toBeLessThan(shape.streamTopY);
        expect(shape.streamTopY).toBeLessThanOrEqual(shape.mouthY);
        expect(shape.streamFootR).toBeLessThan(shape.streamTopR);
        expect(shape.basinY).toBeLessThan(shape.mouthY);
        expect(Math.hypot(shape.spoutX, shape.spoutZ)).toBeLessThan(shape.basinR);
        expect(Math.hypot(shape.throwX, shape.throwZ)).toBeCloseTo(1, 6);
        expect(Math.hypot(shape.spoutX + shape.throwX * shape.throwR * 1.3, shape.spoutZ + shape.throwZ * shape.throwR * 1.3), "the drops land in the basin").toBeLessThan(shape.basinR);
      }
    }
  });

  it("lets the sheet of the town's fountain run from the rim of the urn, outside the faces (0.35 from the axis at 1.5)", () => {
    const shape = FOUNTAIN_SHAPES.obj_fountain!;
    if (shape.kind !== "tiered") throw new Error("the town fountain is a tiered one");
    expect(shape.flow[0]![0], "the sheet starts at the rim of the urn, where the drops leave").toBe(shape.topY);
    const widest = shape.flow.find(([y]) => y <= 1.5)!;
    expect(widest[1], "outside the widest part of the faces").toBeGreaterThan(0.35);
    // going down the sheet never narrows again (it would cut into the stone)
    for (let i = 1; i < shape.flow.length; i++) expect(shape.flow[i]![1]).toBeGreaterThanOrEqual(shape.flow[i - 1]![1]);
    // a little towards turquoise: more green than the blue of the first version (0.37, 0.62, 0.94 on the picture)
    expect(shape.water[1]).toBeGreaterThan(0.7);
  });

  it("wraps the mermaid's stream round the model's own column: narrowing downwards, the colour of the model's water", () => {
    const shape = FOUNTAIN_SHAPES.ci_89!;
    if (shape.kind !== "horn") throw new Error("the mermaid fountain is a horn");
    // the column of the model is 0.024 across at the top and 0.017 at the bottom (`tools/dev/model-jet.mjs`): the sheet is just wider, and a little below the top of the column (0.61)
    expect(shape.streamTopR).toBeGreaterThan(0.024);
    expect(shape.streamTopR).toBeLessThan(0.04);
    expect(shape.streamFootR).toBeGreaterThan(0.017);
    expect(shape.streamFootR).toBeLessThan(shape.streamTopR);
    expect(shape.streamTopY).toBeLessThan(0.61);
    // light turquoise (160, 210, 216)
    expect(shape.water[0]).toBeCloseTo(160 / 255, 1);
    expect(shape.water[1]).toBeCloseTo(210 / 255, 1);
    expect(shape.water[2]).toBeCloseTo(216 / 255, 1);
  });

  it("knows the three fountains: the town's, the landmark's and the mermaid's", () => {
    expect(Object.keys(FOUNTAIN_SHAPES).sort()).toEqual(["ci_2", "ci_89", "obj_fountain"]);
    expect(FOUNTAIN_SHAPES.ci_89!.kind).toBe("horn");
  });
});

describe("effects: Prismatic Light", () => {
  it("shows the picture of the damage type where a line ends", () => {
    expect(impactOfElement("fire")).toBe("fire");
    expect(impactOfElement("ice")).toBe("ice");
    expect(impactOfElement("acid")).toBe("acid");
    expect(impactOfElement("poison")).toBe("acid");
    // no picture of their own: the magic one
    expect(impactOfElement("magic")).toBe("magic");
    expect(impactOfElement("physical")).toBe("magic");
  });
});

describe("effects: the setting", () => {
  it("defaults to full, reads the stored level and ignores junk", () => {
    expect(DEFAULT_SETTINGS.effects).toBe("full");
    for (const level of EFFECT_LEVELS) expect(parseSettings(JSON.stringify({ effects: level })).effects).toBe(level);
    expect(parseSettings(JSON.stringify({ effects: "lots" })).effects).toBe("full");
    expect(parseSettings(JSON.stringify({})).effects).toBe("full");
  });

  it("has the glow (bloom) only on the High quality, off by default, and reads it back", () => {
    expect(QUALITY_PRESETS.high.bloom).toBe(true);
    expect(QUALITY_PRESETS.medium.bloom).toBe(false);
    expect(QUALITY_PRESETS.low.bloom).toBe(false);
    expect(DEFAULT_SETTINGS.bloom).toBe(false);
    expect(parseSettings(JSON.stringify({ bloom: true })).bloom).toBe(true);
    expect(parseSettings(JSON.stringify({ bloom: "yes" })).bloom).toBe(false);
    // a custom mix: High with the glow switched off is no longer High
    expect(qualityOf({ ...applyQuality("high", DEFAULT_SETTINGS), bloom: false })).toBe("custom");
  });

  it("is part of the quality presets", () => {
    expect(QUALITY_PRESETS.low.effects).toBe("low");
    expect(QUALITY_PRESETS.medium.effects).toBe("full");
    expect(QUALITY_PRESETS.high.effects).toBe("full");
    expect(qualityOf({ ...applyQuality("medium", DEFAULT_SETTINGS), effects: "off" })).toBe("custom");
    expect(qualityOf({ ...applyQuality("low", DEFAULT_SETTINGS), effects: "full" })).toBe("custom");
  });
});
