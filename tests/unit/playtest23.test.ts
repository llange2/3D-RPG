import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { CELL, FACING_DELTA, generateInterior } from "../../src/interiors";
import { DEFAULT_SETTINGS, parseSettings } from "../../src/game/settings";
import { FlatTileSet, flatTerrainOf } from "../../src/render/flatGround";
import { shownItem, themedProp } from "../../src/render/interiorProps";
import { parseFlatName, quartersOf, type FlatRegister } from "../../src/data/flatTerrain";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const ASSETS = join(import.meta.dirname, "..", "..", "public", "assets");

describe("23rd playtest, point 1: doors of a town stand in a wall that goes on", () => {
  it("leaves no free cell beside the wall of a shop's door or of the way out, and gives every shop a wall for its sign", () => {
    let shops = 0;
    for (const seed of ["pearl-keep-331", "alpha", "beta", "gamma"]) {
      for (const size of ["small", "default"] as WorldSize[]) {
        const world = new World(seed, size);
        for (const poi of world.allPois().filter((p) => p.kind === "town")) {
          const map = generateInterior(world, poi);
          const content = buildMapContent(world, poi, map);
          const floor = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR;
          const sideways = (dx: number) => (dx === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]]);
          for (const lot of map.lots) {
            shops++;
            const out = FACING_DELTA[lot.door.facing];
            const wx = lot.door.x - out.dx;
            const wy = lot.door.y - out.dy;
            const where = `${seed} ${size} ${poi.id} shop ${lot.door.x}/${lot.door.y}`;
            for (const [fx, fy] of sideways(out.dx)) expect(floor(wx + fx!, wy + fy!), `${where}: free cell beside the door wall`).toBe(false);
            // the sign hangs on a wall to the side of the shop cell, or on the door wall one cell along the street
            const beside = [1, -1].map((s) => ({ x: lot.door.x + s * -out.dy, y: lot.door.y + s * out.dx }));
            expect(beside.some((c) => !floor(c.x, c.y) || !floor(c.x - out.dx, c.y - out.dy)), `${where}: no wall for the sign`).toBe(true);
            // a wall that gives way is not the door wall nor next to the shop
            for (const a of content.actions.filter((a) => a.kind === "breakable_wall")) expect(Math.abs(a.x - lot.door.x) > 1 || Math.abs(a.y - lot.door.y) > 1, `${where}: breakable wall beside the door`).toBe(true);
          }
          const back = { x: map.exit.x - (map.spawn.x - map.exit.x), y: map.exit.y - (map.spawn.y - map.exit.y) };
          for (const [fx, fy] of sideways(map.exit.x - map.spawn.x)) expect(floor(back.x + fx!, back.y + fy!), `${seed} ${size} ${poi.id}: free cell beside the exit wall`).toBe(false);
        }
      }
    }
    expect(shops).toBeGreaterThan(300);
  });
});

describe("23rd playtest, point 4: the lectern turns its sloping top to the room", () => {
  it("does not turn the lectern (item 119, a glTF model) the half circle the other glTF objects get, so that its sloping side faces the open cell", () => {
    const at = (item: number) => themedProp({ uid: "u", kind: "decor", x: 1, y: 1, params: { item } }, 0, 0, 0, { ci_119: { bounds: { min: [-1, 0, -1], max: [1, 2, 1] } } as never, ci_16: { bounds: { min: [-1, 0, -1], max: [1, 2, 1] } } as never });
    expect(shownItem({ kind: "decor", params: { item: 119 } })).toBe(119);
    const lectern = at(119);
    const other = at(16);
    expect(lectern).not.toBeNull();
    expect(other).not.toBeNull();
    const turn = (a: number, b: number) => Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
    // item 16 is an OBJ model and stands as the bearing says; the lectern, whose model has its sloping top on the back, ends up the same way
    expect(turn(lectern!.rotY, other!.rotY)).toBeLessThan(0.01);
  });
});

