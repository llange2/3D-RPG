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
    // the castle lies under the open sky: its floor has a model, its walls stay flat (also in Full 3D), and it has no ceiling
    expect(environmentModels(map("castle"), "floor")).toEqual(["blk_fortress_floor"]);
    expect(environmentModels(map("castle"), "full")).toEqual(["blk_fortress_floor"]);
    // the dungeon's and the town's walls have a piece (Full 3D), the dungeon's also the one of a wall that gave way; the cave's walls are its rock models
    expect(environmentModels(map("dungeon"), "full").sort()).toEqual(["blk_dungeon_ceiling", "blk_dungeon_wall", "blk_dungeon_wall_broken", "blk_floor"]);
    expect(environmentModels(map("town"), "full").sort()).toEqual(["blk_city_floor", "blk_city_wall"]);
    expect(environmentModels(map("cave"), "full")).toEqual(["blk_cave_ceiling"]);
  });

  it("lifts the flat ceiling over a flattened cave ceiling by its depth, and over no other", () => {
    const cave = map("cave");
    const cell = cave.spawn;
    const roofOf = (lift?: Record<string, number>) => {
      const g = meshInterior(cave, new Set(), { models: new Set(["blk_cave_ceiling"]), ceilingLift: lift });
      let top = 0;
      for (const group of g.groups.filter((x) => x.material === "ceiling")) for (let i = group.start; i < group.start + group.count; i++) top = Math.max(top, g.positions[g.indices[i]! * 3 + 1]!);
      return top;
    };
    expect(roofOf({ blk_cave_ceiling: 0.4 }) - roofOf()).toBeCloseTo(0.4, 5);
    expect(roofOf({ blk_dungeon_ceiling: 0.4 })).toBeCloseTo(roofOf(), 5);
    expect(cell).toBeDefined();
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

  it("makes a wall piece for every wall face of a dungeon and of a town in Full 3D, and none for a castle or a cave", () => {
    for (const [kind, piece] of [["dungeon", "blk_dungeon_wall"], ["town", "blk_city_wall"]] as const) {
      const place = map(kind);
      const flat = meshInterior(place);
      expect(flat.panels, kind).toHaveLength(0);
      const full = meshInterior(place, new Set(), { models: new Set([piece]) });
      expect(full.panels.length, kind).toBeGreaterThan(100);
      for (const p of full.panels) {
        expect(p.model).toBe(piece);
        expect(place.cells[p.y * place.width + p.x]).toBe(CELL.FLOOR);
        const d = FACING_DELTA[p.dir];
        const x = p.x + d.dx;
        const y = p.y + d.dy;
        const beyond = x < 0 || y < 0 || x >= place.width || y >= place.height ? CELL.SOLID : place.cells[y * place.width + x];
        expect(beyond, `${kind} ${p.x},${p.y} ${p.dir}`).not.toBe(CELL.FLOOR);
      }
      // the flat wall stays behind the pieces (the far view), whichever environment: the geometry is the same
      const wallCount = (g: typeof flat) => g.groups.filter((x) => x.material === "wall" || x.material === "building").reduce((n, x) => n + x.count, 0);
      expect(wallCount(full), kind).toBe(wallCount(flat));
    }
    // a castle and a cave have no wall model: the pieces of the others do not fit them
    const all = new Set(["blk_dungeon_wall", "blk_city_wall", "blk_floor"]);
    expect(meshInterior(map("castle"), new Set(), { models: all }).panels).toHaveLength(0);
    expect(meshInterior(map("cave"), new Set(), { models: all }).panels).toHaveLength(0);
  });
});

describe("the models of the user (tools/assets/sources/models)", () => {
  const registry = (file: string) => JSON.parse(readFileSync(join(PUBLIC, file), "utf-8")) as Record<string, { tris: number; bounds: number[]; fromObj: boolean }>;
  const built = existsSync(join(PUBLIC, "models.static.json")) && existsSync(join(PUBLIC, "models.static.original.json"));
  const size = (b: number[]) => ({ w: b[3]! - b[0]!, h: b[4]! - b[1]!, d: b[5]! - b[2]! });

  it.runIf(built)("lie down as slabs, one cell wide, and the wall piece stands up (both sets)", () => {
    for (const file of ["models.static.json", "models.static.original.json"]) {
      const r = registry(file);
      for (const key of ["blk_city_floor", "blk_fortress_floor", "blk_dungeon_ceiling", "blk_cave_ceiling", "blk_cyber_floor"]) {
        const s = size(r[key]!.bounds);
        // the files are normalised to 1.9 (floors, most ceilings) or to half of it (the spaceship's floor): the game scales a slab to the cell by its bounds
        expect(s.w, `${file} ${key}`).toBeGreaterThan(0.9);
        expect(Math.abs(s.w - s.d), `${file} ${key}`).toBeLessThan(0.1 * s.w);
        // the relief is a fraction of the width: a slab that stood on its edge would be as high as it is wide
        expect(s.h, `${file} ${key}`).toBeLessThan(0.3 * s.w);
      }
      // the wall pieces stand up (the thin side along z, the relief towards +z), at least as high as wide
      for (const key of ["blk_city_wall", "blk_dungeon_wall", "blk_dungeon_wall_broken"]) {
        const wall = size(r[key]!.bounds);
        expect(wall.h, `${file} ${key}`).toBeGreaterThanOrEqual(wall.w * 0.99);
        expect(wall.d, `${file} ${key}`).toBeLessThan(0.3);
      }
      // the floor tiles carry the height of their face (the plane with most area), below the tips of their engravings: the game sets them by it
      for (const key of ["blk_city_floor", "blk_fortress_floor", "blk_cyber_floor"]) {
        const info = r[key] as unknown as { surface?: number; bounds: number[] };
        expect(info.surface, `${file} ${key}`).toBeDefined();
        expect(info.surface!, `${file} ${key}`).toBeLessThanOrEqual(info.bounds[4]!);
        expect(info.surface!, `${file} ${key}`).toBeGreaterThan(info.bounds[1]!);
      }
      for (const gone of ["blk_fortress_wall", "blk_cyber_ceiling"]) expect(r[gone], `${file} ${gone}`).toBeUndefined();
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
