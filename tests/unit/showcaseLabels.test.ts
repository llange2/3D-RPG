import { describe, expect, it } from "vitest";
import { PERSONAS } from "../../src/data/personas";
import { MAP_ITEMS, MONSTERS } from "../../src/data/tables";
import { generateInterior, SHOWCASE_ID } from "../../src/interiors";
import { showcaseLabelAt } from "../../src/interiors/showcase";
import { World } from "../../src/world/world";

const world = new World("showcase-labels", "small");
const map = generateInterior(world, world.poiById(SHOWCASE_ID)!);
const showcase = map.showcase!;

/** The showcase names what stands on a cell: kind, number and name (the party reads it in the log when it steps on the cell). */
describe("the showcase labels", () => {
  it("names every monster, person, object and model on its cell", () => {
    for (const m of showcase.monsters) expect(showcaseLabelAt(showcase, m.x, m.y)).toBe(`Monster ${m.defId}: ${MONSTERS[m.defId]!.name}`);
    for (const p of showcase.personas) expect(showcaseLabelAt(showcase, p.x, p.y)).toBe(`Person ${p.persona}: ${PERSONAS[p.persona]!.file}`);
    for (const i of showcase.items) expect(showcaseLabelAt(showcase, i.x, i.y)).toBe(`Object ${i.item}: ${MAP_ITEMS[i.item]!.name}`);
    for (const e of showcase.extras) expect(showcaseLabelAt(showcase, e.x, e.y)).toBe(`Model: ${e.model}`);
  });

  it("says nothing on an empty cell", () => {
    expect(showcaseLabelAt(showcase, map.spawn.x, map.spawn.y)).toBeNull();
  });
});
