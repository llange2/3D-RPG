import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { simulateCrystals, staticBlockers, type CrystalResult, type PlacedCrystal, type WallNode } from "../../src/actions/crystals";
import { QUESTS, type LayoutId } from "../../src/data/quest-table";
import { wallNodesOf } from "../../src/game/crystalPlay";
import { generateInterior } from "../../src/interiors";
import { World } from "../../src/world/world";
import { questInterior } from "../helpers/quests";

/** bug_fix_80: the light of quest_8 depends on where the crystals stand, never on the order they were set down in (the Cave of Zula showed blue or purple by the order). */

const permutations = <T,>(items: readonly T[]): T[][] => {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
};
const withSeq = (cells: readonly { x: number; y: number }[]): PlacedCrystal[] => cells.map((c, i) => ({ x: c.x, y: c.y, seq: i + 1 }));
/** The result as text, to compare two of them (the lines in the same order, the colours of crystals and targets). */
const shape = (r: CrystalResult): string =>
  JSON.stringify({
    links: r.links.map((l) => `${l.from.x},${l.from.y}>${l.to.x},${l.to.y}:${l.color}`).sort(),
    crystals: [...r.crystals.entries()].sort(),
    targets: [...r.targets.entries()].sort(),
    solved: r.solved,
  });

describe("quest_8, the light does not depend on the order", () => {
  it("the Cave of Zula (moss-mere-318): the row 18/17/16 gives the same light in all six orders", () => {
    const world = new World("moss-mere-318", "small", "default");
    const poi = world.allPois().find((p) => p.name === "Cave of Zula")!;
    const map = generateInterior(world, poi, 0);
    const content = buildMapContent(world, poi, map);
    const nodes = wallNodesOf(content.actions);
    const stops = staticBlockers(map, content.actions);
    const row = [{ x: 18, y: 19 }, { x: 17, y: 19 }, { x: 16, y: 19 }];
    const shapes = new Set(permutations(row).map((order) => shape(simulateCrystals(nodes, withSeq(order), stops))));
    expect(shapes.size).toBe(1);
  });

  it("a row between two lit crystals: the nearer light wins, the same in both orders", () => {
    // blue (4) lights (18,19) from above at distance 1, red (1) lights (16,19) from above at distance 3: the middle crystal (17,19) sees both at distance 1
    const nodes: WallNode[] = [
      { uid: "b", x: 18, y: 18, dir: "S", role: "source", color: 4 },
      { uid: "r", x: 16, y: 16, dir: "S", role: "source", color: 1 },
    ];
    const open = () => false;
    for (const order of permutations([{ x: 18, y: 19 }, { x: 17, y: 19 }, { x: 16, y: 19 }])) {
      const r = simulateCrystals(nodes, withSeq(order), open);
      expect(r.crystals.get("18,19")).toBe(4);
      expect(r.crystals.get("17,19")).toBe(4);
      expect(r.crystals.get("16,19")).toBe(4);
    }
    // the red crystal alone shines red; with the blue one at distance 2 in its row it takes that (nearer than the red source at 3), in both orders
    expect(simulateCrystals(nodes, withSeq([{ x: 16, y: 19 }]), open).crystals.get("16,19")).toBe(1);
    expect(simulateCrystals(nodes, withSeq([{ x: 16, y: 19 }, { x: 18, y: 19 }]), open).crystals.get("16,19")).toBe(4);
    expect(simulateCrystals(nodes, withSeq([{ x: 18, y: 19 }, { x: 16, y: 19 }]), open).crystals.get("16,19")).toBe(4);
  });

  it("a crystal that is lit by two feeders of the same way mixes them, in any order", () => {
    const nodes: WallNode[] = [
      { uid: "b", x: 18, y: 18, dir: "S", role: "source", color: 4 },
      { uid: "r", x: 16, y: 18, dir: "S", role: "source", color: 1 },
    ];
    for (const order of permutations([{ x: 18, y: 19 }, { x: 17, y: 19 }, { x: 16, y: 19 }])) {
      const r = simulateCrystals(nodes, withSeq(order), () => false);
      expect(r.crystals.get("17,19")).toBe(5);
    }
  });

  it("two lines that cross: the shorter stays, the same length both go, the order does not matter", () => {
    const nodes: WallNode[] = [
      { uid: "r", x: 0, y: 3, dir: "E", role: "source", color: 1 },
      { uid: "b", x: 3, y: 0, dir: "S", role: "source", color: 4 },
    ];
    const open = () => false;
    for (const order of permutations([{ x: 6, y: 3 }, { x: 3, y: 5 }])) {
      const r = simulateCrystals(nodes, withSeq(order), open);
      expect(r.crystals.get("3,5")).toBe(4);
      expect(r.crystals.get("6,3")).toBe(0);
    }
    for (const order of permutations([{ x: 6, y: 3 }, { x: 3, y: 6 }])) {
      const r = simulateCrystals(nodes, withSeq(order), open);
      expect(r.crystals.get("3,6")).toBe(0);
      expect(r.crystals.get("6,3")).toBe(0);
    }
  });

  const layouts = QUESTS.quest_8.layouts.filter((l) => l.startsWith("dungeon") || l.startsWith("cave")) as LayoutId[];
  for (const layout of layouts) {
    it(`${layout}: the solution lights the targets in every order, and the whole light is the same`, { timeout: 240_000 }, () => {
      for (let i = 0; i < 10; i++) {
        const tier = 1 + (i % 5);
        const { map, content } = questInterior("quest_8", layout, tier, i);
        const nodes = wallNodesOf(content.actions);
        const first = content.actions.find((a) => a.kind === "crystal" && typeof a.params.solution === "string")!;
        const cells = String(first.params.solution).split(";").map((c) => ({ x: Number(c.split(",")[0]), y: Number(c.split(",")[1]) }));
        const stops = staticBlockers(map, content.actions);
        const shapes = new Set<string>();
        for (const order of permutations(cells)) {
          const r = simulateCrystals(nodes, withSeq(order), stops);
          expect(r.solved, `${layout} tier ${tier} #${i}: ${order.map((c) => `${c.x},${c.y}`).join(" ")}`).toBe(true);
          shapes.add(shape(r));
        }
        expect(shapes.size, `${layout} tier ${tier} #${i}`).toBe(1);
      }
    });
  }
});
