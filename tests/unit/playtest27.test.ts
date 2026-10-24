import { describe, expect, it } from "vitest";
import { MONSTERS } from "../../src/data/tables";
import { createEncounter, createMonster, nearestInCone, type GridView } from "../../src/sim/encounter";
import { describeOverworldTile, OVERWORLD_LEGEND } from "../../src/game/minimap";
import { Explored } from "../../src/game/state";
import { caravansOf } from "../../src/world/caravans";
import { overworldMascotSpots } from "../../src/world/mascots";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const land = Object.values(MONSTERS).find((m) => m.terrain === "land")!;

function gridOf(rows: string[]): GridView {
  const at = (x: number, y: number) => rows[y]?.[x] ?? "#";
  return { walkable: (x, y) => at(x, y) === ".", water: () => false, opaque: (x, y) => at(x, y) === "#" };
}

const open = gridOf(Array.from({ length: 15 }, () => ".".repeat(15)));

describe("mascots and caravans (27th playtest, point 2)", () => {
  it("keeps the wolf off the caravan of pearl-reach-537 (small), 68/15", () => {
    const world = new World("pearl-reach-537", "small");
    const wolf = overworldMascotSpots(world).find((s) => s.mascot === "Wolf")!;
    expect(wolf).toBeDefined();
    expect([wolf.x, wolf.y]).not.toEqual([68, 15]);
  });

  it("never puts a mascot on a caravan or next to one", () => {
    for (const [seed, size] of [["pearl-reach-537", "small"], ["alpha", "small"], ["beta", "default"], ["p27-a", "default"], ["p27-b", "small"], ["p27-c", "large"]] as [string, WorldSize][]) {
      const world = new World(seed, size);
      const wagons = world.allPois().flatMap((p) => caravansOf(world, p));
      for (const s of overworldMascotSpots(world)) {
        for (const c of wagons) {
          const gap = Math.max(Math.abs(world.wrapX(c.x) - world.wrapX(s.x)), Math.abs(world.wrapY(c.y) - world.wrapY(s.y)));
          expect(gap, `${s.mascot} at ${s.x}/${s.y} and a caravan at ${c.x}/${c.y} (${seed})`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
});

describe("the map marks the events of the open land (27th playtest, point 3)", () => {
  it("names an event on a seen tile and keeps unseen ones to itself", () => {
    const world = new World("pearl-reach-537", "small");
    const explored = new Explored({ w: world.width, h: world.height });
    const events = [{ x: 70, y: 20, label: "Monster Hut" }];
    expect(describeOverworldTile(world, explored, 70, 20, [], events)).toBeNull();
    explored.markOverworld(70, 20);
    expect(describeOverworldTile(world, explored, 70, 20, [], events)).toBe("Monster Hut");
    expect(describeOverworldTile(world, explored, 70, 20, [])).not.toBe("Monster Hut");
  });

  it("explains the question mark in the legend", () => {
    expect(OVERWORLD_LEGEND.some((e) => e.icon && "place" in e.icon && e.icon.place === "event")).toBe(true);
  });
});

describe("the party aims diagonally (27th playtest, point 4)", () => {
  const aim = (monsters: [number, number][], grid = open, facing: [number, number] = [1, 0]) => {
    const enc = createEncounter();
    monsters.forEach(([x, y], i) => enc.monsters.push(createMonster(`m${i}`, land.id, x, y)));
    return nearestInCone(grid, enc, 5, 5, facing[0], facing[1])?.uid ?? null;
  };

  it("takes a monster up to 45 degrees off the facing, the limit included", () => {
    expect(aim([[8, 7]])).toBe("m0");
    expect(aim([[8, 8]])).toBe("m0");
    expect(aim([[8, 2]])).toBe("m0");
    expect(aim([[8, 9]])).toBeNull();
    expect(aim([[7, 10]])).toBeNull();
  });

  it("ignores monsters beside, behind and beyond the radius", () => {
    expect(aim([[5, 8]])).toBeNull();
    expect(aim([[2, 5]])).toBeNull();
    expect(aim([[2, 8]])).toBeNull();
    expect(aim([[14, 5]])).toBeNull();
  });

  it("takes the nearest of several", () => {
    expect(aim([[11, 5], [8, 8], [7, 6]])).toBe("m2");
  });

  it("turns with the facing", () => {
    expect(aim([[8, 8]], open, [0, 1])).toBe("m0");
    expect(aim([[8, 8]], open, [0, -1])).toBeNull();
    expect(aim([[2, 2]], open, [-1, 0])).toBe("m0");
  });

  it("needs a clear line: a wall hides the monster, and a monster in front hides the one behind it", () => {
    const rows = Array.from({ length: 15 }, () => ".".repeat(15).split(""));
    rows[6]![6] = "#";
    rows[7]![6] = "#";
    const walled = gridOf(rows.map((r) => r.join("")));
    expect(aim([[8, 7]], walled)).toBeNull();
    expect(aim([[7, 6], [9, 8]])).toBe("m0");
    expect(aim([[7, 7], [9, 9]])).toBe("m0");
  });
});
