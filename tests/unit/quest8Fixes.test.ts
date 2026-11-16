import { describe, expect, it } from "vitest";
import { simulateCrystals, type WallNode } from "../../src/actions/crystals";
import { CRYSTAL_HOLDER } from "../../src/data/quest-table";
import { sceneOf } from "../../src/game/crystalPlay";
import { describeInteriorCell } from "../../src/game/minimap";
import { CAVE_HOLDER_OUT, CRYSTAL_MID, CRYSTAL_SCALE, CRYSTAL_WIDTH, FLOOR_HOLDER_SCALE, GLOW_DARK, GLOW_LIT, GLOW_WAITING, MOUTH_WIDTH, STAND_LIFT, WALL_CRYSTAL_ALONG, WALL_CRYSTAL_SCALE, WALL_CRYSTAL_TIP, WALL_HOLDER_MID } from "../../src/render/crystalLook";
import { haloAt, haloPixels } from "../../src/render/glowLineGeometry";
import { questItem } from "../../src/sim/items";
import { CELL, type InteriorMap } from "../../src/interiors/types";
import { wallHolderDistance } from "../../src/render/interiorProps";

describe("quest_8, the 16th of November 2026: sizes, glow, name and map of the crystals", () => {
  it("the crystal is named \"Crystal\"", () => {
    expect(questItem(CRYSTAL_HOLDER)?.name).toBe("Crystal");
  });

  it("the crystal in the wall holder is exactly as wide as the round mouth, and lies in it with its tip out", () => {
    expect(CRYSTAL_WIDTH * WALL_CRYSTAL_SCALE).toBeCloseTo(MOUTH_WIDTH * CRYSTAL_SCALE, 6);
    // the tip reaches beyond the lips of the mouth, and the crystal's middle is in front of the holder's own middle
    expect(WALL_CRYSTAL_TIP).toBeGreaterThan(WALL_CRYSTAL_ALONG);
    expect(WALL_CRYSTAL_ALONG).toBeGreaterThan(0);
  });

  it("the floor holder is smaller than the wall holder: its hole is as wide as the crystal it carries", () => {
    expect(FLOOR_HOLDER_SCALE).toBeLessThan(CRYSTAL_SCALE);
    // the hollow measures 0.60 in radius where the crystal comes to rest (model units); scaled, it is the crystal's radius (0.5 * 0.60 = 0.30 against 0.9 * 0.3425)
    expect(0.6 * FLOOR_HOLDER_SCALE).toBeCloseTo((CRYSTAL_WIDTH / 2) * CRYSTAL_SCALE, 1);
  });

  it("the middle of the floor crystal, of the line of light and of the wall holder's mouth are one height", () => {
    expect(CRYSTAL_MID).toBeCloseTo(STAND_LIFT + (1.9 * CRYSTAL_SCALE) / 2, 6);
    // the holder's mouth lies 0.175 (model units) below its middle
    expect(WALL_HOLDER_MID - 0.175 * CRYSTAL_SCALE).toBeCloseTo(CRYSTAL_MID, 6);
  });

  it("a wall holder stands out of the rock of a cave by CAVE_HOLDER_OUT, and its crystal's tip reaches into the room", () => {
    const flat = wallHolderDistance({});
    const cave = wallHolderDistance({}, CAVE_HOLDER_OUT);
    expect(flat - cave).toBeCloseTo(CAVE_HOLDER_OUT, 6);
    // the holder's own middle lies inside the cell, and the tip in front of the wall's face
    expect(WALL_CRYSTAL_TIP - flat).toBeGreaterThan(-1.5);
  });

  it("a crystal that carries light glows fully, a waiting target and a dark crystal only a little", () => {
    const nodes: WallNode[] = [
      { uid: "s", x: 0, y: 0, dir: "E", role: "source", color: 1 },
      { uid: "t", x: 4, y: 3, dir: "N", role: "target", color: 4 },
    ];
    const placed = [{ x: 4, y: 0, seq: 1 }, { x: 8, y: 8, seq: 2 }];
    const result = simulateCrystals(nodes, placed, () => false);
    const scene = sceneOf(nodes, placed, result);
    expect(scene.walls.find((w) => w.x === 0)?.glow).toBe(GLOW_LIT);
    expect(scene.walls.find((w) => w.x === 4)?.glow).toBe(GLOW_WAITING);
    expect(scene.stands.find((s) => s.x === 4)?.glow).toBe(GLOW_LIT);
    expect(scene.stands.find((s) => s.x === 8)?.glow).toBe(GLOW_DARK);
    expect(GLOW_LIT).toBeGreaterThan(GLOW_WAITING);
    expect(GLOW_WAITING).toBeGreaterThan(GLOW_DARK);
  });

  it("a halo is a bright core with a soft glow that is zero at the edge of its square", () => {
    expect(haloAt(0)).toBeCloseTo(1, 6);
    expect(haloAt(0.5)).toBeGreaterThan(0);
    expect(haloAt(0.5)).toBeLessThan(haloAt(0.2));
    expect(haloAt(1)).toBeCloseTo(0, 6);
    const pixels = haloPixels(16, [255, 0, 0]);
    expect(pixels).toHaveLength(16 * 16 * 4);
    expect(pixels[0]).toBe(255);
    expect(pixels[3]).toBe(0); // the corner is dark
    expect(pixels[(8 * 16 + 8) * 4 + 3]).toBeGreaterThan(200); // the middle is bright
  });

  it("the beginning and the end of a light path are told apart on the map", () => {
    const map = { width: 3, height: 3, cells: new Array(9).fill(CELL.FLOOR), exit: { x: 0, y: 0 }, key: "m" } as unknown as InteriorMap;
    const content = {
      actions: [
        { uid: "a", kind: "crystal", x: 1, y: 1, params: { role: "source" } },
        { uid: "b", kind: "crystal", x: 2, y: 2, params: { role: "target" } },
      ],
    } as never;
    const explored = { has: () => true } as never;
    expect(describeInteriorCell(map, content, explored, new Set(), 1, 1, [])).toMatch(/beginning of a light path/);
    expect(describeInteriorCell(map, content, explored, new Set(), 2, 2, [])).toMatch(/end of a light path/);
  });
});
