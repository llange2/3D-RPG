import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { generateInterior, hasQuartermaster } from "../../src/interiors";
import { World } from "../../src/world/world";

/** 61st playtest, point 3: the one town of level 3 that has the quartermaster always holds him (Silvamere of a small world had no street for him). */
describe("playtest 61: the quartermaster is in his town", () => {
  const quartermasters = (world: World): { town: string; count: number }[] =>
    world
      .allPois()
      .filter((p) => p.kind === "town" && p.tier === 3)
      .map((poi) => ({ poi, content: buildMapContent(world, poi, generateInterior(world, poi)) }))
      .filter(({ poi }) => hasQuartermaster(world, poi))
      .map(({ poi, content }) => ({ town: poi.name, count: content.actions.filter((a) => a.kind === "quartermaster").length }));

  it("stands in Silvamere of pearl-wood-803 (small, default dungeons)", () => {
    const world = new World("pearl-wood-803", "small", "default");
    expect(quartermasters(world)).toEqual([{ town: "Silvamere", count: 1 }]);
  });

  it("stands once in the chosen town of level 3 of many worlds", () => {
    const seeds = ["pearl-wood-803", "birch-reach-493", "amber-gate-204", "north-ward-302", "pearl-keep-331", "ember-wood-189", "iron-vale-117", "cold-moor-260"];
    for (const size of ["small", "default"] as const) {
      for (const seed of seeds) {
        const found = quartermasters(new World(seed, size, "default"));
        expect(found.length, `${seed} ${size}`).toBe(1);
        expect(found[0]!.count, `${seed} ${size}`).toBe(1);
      }
    }
  });
});
