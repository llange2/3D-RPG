import { describe, expect, it } from "vitest";
import { blocksCell, buildMapContent, validateContent } from "../../src/actions";
import { TORCHLIGHT_ITEM } from "../../src/data/quest-table";
import { Explored } from "../../src/game/state";
import { CELL, generateInterior } from "../../src/interiors";
import { splitsRing } from "../../src/interiors/passage";
import { crystalLamps, ITEM_LAMPS } from "../../src/render/lamps";
import { OWN_MODELS, WALL_HUNG, themedProp } from "../../src/render/interiorProps";
import { propSpec, TILE_MODELS } from "../../src/render/terrainMesher";
import { BIOME, DECO } from "../../src/world/types";
import { World } from "../../src/world/world";
import { createDefaultParty } from "../../src/sim/party";
import { conditionTitle } from "../../src/ui/conditionInfo";

describe("the fixes of 22. 11. 2026", () => {
  it("no statue of a quest stands in a passage: the Shaft of Ithoa (moss-mere-318, small) keeps the way to its chamber", () => {
    const world = new World("moss-mere-318", "small", "default");
    const poi = world.allPois().find((p) => p.name === "Shaft of Ithoa")!;
    const map = generateInterior(world, poi);
    const content = buildMapContent(world, poi, map);
    const blocked = new Set(content.actions.filter((a) => blocksCell(a)).map((a) => a.y * map.width + a.x));
    const open = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.cells[y * map.width + x] === CELL.FLOOR && !blocked.has(y * map.width + x);
    for (const a of content.actions) if (blocksCell(a) && a.kind !== "door" && a.kind !== "breakable_wall") expect(splitsRing(open, a.x, a.y), `${a.uid} at ${a.x},${a.y}`).toBe(false);
    expect(validateContent(map, content)).toEqual([]);
  });

  it("an old save keeps what its party explored: the interiors count as explored on their new layout, the overworld stays as it was", () => {
    const explored = new Explored({ w: 100, h: 70 });
    explored.markOverworld(5, 6);
    explored.mark("in:p:0:0:7:0", 3, 400);
    explored.mark("in:gone:0", 1, 100);
    explored.revealInteriors((key) => (key === "in:p:0:0:7:0" ? 400 : null));
    for (let i = 0; i < 400; i++) expect(explored.has("in:p:0:0:7:0", i)).toBe(true);
    // (a place that cannot be built any more is forgotten, the overworld is not touched)
    expect(explored.has("in:gone:0", 1)).toBe(false);
    expect(explored.hasOverworld(5, 6)).toBe(true);
    expect(explored.hasOverworld(7, 6)).toBe(false);
  });

  it("the mouse-over of several conditions has a head of its own (its first line is the head of the box)", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    c.conditions = ["Poisoned", "Drunk"];
    expect(conditionTitle(c, party.minutes).split("\n")[0]).toBe("Conditions");
  });

  it("the small decoration of the open country is drawn from the user's models, and they are preloaded", () => {
    expect(propSpec(DECO.TUFT, BIOME.MEADOW, 0)!.model).toBe("obj_grass_blades");
    expect(propSpec(DECO.BUSH, BIOME.FOREST, 0)!.model).toBe("obj_mushroom_blue");
    expect(propSpec(DECO.BUSH, BIOME.SWAMP, 3)!.model).toBe("obj_mushroom_blue");
    const flowers = new Set([0, 1, 2, 3].map((h) => propSpec(DECO.BUSH, BIOME.MEADOW, h)!.model));
    // (only the user's models: the procedural blue and pink flowers are gone, bug_fix_78)
    expect([...flowers].sort()).toEqual(["obj_flower_red", "obj_flower_yellow"]);
    for (const key of ["obj_grass_blades", "obj_mushroom_blue", "obj_flower_red", "obj_flower_yellow"]) expect(TILE_MODELS).toContain(key);
  });

  describe("the torch on the wall (item 334)", () => {
    const world = new World("birch-reach-493", "default", "default");

    it("hangs beside the banners on the walls of every castle, regularly, on a wall of its cell and looking into the room", () => {
      const castles = world.allPois().filter((p) => p.kind === "castle");
      expect(castles.length).toBeGreaterThan(0);
      for (const poi of castles) {
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        const torches = content.actions.filter((a) => a.params.item === TORCHLIGHT_ITEM);
        const banners = content.actions.filter((a) => [103, 104, 105].includes(Number(a.params.item)));
        expect(torches.length, poi.name).toBeGreaterThan(5);
        expect(torches.length, poi.name).toBeLessThanOrEqual(banners.length);
        const cells = new Set<string>();
        for (const t of torches) {
          expect(cells.has(`${t.x},${t.y}`), `${t.uid} shares its cell`).toBe(false);
          cells.add(`${t.x},${t.y}`);
          // the wall is behind it: the cell on the side it looks away from is not floor
          const b = t.params.bearing as number;
          const back = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }[b]!;
          expect(map.cells[(t.y + back[1]!) * map.width + t.x + back[0]!], t.uid).not.toBe(CELL.FLOOR);
          expect(map.cells[t.y * map.width + t.x]).toBe(CELL.FLOOR);
        }
        expect(validateContent(map, content), poi.name).toEqual([]);
      }
    });

    it("hangs a few at a time in the caves, never in a cell without a wall beside it, and blocks nothing", () => {
      let total = 0;
      let caves = 0;
      for (const poi of world.allPois().filter((p) => p.kind === "cave")) {
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        const torches = content.actions.filter((a) => a.params.item === TORCHLIGHT_ITEM);
        expect(torches.length, poi.name).toBeLessThanOrEqual(5);
        for (const t of torches) {
          expect(blocksCell(t), t.uid).toBe(false);
          const b = t.params.bearing as number;
          const back = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }[b]!;
          expect(map.cells[(t.y + back[1]!) * map.width + t.x + back[0]!], t.uid).not.toBe(CELL.FLOOR);
        }
        total += torches.length;
        caves++;
      }
      expect(caves).toBeGreaterThan(10);
      expect(total).toBeGreaterThan(0);
      // (some caves have none: "a few, here and there")
      expect(total).toBeLessThan(caves * 5);
    });

    it("is a wall-hung object with its own model, a light and smoke at the flame in front of the wall", () => {
      expect(WALL_HUNG.has(TORCHLIGHT_ITEM)).toBe(true);
      expect(OWN_MODELS[TORCHLIGHT_ITEM]!.model).toBe("obj_torchlight");
      const lamp = ITEM_LAMPS[TORCHLIGHT_ITEM]!;
      expect(lamp.fx).toBe("torch");
      expect(lamp.halo).toBe(true);
      // the light and the halo have the colour of an orange flame
      expect(lamp.color[0]).toBeGreaterThan(lamp.color[1]);
      expect(lamp.color[1]).toBeGreaterThan(lamp.color[2]);
      const action = { uid: "t#1", kind: "decor" as const, x: 4, y: 4, params: { item: TORCHLIGHT_ITEM, bearing: 90 } };
      const [source] = crystalLamps({ mapKey: "t", tier: 1, actions: [action], spawns: [] });
      // it looks east, so it hangs on the west wall of its cell (x lies below the cell's middle, the flame in front of the wall)
      const middle = 4 * 3 + 1.5;
      expect(source!.x).toBeLessThan(middle);
      expect(source!.x).toBeGreaterThan(middle - 1.5);
      // the prop sits against the wall, its back plane in it, and looks into the room
      const prop = themedProp(action, middle, -middle, 90, { obj_torchlight: { file: "", tris: 0, bytes: 0, animations: [], bounds: [-0.11, -0.48, -0.13, 0.11, 0.48, 0.13] } as never });
      expect(prop!.model).toBe("obj_torchlight");
      expect(prop!.rotY).toBeCloseTo(Math.PI / 2, 6);
      expect(prop!.x).toBeLessThan(middle);
    });
  });
});
