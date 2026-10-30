import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { PERSONAS } from "../../src/data/personas";
import { MONSTERS } from "../../src/data/tables";
import { generateInterior, SHOWCASE_ID, CELL } from "../../src/interiors";
import { SHOWCASE_EXTRAS, showcaseItems } from "../../src/interiors/showcase";
import { INTERIOR_MODELS } from "../../src/render/interiorView";
import { ITEM_LAMPS, MONSTER_LAMPS } from "../../src/render/lamps";
import { World } from "../../src/world/world";

const world = new World("showcase", "small");
const poi = world.poiById(SHOWCASE_ID)!;
const map = generateInterior(world, poi);
const content = buildMapContent(world, poi, map);
const showcase = map.showcase!;

/**
 * The debug showcase (Esc > Debug > Teleport to Level, first entry): every monster, person and object of the game, none with a function. THE RULE (CLAUDE.md):
 * whatever is new in the game is there. These tests fail when something is not.
 */
describe("the debug showcase", () => {
  it("is a place the world knows, a dark dungeon hall", () => {
    expect(poi.id).toBe(SHOWCASE_ID);
    expect(map.theme.id).toBe("dungeon");
    expect(map.theme.open).toBe(false);
  });

  it("shows every monster of the table and every person, each on a floor cell of its own", () => {
    expect(showcase.monsters.map((m) => m.defId).sort((a, b) => a - b)).toEqual(Object.keys(MONSTERS).map(Number).sort((a, b) => a - b));
    expect(showcase.personas.map((p) => p.persona).sort((a, b) => a - b)).toEqual(Object.keys(PERSONAS).map(Number).sort((a, b) => a - b));
    const cells = [...showcase.monsters, ...showcase.personas, ...showcase.items, ...showcase.extras].map((c) => `${c.x},${c.y}`);
    expect(new Set(cells).size).toBe(cells.length);
    for (const c of [...showcase.monsters, ...showcase.personas, ...showcase.items, ...showcase.extras]) expect(map.cells[c.y * map.width + c.x]).toBe(CELL.FLOOR);
  });

  it("shows every old item that has a model as an object, and no item that is a person or an effect", () => {
    const { ordinary, landmarks } = showcaseItems();
    expect(showcase.items.map((i) => i.item).sort((a, b) => a - b)).toEqual([...ordinary, ...landmarks].sort((a, b) => a - b));
    // every light of the game that belongs to an item is there to be seen
    for (const id of Object.keys(ITEM_LAMPS).map(Number)) expect(showcase.items.some((i) => i.item === id), `item ${id} glows but is not in the showcase`).toBe(true);
  });

  it("has nothing that does something: plain decoration and the way out", () => {
    expect(content.spawns).toEqual([]);
    for (const a of content.actions) expect(["decor", "transfer"], a.uid).toContain(a.kind);
    expect(content.actions.filter((a) => a.kind === "decor")).toHaveLength(showcase.items.length);
  });

  it("holds every model of the interior view that no item stands for", () => {
    // the models of the interior view (`INTERIOR_MODELS`) are chests, shrines (items), signs (items), the traps' parts and the town's fountain and statue: only the last
    // two have no item. A new `obj_*` model has to be a `SHOWCASE_EXTRAS` entry or to be named here as one that an item already shows.
    const shownByItems = new Set(["obj_chest", "obj_chest_iron", "obj_chest_noble", "obj_chest_sapphire", "obj_well_red", "obj_well_yellow", "obj_altar", "blk_floor", "obj_spear_trap", "obj_pit", "obj_guillotine", "ci_87", "obj_lantern"]);
    const signs = INTERIOR_MODELS.filter((m) => m.startsWith("obj_sign_"));
    expect(signs).toHaveLength(7);
    const rest = INTERIOR_MODELS.filter((m) => !shownByItems.has(m) && !m.startsWith("obj_sign_"));
    expect(rest.sort()).toEqual(SHOWCASE_EXTRAS.map((e) => e.model).sort());
    expect(showcase.extras.map((e) => e.model).sort()).toEqual(SHOWCASE_EXTRAS.map((e) => e.model).sort());
  });

  it("names only monsters that exist in its list of glowing ones", () => {
    const names = new Set(Object.values(MONSTERS).map((m) => m.name));
    for (const name of Object.keys(MONSTER_LAMPS)) expect(names.has(name), name).toBe(true);
  });
});
