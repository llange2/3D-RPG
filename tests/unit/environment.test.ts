import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateInterior, type InteriorMap } from "../../src/interiors";
import { DEFAULT_SETTINGS, parseSettings } from "../../src/game/settings";
import { QUALITY_PRESETS, applyQuality, qualityOf } from "../../src/game/quality";
import { ENVIRONMENTS, ENVIRONMENT_NAMES, hasGroundModels, hasWallModels } from "../../src/render/environment";
import { ceilingModelAt, environmentModels, floorModelAt, meshInterior, modelCeilingCells, modelFloorCells } from "../../src/render/interiorMesher";
import { FACING_DELTA } from "../../src/interiors/types";
import { CELL } from "../../src/interiors";
import { BIOME } from "../../src/world/types";
import { World } from "../../src/world/world";

const PUBLIC = join(import.meta.dirname, "..", "..", "public", "assets");

describe("Options > Graphics > Environment", () => {
  it("has three choices with the names of the menu", () => {
    expect(ENVIRONMENTS).toEqual(["flat", "floor", "full"]);
    expect(ENVIRONMENTS.map((e) => ENVIRONMENT_NAMES[e])).toEqual(["Flat", "3D Floor/Ceiling", "Full 3D"]);
  });

  it("draws floors and ceilings from the second choice on and the walls only in Full 3D", () => {
    expect(ENVIRONMENTS.map(hasGroundModels)).toEqual([false, true, true]);
    expect(ENVIRONMENTS.map(hasWallModels)).toEqual([false, false, true]);
  });

  it("starts flat, and reads the old on/off switch as flat or 3D floor/ceiling", () => {
    expect(DEFAULT_SETTINGS.environment).toBe("flat");
    expect(parseSettings(JSON.stringify({ floorModel: false })).environment).toBe("flat");
    expect(parseSettings(JSON.stringify({ floorModel: true })).environment).toBe("floor");
    expect(parseSettings(JSON.stringify({ environment: "full" })).environment).toBe("full");
    // the new field wins over the old one, and a value that is none of the three is ignored
    expect(parseSettings(JSON.stringify({ floorModel: true, environment: "flat" })).environment).toBe("flat");
    expect(parseSettings(JSON.stringify({ environment: "ultra" })).environment).toBe("flat");
  });

  it("is flat at Low and Medium and Full 3D at High, and any other mix is Custom", () => {
    expect(QUALITY_PRESETS.low.environment).toBe("flat");
    expect(QUALITY_PRESETS.medium.environment).toBe("flat");
    expect(QUALITY_PRESETS.high.environment).toBe("full");
    expect(qualityOf({ ...applyQuality("high", DEFAULT_SETTINGS), environment: "floor" })).toBe("custom");
    expect(qualityOf({ ...applyQuality("medium", DEFAULT_SETTINGS), environment: "full" })).toBe("custom");
  });
});

describe("what each place draws in 3D", () => {
  const world = new World("environment");
  const poi = (kind: "dungeon" | "cave" | "castle" | "town") => ({ id: `p:e:${kind}`, kind, name: kind, x: 3, y: 4, size: 1, side: "S" as const, region: { rx: 0, ry: 0 }, anchor: false, tier: 2, biome: BIOME.MEADOW });
  const map = (kind: "dungeon" | "cave" | "castle" | "town"): InteriorMap => generateInterior(world, poi(kind));

  it("loads nothing in the flat environment", () => {
    for (const kind of ["dungeon", "cave", "castle", "town"] as const) expect(environmentModels(map(kind), "flat"), kind).toEqual([]);
  });

  it("gives every place the models of its own textures", () => {
    expect(environmentModels(map("dungeon"), "floor").sort()).toEqual(["blk_dungeon_ceiling", "blk_floor"]);
    expect(environmentModels(map("cave"), "floor")).toEqual(["blk_cave_ceiling"]);
    expect(environmentModels(map("town"), "floor")).toEqual(["blk_city_floor"]);
    // the castle lies under the open sky: its floor has a model, its wall a piece (Full 3D), and it has no ceiling
    expect(environmentModels(map("castle"), "floor")).toEqual(["blk_fortress_floor"]);
    expect(environmentModels(map("castle"), "full").sort()).toEqual(["blk_fortress_floor", "blk_fortress_wall"]);
    // the dungeon's, the cave's and the town's walls have no piece of their own
    expect(environmentModels(map("dungeon"), "full").sort()).toEqual(["blk_dungeon_ceiling", "blk_floor"]);
  });

  it("puts a ceiling model over every floor cell of a dungeon and a cave, and none over a town", () => {
    for (const kind of ["dungeon", "cave"] as const) {
      const m = map(kind);
      const cells = modelCeilingCells(m);
      expect(cells.length, kind).toBeGreaterThan(100);
      for (const i of cells) expect(m.cells[i]).toBe(CELL.FLOOR);
      expect(ceilingModelAt(m, m.spawn.x, m.spawn.y), kind).toBe(kind === "dungeon" ? "blk_dungeon_ceiling" : "blk_cave_ceiling");
    }
    expect(modelCeilingCells(map("town"))).toHaveLength(0);
    expect(modelCeilingCells(map("castle"))).toHaveLength(0);
  });

  it("covers a town with the city's tiles, and leaves the flat floor in place under them", () => {
    const town = map("town");
    const cells = modelFloorCells(town);
    expect(cells.length).toBeGreaterThan(100);
    for (const i of cells) expect(floorModelAt(town, i % town.width, Math.floor(i / town.width))).toBe("blk_city_floor");
    const quads = (models: string[]) => meshInterior(town, new Set(), { models: new Set(models) }).groups.filter((g) => g.material === "floor").reduce((n, g) => n + g.count / 6, 0);
    expect(quads(["blk_city_floor"])).toBe(quads([]));
  });

  it("makes a wall piece for every wall face of a castle in Full 3D, and none otherwise", () => {
    const castle = map("castle");
    const flat = meshInterior(castle);
    expect(flat.panels).toHaveLength(0);
    const full = meshInterior(castle, new Set(), { models: new Set(["blk_fortress_wall"]) });
    expect(full.panels.length).toBeGreaterThan(100);
    for (const p of full.panels) {
      expect(castle.cells[p.y * castle.width + p.x]).toBe(CELL.FLOOR);
      const d = FACING_DELTA[p.dir];
      const x = p.x + d.dx;
      const y = p.y + d.dy;
      const beyond = x < 0 || y < 0 || x >= castle.width || y >= castle.height ? CELL.SOLID : castle.cells[y * castle.width + x];
      expect(beyond, `${p.x},${p.y} ${p.dir}`).not.toBe(CELL.FLOOR);
    }
    // the flat wall stays behind the pieces (the far view), whichever environment: the geometry is the same
    expect(full.groups.filter((g) => g.material === "wall").reduce((n, g) => n + g.count, 0)).toBe(flat.groups.filter((g) => g.material === "wall").reduce((n, g) => n + g.count, 0));
    // a dungeon has no wall model
    expect(meshInterior(map("dungeon"), new Set(), { models: new Set(["blk_fortress_wall", "blk_floor"]) }).panels).toHaveLength(0);
  });
});

