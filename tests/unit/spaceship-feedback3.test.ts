import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { BROKEN_CRYSTAL_ITEM, CRATE_ITEM, ENGINE_CRYSTAL_FLAG, LIFE_FLAG, POWER_CRYSTAL_ITEM } from "../../src/data/quest-table";
import { MONSTERS, monsterGroup } from "../../src/data/tables";
import { describeInteriorCell } from "../../src/game/minimap";
import { generateInterior, planDungeon } from "../../src/interiors";
import { gridAt, unroundedAt } from "../../src/interiors/roundCorners";
import { sectionAt } from "../../src/interiors/spaceship";
import { OWN_MODELS } from "../../src/render/interiorProps";
import { World } from "../../src/world/world";
import { Explored } from "../../src/game/state";

const shipOf = (seed: string) => {
  const world = new World(seed, "default");
  const poi = world.allPois().find((p) => planDungeon(world, p)?.klass === "C")!;
  const map = generateInterior(world, poi);
  return { world, map, content: buildMapContent(world, poi, map) };
};

describe("spaceship feedback of 6. 11. 2026", () => {
  it("lets every robot of the game turn up in the four sections after the bridge, the terminator ranged like the others", { timeout: 120_000 }, () => {
    const robots = Object.keys(MONSTERS).map(Number).filter((id) => monsterGroup(id) === "robot");
    expect(robots.length).toBeGreaterThanOrEqual(4);
    for (const seed of ["ship-a", "ship-b", "jade-shore-568"]) {
      const { content, map } = shipOf(seed);
      const layout = map.spaceship!;
      const seen = new Set(content.spawns.filter((s) => sectionAt(layout, s.x, s.y) !== 0).flatMap((s) => s.monsterIds));
      for (const id of robots.filter((r) => r !== 69)) expect(seen.has(id), `${seed}: ${MONSTERS[id]!.name}`).toBe(true);
    }
    expect(MONSTERS[69]!.ranged).toBe(true);
  });

  it("smooths the steps out of the walls: the corner at 60/12 of jade-shore-568 is round now", { timeout: 60_000 }, () => {
    const { map } = shipOf("jade-shore-568");
    const at = gridAt(map.cells, map.width, map.height);
    expect(unroundedAt(at, 60, 12)).toBe(false);
    expect(unroundedAt(at, 87, 14)).toBe(false);
  });

  it("makes the crates a fifth bigger and shows the power crystals as events on the map", { timeout: 60_000 }, () => {
    expect(OWN_MODELS[CRATE_ITEM]!.scale).toBeCloseTo(1.6 * 1.2, 5);
    const { map, content } = shipOf("ship-a");
    const broken = content.actions.find((a) => a.params.item === BROKEN_CRYSTAL_ITEM && a.params.reactor === "engine")!;
    const intact = content.actions.find((a) => a.params.item === POWER_CRYSTAL_ITEM)!;
    const explored = new Explored();
    const eye = true;
    const label = (a: { x: number; y: number }, opened: Set<string>) => describeInteriorCell(map, content, explored, opened, a.x, a.y, [], new Set(), false, eye);
    expect(label(broken, new Set())).toBe("Power Crystal (broken)");
    expect(label(broken, new Set([ENGINE_CRYSTAL_FLAG]))).toBe("Power Crystal");
    expect(label(intact, new Set([LIFE_FLAG]))).toBe("Power Crystal");
  });
});