describe.skipIf(!existsSync(join(ASSETS, "terrain", "flat", "tiles.json")))("23rd playtest, point 7: no corner without a painted tile at a pond bridge", () => {
  it("has a tile for every corner round 216/87 in cedar-keep-795 (large), where a road crossed a pond on a bridge", () => {
    const set = new FlatTileSet(JSON.parse(readFileSync(join(ASSETS, "terrain", "flat", "tiles.json"), "utf-8")) as FlatRegister);
    const world = new World("cedar-keep-795", "large");
    const terrain = (x: number, y: number) => flatTerrainOf(world.tile(x, y));
    for (let y = 80; y <= 94; y++) {
      for (let x = 208; x <= 224; x++) expect(set.hasExact(terrain(x, y), terrain(x + 1, y), terrain(x, y + 1), terrain(x + 1, y + 1)), `corner ${x}/${y}`).toBe(true);
    }
  });

  it("has a painted tile for every corner of cobblestone, water and one more terrain (the bridge heads), in every arrangement", () => {
    const register = JSON.parse(readFileSync(join(ASSETS, "terrain", "flat", "tiles.json"), "utf-8")) as FlatRegister;
    const set = new FlatTileSet(register);
    const lands = ["desert", "dirt", "grass", "snow", "swamp"] as const;
    let mixes = 0;
    for (const land of lands) {
      const trio = ["cobblestone", "water", land] as const;
      // all 81 colourings of four quarters with the three, 36 of which use all three
      for (const q of Array.from({ length: 81 }, (_, i) => [0, 1, 2, 3].map((k) => trio[Math.floor(i / 3 ** k) % 3]!))) {
        if (new Set(q).size !== 3) continue;
        mixes++;
        expect(set.hasExact(q[0]!, q[1]!, q[2]!, q[3]!), q.join("|")).toBe(true);
      }
    }
    expect(mixes).toBe(180);
  });

  it("leaves no corner of the sample worlds without a tile", () => {
    const set = new FlatTileSet(JSON.parse(readFileSync(join(ASSETS, "terrain", "flat", "tiles.json"), "utf-8")) as FlatRegister);
    for (const [seed, size] of [["alpha", "small"], ["beta", "small"], ["gamma", "small"], ["cedar-keep-795", "large"]] as const) {
      const world = new World(seed, size);
      const terrain = (x: number, y: number) => flatTerrainOf(world.tile(x, y));
      for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) expect(set.hasExact(terrain(x, y), terrain(x + 1, y), terrain(x, y + 1), terrain(x + 1, y + 1)), `${seed} ${x}/${y}`).toBe(true);
      }
    }
  });
});

describe("23rd playtest, point 7: names of the mixed tiles", () => {
  it("reads mix_<tl>_<tr>_<bl>_<br> as a tile of three terrains and rejects anything else", () => {
    expect(parseFlatName("mix_grass_water_cobblestone_cobblestone")).toEqual({ terrain: "cobblestone", shape: "mix", quarters: ["grass", "water", "cobblestone", "cobblestone"] });
    expect(() => parseFlatName("mix_grass_grass_water_water")).toThrow();
    expect(() => parseFlatName("mix_grass_water_snow_swamp")).toThrow();
    expect(() => parseFlatName("mix_grass_water_cobblestone")).toThrow();
    expect(quartersOf(parseFlatName("mix_water_snow_water_cobblestone"))).toEqual(["water", "snow", "water", "cobblestone"]);
  });
});

describe("23rd playtest, point 5: the item pictures are one sheet", () => {
  const registerFile = join(ASSETS, "ui", "items.json");
  it.skipIf(!existsSync(registerFile))("has a cell for every item picture, none twice, inside the sheet", () => {
    const sheet = JSON.parse(readFileSync(registerFile, "utf-8")) as { cell: number; columns: number; cells: number; cellOf: Record<string, number> };
    const names = Object.keys(sheet.cellOf);
    expect(names.length).toBe(sheet.cells);
    expect(new Set(Object.values(sheet.cellOf)).size).toBe(sheet.cells);
    expect(Math.max(...Object.values(sheet.cellOf))).toBeLessThan(sheet.cells);
    // (the quest items without a prefix of their own are in the sheet too, 35th playtest: the Quatloo coin showed no picture in the backpack)
    expect(names.every((n) => n.startsWith("item_") || n.startsWith("quest_"))).toBe(true);
    expect(names).toContain("quest_quatloo_coin");
    // the plain pictures a hero starts with are in it
    for (const n of ["item_1h_broad_sword_copper", "item_ring_1", "item_shield_wood"]) expect(names, n).toContain(n);
  });
});

describe("23rd playtest, point 6: animated town scenes", () => {
  it("are on by default (the Medium quality, 37th playtest), read from the stored settings and ignored when junk", () => {
    expect(DEFAULT_SETTINGS.animatedTown).toBe(true);
    expect(parseSettings(JSON.stringify({ animatedTown: false })).animatedTown).toBe(false);
    expect(parseSettings(JSON.stringify({ animatedTown: "yes" })).animatedTown).toBe(true);
  });

  it("has a clip for every service window", () => {
    for (const name of ["bank", "guild", "inn", "smith", "tavern", "temple", "training_grounds"]) {
      const file = join(ASSETS, "ui", "town", `town_${name}.webm`);
      if (existsSync(join(ASSETS, "ui", "town"))) expect(existsSync(file), name).toBe(true);
    }
  });
});
