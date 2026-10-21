import { describe, expect, it } from "vitest";
import { cellAt, centreOn, clampCells, fitMap, panBy, zoomStep, zoomTo, type MapViewport } from "../../src/game/mapView";

const LIMITS = { min: 11, max: 121 };
const view = (x: number, y: number, cells: number): MapViewport => ({ x, y, cells });

describe("the zoomable map (eleventh playtest, point 14)", () => {
  it("always shows an odd number of cells inside the limits", () => {
    expect(clampCells(64, LIMITS)).toBe(65);
    expect(clampCells(3, LIMITS)).toBe(11);
    expect(clampCells(1000, LIMITS)).toBe(121);
    expect(clampCells(200, { min: 11, max: 120 })).toBe(119); // an even maximum rounds down
  });

  it("turns a point of the picture into the cell under it", () => {
    const v = view(50, 40, 21);
    expect(cellAt(v, 0.5, 0.5)).toEqual({ x: 50, y: 40 }); // the middle is the middle cell
    expect(cellAt(v, 0, 0)).toEqual({ x: 40, y: 30 });
    expect(cellAt(v, 0.999, 0.999)).toEqual({ x: 60, y: 50 });
  });

  it("keeps the cell under the pointer in place while zooming", () => {
    const v = view(50, 40, 63);
    for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.8], [0.9, 0.1], [0.05, 0.05]] as const) {
      const before = cellAt(v, fx, fy);
      for (const cells of [41, 21, 11, 101]) {
        const z = zoomTo(v, cells, LIMITS, fx, fy);
        expect(z.cells).toBe(cells);
        const after = cellAt(z, fx, fy);
        // the cell is the same one, give or take the rounding of the middle to a whole cell
        expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("steps the wheel in a quarter and never gets stuck on a small map", () => {
    let v = view(10, 10, 63);
    v = zoomStep(v, 1, LIMITS);
    expect(v.cells).toBe(51);
    v = zoomStep(v, -1, LIMITS);
    expect(v.cells).toBeGreaterThan(51);
    // a step always changes the number of cells until the limit is reached
    let z = view(10, 10, 13);
    for (let i = 0; i < 10; i++) z = zoomStep(z, 1, LIMITS);
    expect(z.cells).toBe(11);
    expect(zoomStep(z, 1, LIMITS)).toEqual(z);
    let w = view(10, 10, 111);
    for (let i = 0; i < 10; i++) w = zoomStep(w, -1, LIMITS);
    expect(w.cells).toBe(121);
  });

  it("moves by whole cells and stays on a map with an edge", () => {
    const v = view(5, 5, 31);
    expect(panBy(v, 3, -2)).toEqual({ x: 8, y: 3, cells: 31 });
    expect(panBy(v, -20, 200, { width: 106, height: 120 })).toEqual({ x: 0, y: 119, cells: 31 });
    expect(panBy(v, -20, 0)).toEqual({ x: -15, y: 5, cells: 31 }); // the endless world has no edge
    expect(centreOn(v, 70, 41)).toEqual({ x: 70, y: 41, cells: 31 });
  });

  it("fits a whole map into the picture", () => {
    expect(fitMap(106, 120, { min: 11, max: 255 })).toEqual({ x: 53, y: 60, cells: 123 });
    expect(fitMap(20, 20, { min: 11, max: 255 }).cells).toBe(23);
    expect(fitMap(400, 10, { min: 11, max: 255 }).cells).toBe(255); // never more than the limit
  });
});
