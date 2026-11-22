import { describe, expect, it } from "vitest";
import { validateContent } from "../../src/actions";
import { simulateCrystals, staticBlockers, type WallNode } from "../../src/actions/crystals";
import type { Facing } from "../../src/interiors/types";
import { QUESTS, type LayoutId } from "../../src/data/quest-table";
import { crystalFlag, crystalsIn, nextCrystalSeq, sceneOf, wallNodesOf } from "../../src/game/crystalPlay";
import { questInterior } from "../helpers/quests";

const nodesOf = (content: { actions: { uid: string; kind: string; x: number; y: number; params: Record<string, unknown> }[] }): WallNode[] =>
  content.actions.filter((a) => a.kind === "crystal").map((a) => ({ uid: a.uid, x: a.x, y: a.y, dir: a.params.facing as Facing, role: a.params.role as "source" | "target", color: Number(a.params.color) }));

describe("quest_8, the light of the crystals (quest document 1.10)", () => {
  const open = () => false;
  const source = (x: number, y: number, dir: Facing, color: number, uid = `s${x}${y}`): WallNode => ({ uid, x, y, dir, role: "source", color });
  const target = (x: number, y: number, dir: Facing, color: number): WallNode => ({ uid: `t${x}${y}`, x, y, dir, role: "target", color });

  it("a source lights the nearest crystal in its line, and a crystal passes the light on at right angles", () => {
    // a source at (0,0) shining east, crystals at (4,0) and (4,3), a target at (4,6) that looks north
    const nodes = [source(0, 0, "E", 1), target(4, 6, "N", 1)];
    const r = simulateCrystals(nodes, [{ x: 4, y: 0, seq: 1 }, { x: 4, y: 3, seq: 2 }], open);
    expect(r.solved).toBe(true);
    expect(r.links).toHaveLength(3);
  });

  it("something in the way, or a crystal that is not set, leaves the target dark", () => {
    const nodes = [source(0, 0, "E", 1), target(4, 6, "N", 1)];
    expect(simulateCrystals(nodes, [], open).solved).toBe(false);
    // the crystal at (4,0) already sees the target far down its column: one crystal is enough, unless something stands between
    expect(simulateCrystals(nodes, [{ x: 4, y: 0, seq: 1 }], open).solved).toBe(true);
    const blocked = (x: number, y: number) => x === 4 && y === 2;
    expect(simulateCrystals(nodes, [{ x: 4, y: 0, seq: 1 }], blocked).solved).toBe(false);
    expect(simulateCrystals(nodes, [{ x: 4, y: 0, seq: 1 }, { x: 4, y: 3, seq: 2 }], blocked).solved).toBe(false);
  });

  it("two lights at the same distance mix, a nearer light wins over a farther one", () => {
    // red from the west and blue from the east reach the crystal in the middle (distance 3 each): purple
    const nodes = [source(0, 5, "E", 1), source(6, 5, "W", 4), target(3, 0, "S", 5)];
    const mixed = simulateCrystals(nodes, [{ x: 3, y: 5, seq: 1 }], open);
    expect(mixed.crystals.get("3,5")).toBe(5);
    expect(mixed.targets.get("t30")).toBe(5);
    expect(mixed.solved).toBe(true);
    // a crystal set down nearer to the red source stands in the way of its light: the middle crystal now takes it from there (distance 2) and the blue one (3) is farther, so no mixing
    const nearer = simulateCrystals([source(0, 5, "E", 1), source(6, 5, "W", 4)], [{ x: 3, y: 5, seq: 1 }, { x: 1, y: 5, seq: 2 }], open);
    expect(nearer.crystals.get("1,5")).toBe(1);
    expect(nearer.crystals.get("3,5")).toBe(1);
  });

  it("two lines never cross: the shorter line stays, whatever the order the crystals were set down in", () => {
    // red along the row 3 from (0,3) to the crystal at (6,3) (6 long); blue from (3,0) south to a crystal (3,5) (5 long) would cross it at (3,3)
    const nodes = [source(0, 3, "E", 1), source(3, 0, "S", 4)];
    for (const [a, b] of [[1, 2], [2, 1]] as const) {
      const r = simulateCrystals(nodes, [{ x: 6, y: 3, seq: a }, { x: 3, y: 5, seq: b }], open);
      expect(r.crystals.get("3,5")).toBe(4);
      expect(r.crystals.get("6,3")).toBe(0);
    }
  });

  it("two lines of the same length that cross both stay away", () => {
    const nodes = [source(0, 3, "E", 1), source(3, 0, "S", 4)];
    for (const [a, b] of [[1, 2], [2, 1]] as const) {
      const r = simulateCrystals(nodes, [{ x: 6, y: 3, seq: a }, { x: 3, y: 6, seq: b }], open);
      expect(r.crystals.get("6,3")).toBe(0);
      expect(r.crystals.get("3,6")).toBe(0);
    }
  });

  it("a ring of crystals with no source in it stays dark", () => {
    const r = simulateCrystals([], [{ x: 0, y: 0, seq: 1 }, { x: 3, y: 0, seq: 2 }, { x: 3, y: 3, seq: 3 }, { x: 0, y: 3, seq: 4 }], open);
    expect([...r.crystals.values()].every((m) => m === 0)).toBe(true);
  });
});

