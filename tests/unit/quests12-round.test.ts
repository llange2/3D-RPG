import { describe, expect, it } from "vitest";
import { generateInterior, planDungeon } from "../../src/interiors";
import { coveredFaces, cornerYaw, roundCorners } from "../../src/interiors/roundCorners";
import { CELL, type InteriorMap } from "../../src/interiors/types";
import { meshInterior } from "../../src/render/interiorMesher";
import { World } from "../../src/world/world";

/** A cyber map from rows: `#` wall, `.` floor. */
function sketch(rows: string[]): InteriorMap {
  const world = new World("round-sketch", "default");
  const pyramid = world.allPois().find((p) => planDungeon(world, p)?.klass === "C")!;
  const base = generateInterior(world, pyramid);
  const cells = new Uint8Array(rows[0]!.length * rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => (cells[y * row.length + x] = ch === "." ? CELL.FLOOR : CELL.SOLID)));
  return { ...base, width: rows[0]!.length, height: rows.length, cells, lots: [], spaceship: undefined };
}

describe("the rounded corners of the spaceship", () => {
  it("round the bend of a corridor from inside and from outside, and a corner of a room", () => {
    const map = sketch([
      "#######",
      "#.....#",
      "#.###.#",
      "#.#.#.#",
      "#.#####",
      "#######",
    ]);
    const corners = roundCorners(map);
    const at = (x: number, y: number) => corners.find((c) => c.x === x && c.y === y);
    // the corners of the ring: filled in on the floor cells
    expect(at(1, 1)).toMatchObject({ kind: "inner", corner: "NW" });
    expect(at(5, 1)).toMatchObject({ kind: "inner", corner: "NE" });
    // the block in the middle has its corners cut off, seen from the floor round it
    expect(at(2, 2)).toMatchObject({ kind: "outer", corner: "NW" });
    expect(at(4, 2)).toMatchObject({ kind: "outer", corner: "NE" });
    // an inner corner covers the two wall faces of its own cell, an outer one the faces of the cells beside it that look at it
    const covered = coveredFaces(corners);
    expect(covered.has("1,1,N")).toBe(true);
    expect(covered.has("1,1,W")).toBe(true);
    expect(covered.has("2,1,S")).toBe(true);
    expect(covered.has("1,2,E")).toBe(true);
    // the arc of both models lies in the south-west corner at yaw 0; a clockwise quarter turn moves it one corner on (30th playtest, point 7)
    expect(cornerYaw("SW")).toBe(0);
    expect(cornerYaw("NW")).toBe(90);
    expect(cornerYaw("NE")).toBe(180);
    expect(cornerYaw("SE")).toBe(270);
    expect(corners.map((c) => c.yaw)).toEqual(corners.map((c) => cornerYaw(c.corner)));
  });

  it("keep the walls square where they do not run on straight, and in maps that are not cyber", () => {
    const map = sketch(["####", "#..#", "####"]);
    // a dead end of two cells has no corner with floor on both sides
    expect(roundCorners(map)).toEqual([]);
    const dungeon = { ...map, theme: { ...map.theme, id: "dungeon_stone" } };
    expect(roundCorners(dungeon)).toEqual([]);
  });

  it("take the wall faces the models cover out of the mesh, and fill the floor under a cut-off corner", () => {
    const map = sketch([
      "#######",
      "#.....#",
      "#.###.#",
      "#.#.#.#",
      "#.#####",
      "#######",
    ]);
    const corners = roundCorners(map);
    expect(corners.length).toBeGreaterThan(0);
    const square = meshInterior(map);
    const round = meshInterior(map, new Set(), { roundWalls: true });
    // fewer wall triangles, and more floor under the outer corners
    const count = (g: ReturnType<typeof meshInterior>, material: string) => g.groups.filter((x) => x.material === material).reduce((n, x) => n + x.count, 0);
    expect(count(round, "wall")).toBeLessThan(count(square, "wall"));
    expect(count(round, "floor")).toBe(count(square, "floor") + 6 * corners.filter((c) => c.kind === "outer").length);
  });

  it("find corners in the real spaceship, every one of them with the walls it needs", { timeout: 60_000 }, () => {
    const world = new World("round-ship", "default");
    const pyramid = world.allPois().find((p) => planDungeon(world, p)?.klass === "C")!;
    const map = generateInterior(world, pyramid);
    const corners = roundCorners(map);
    expect(corners.filter((c) => c.kind === "inner").length).toBeGreaterThan(10);
    expect(corners.filter((c) => c.kind === "outer").length).toBeGreaterThan(10);
    for (const c of corners) expect(map.cells[c.y * map.width + c.x], `${c.kind} ${c.x},${c.y}`).toBe(c.kind === "inner" ? CELL.FLOOR : CELL.SOLID);
  });
});