describe("the models of the user (tools/assets/sources/models)", () => {
  const registry = (file: string) => JSON.parse(readFileSync(join(PUBLIC, file), "utf-8")) as Record<string, { tris: number; bounds: number[]; fromObj: boolean }>;
  const built = existsSync(join(PUBLIC, "models.static.json")) && existsSync(join(PUBLIC, "models.static.original.json"));
  const size = (b: number[]) => ({ w: b[3]! - b[0]!, h: b[4]! - b[1]!, d: b[5]! - b[2]! });

  it.runIf(built)("lie down as slabs, one cell wide, and the wall piece stands up (both sets)", () => {
    for (const file of ["models.static.json", "models.static.original.json"]) {
      const r = registry(file);
      for (const key of ["blk_city_floor", "blk_fortress_floor", "blk_dungeon_ceiling", "blk_cave_ceiling", "blk_cyber_ceiling"]) {
        const s = size(r[key]!.bounds);
        // the files are normalised to 1.9 (floors, most ceilings) or to half of it (the spaceship's ceiling): the game scales a slab to the cell by its bounds
        expect(s.w, `${file} ${key}`).toBeGreaterThan(0.9);
        expect(Math.abs(s.w - s.d), `${file} ${key}`).toBeLessThan(0.1 * s.w);
        // the relief is a fraction of the width: a slab that stood on its edge would be as high as it is wide
        expect(s.h, `${file} ${key}`).toBeLessThan(0.3 * s.w);
      }
      const wall = size(r["blk_fortress_wall"]!.bounds);
      expect(wall.h).toBeGreaterThan(wall.w);
      expect(wall.d).toBeLessThan(0.2);
      // the fortress wall is 3 wide and 4.2 high in the game: the piece has about that shape
      expect(wall.h / wall.w).toBeGreaterThan(1.3);
      expect(wall.h / wall.w).toBeLessThan(1.45);
    }
  });

  it.runIf(built)("replace the old village, castle and lantern, in the generated world and in the campaign", () => {
    for (const file of ["models.static.json", "models.static.original.json"]) {
      const r = registry(file);
      for (const key of ["poi_town", "ci_47", "poi_castle", "ci_44", "obj_lantern", "ci_76"]) expect(r[key]!.fromObj, `${file} ${key}`).toBe(false);
      // the castle is about as big as the old one (1.85 x 1.5 x 1.85)
      const castle = size(r["poi_castle"]!.bounds);
      expect(Math.max(castle.w, castle.d)).toBeGreaterThan(1.7);
      expect(Math.max(castle.w, castle.d)).toBeLessThan(2.1);
      // the village stays about as big as the old one (1.7 x 1.25 x 1.9), the lantern as high (2.0)
      const village = size(r["poi_town"]!.bounds);
      expect(Math.max(village.w, village.d)).toBeGreaterThan(1.7);
      expect(Math.max(village.w, village.d)).toBeLessThan(2.1);
      expect(size(r["obj_lantern"]!.bounds).h).toBeGreaterThan(1.8);
    }
  });
});
