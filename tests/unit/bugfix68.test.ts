import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { BRIDGE } from "../../src/data/quest-table";
import { generateInterior, planDungeon } from "../../src/interiors";
import { meshInterior } from "../../src/render/interiorMesher";
import { World } from "../../src/world/world";

/** The spaceship of a world (the same for all five pyramids): its map and its objects. */
function shipOf(seed: string) {
  const world = new World(seed, "default", "default");
  const poi = world.allPois().find((p) => planDungeon(world, p)?.klass === "C")!;
  const map = generateInterior(world, poi);
  return { world, poi, map, content: buildMapContent(world, poi, map) };
}

describe("bug_fix_68, point 2: every airlock of the spaceship has both its levers", () => {
  // pearl-shore-794: the second niche of the lock between the control room and life support lay in a room, the lever was refused and life support had one lever only
  const seeds = ["pearl-shore-794", ...Array.from({ length: 24 }, (_, i) => `lever-${i}`), "lever-33", "lever-57", "lever-72", "lever-74"];

  it("holds for the seed of the report and for others that had a lever missing before", () => {
    for (const seed of seeds) {
      const { content } = shipOf(seed);
      const locks = content.actions.filter((a) => a.kind === "door" && a.params.airlock === true);
      expect(locks).toHaveLength(4);
      for (const lock of locks) {
        const levers = content.actions.filter((a) => a.kind === "lever" && a.params.airlock === lock.uid);
        expect(levers, `${seed} ${lock.uid}`).toHaveLength(2);
      }
    }
  });

  it("puts each lever in a niche beside the corridor, never in the middle of a room (at most two open sides)", () => {
    const { map } = shipOf("pearl-shore-794");
    const layout = map.spaceship!;
    const floor = (x: number, y: number) => map.cells[y * map.width + x] !== 0;
    // (the bridge's airlock has its lever at the end of the corridor, in the cell of the quest document 1.9: no niche)
    for (const lock of layout.locks.filter((l) => l.from !== BRIDGE)) {
      for (const side of [lock.a, lock.b]) {
        const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => floor(side.x + dx!, side.y + dy!)).length;
        expect(open, `niche at ${side.x},${side.y}`).toBeGreaterThanOrEqual(1);
        expect(open, `niche at ${side.x},${side.y}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("leaves no content problem about levers", () => {
    const { map, content } = shipOf("pearl-shore-794");
    expect(validateContent(map, content).filter((i) => i.includes("lever"))).toEqual([]);
  });
});

describe("bug_fix_68, point 3: the spaceship has no door out, the tube is the way", () => {
  it("draws no door texture on any wall of the ship (the wall behind the tube is the plain wall)", () => {
    const { map } = shipOf("pearl-shore-794");
    expect(meshInterior(map).groups.filter((g) => g.material === "door")).toHaveLength(0);
  });

  it("still draws the door of a dungeon's way out", () => {
    const world = new World("pearl-shore-794", "default", "default");
    const poi = world.allPois().find((p) => p.kind === "dungeon" && planDungeon(world, p)?.klass !== "C")!;
    expect(meshInterior(generateInterior(world, poi)).groups.some((g) => g.material === "door")).toBe(true);
  });
});