describe("quest_8 in the places of the world", () => {
  const layouts = QUESTS.quest_8.layouts.filter((l) => l.startsWith("dungeon") || l.startsWith("cave")) as LayoutId[];
  for (const layout of layouts) {
    it(`${layout}: a puzzle of the level on every level, valid content, a solution that lights the targets`, { timeout: 240_000 }, () => {
      for (let i = 0; i < 10; i++) {
        const tier = 1 + (i % 5);
        const { map, content } = questInterior("quest_8", layout, tier, i);
        expect(validateContent(map, content), `${layout} tier ${tier} #${i}`).toEqual([]);
        const nodes = nodesOf(content);
        const targets = nodes.filter((n) => n.role === "target");
        const sources = nodes.filter((n) => n.role === "source");
        expect(targets.length, `${layout} tier ${tier} #${i}: targets`).toBe(tier >= 4 ? 2 : 1);
        expect(sources.length, `${layout} tier ${tier} #${i}: sources`).toBe(tier === 1 ? 1 : 3 - (tier === 2 ? 1 : 0));
        const first = content.actions.find((a) => a.kind === "crystal" && typeof a.params.solution === "string")!;
        const n = Number(first.params.crystals);
        const range = tier <= 2 ? [3, 4] : tier === 3 ? [4, 5] : [5, 6];
        expect(n, `${layout} tier ${tier} #${i}: crystals`).toBeGreaterThanOrEqual(range[0]!);
        expect(n).toBeLessThanOrEqual(range[1]!);
        const cells = String(first.params.solution).split(";").map((c, k) => ({ x: Number(c.split(",")[0]), y: Number(c.split(",")[1]), seq: k + 1 }));
        expect(simulateCrystals(nodes, cells, staticBlockers(map, content.actions)).solved).toBe(true);
        // whatever the order the party sets them down in
        expect(simulateCrystals(nodes, [...cells].reverse().map((c, k) => ({ ...c, seq: k + 1 })), staticBlockers(map, content.actions)).solved).toBe(true);
        // and the chests hold as many as it takes
        const held = content.actions.filter((a) => a.kind === "treasure" && typeof a.params.extra === "string").flatMap((a) => String(a.params.extra).split(",")).filter((t) => t === "quest_crystal_holder").length;
        expect(held).toBe(n);
      }
    });
  }
});

describe("quest_8, what the game keeps of the crystals", () => {
  it("writes a crystal set down into the save as a string and reads it back, in the order they were set down", () => {
    const opened = new Set<string>(["door:1", crystalFlag("p:1:0:5:0", 4, 7, 2), crystalFlag("p:1:0:5:0", 4, 9, 1), crystalFlag("p:2:0:6:0", 1, 1, 3)]);
    expect(crystalsIn(opened, "p:1:0:5:0")).toEqual([{ x: 4, y: 9, seq: 1 }, { x: 4, y: 7, seq: 2 }]);
    expect(crystalsIn(opened, "p:2:0:6:0")).toEqual([{ x: 1, y: 1, seq: 3 }]);
    expect(crystalsIn(opened, "p:9:0:9:0")).toEqual([]);
    // the next number is above every one of any place
    expect(nextCrystalSeq(opened)).toBe(4);
    expect(nextCrystalSeq(new Set())).toBe(1);
  });

  it("draws a target in a faint shade until it has its colour, and a crystal without light white", () => {
    const { content } = questInterior("quest_8", "dungeon_2", 1, 3);
    const nodes = wallNodesOf(content.actions);
    const first = content.actions.find((a) => a.kind === "crystal" && typeof a.params.solution === "string")!;
    const cells = String(first.params.solution).split(";").map((c, k) => ({ x: Number(c.split(",")[0]), y: Number(c.split(",")[1]), seq: k + 1 }));
    // nothing set down: no crystals, no lines, a target that waits in a lighter shade than the source's colour
    const bare = sceneOf(nodes, [], simulateCrystals(nodes, [], () => false));
    expect(bare.stands).toEqual([]);
    expect(bare.lines).toEqual([]);
    const targetIndex = nodes.findIndex((n) => n.role === "target");
    const sourceIndex = nodes.findIndex((n) => n.role === "source");
    expect(bare.walls[targetIndex]!.color).not.toBe(bare.walls[sourceIndex]!.color);
    // a crystal that the light does not reach stays white; with the whole solution set down (nothing in the way) they carry the colour and the target shines in its own
    const blocked = (x: number, y: number) => cells.length > 0 && x === cells[0]!.x - 1 && y === cells[0]!.y;
    const lone = sceneOf(nodes, [cells[cells.length - 1]!], simulateCrystals(nodes, [cells[cells.length - 1]!], blocked));
    expect(lone.stands.map((s) => s.color)).toEqual(["#ffffff"]);
    const lit = sceneOf(nodes, cells, simulateCrystals(nodes, cells, () => false));
    expect(lit.stands.every((s) => s.color !== "#ffffff")).toBe(true);
    expect(lit.lines.length).toBeGreaterThanOrEqual(cells.length);
    expect(lit.walls[targetIndex]!.color).toBe(lit.walls[sourceIndex]!.color);
  });
});
