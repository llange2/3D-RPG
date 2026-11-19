import { describe, expect, it } from "vitest";
import { CEILING_RADIUS_MAX, CEILING_RADIUS_MIN, CELL_SIZE, ceilingWindow } from "../../src/render/interiorMesher";

// bug_fix_73: the window of 3D ceiling pieces reaches as far as the fog lets them be seen (a piece popped in at the fixed radius 6 with one step)
describe("bug_fix_73: ceiling window follows the fog", () => {
  const visibleAt = (cells: number, density: number): number => Math.exp(-((cells * CELL_SIZE * density) ** 2));

  it("leaves at most 5 % of a piece at the edge, at the farthest view distance", () => {
    for (const density of [0.065, 0.0525, 0.075, 0.085]) {
      const r = ceilingWindow(density, 1);
      expect(r).toBeGreaterThanOrEqual(CEILING_RADIUS_MIN);
      expect(r).toBeLessThanOrEqual(CEILING_RADIUS_MAX);
      // the clamp at the minimum only ever widens it
      if (r < CEILING_RADIUS_MAX) expect(visibleAt(r, density)).toBeLessThanOrEqual(0.05);
    }
  });

  it("is wider with the Light spell (thinner fog) than without, but never above the maximum", () => {
    expect(ceilingWindow(0.075 * 0.7, 1)).toBeGreaterThan(ceilingWindow(0.075, 1));
    expect(ceilingWindow(0.075, 1)).toBe(8);
    expect(ceilingWindow(0.075 * 0.7, 1)).toBe(11);
    expect(ceilingWindow(0.001, 1)).toBe(CEILING_RADIUS_MAX);
    expect(ceilingWindow(0, 1)).toBe(CEILING_RADIUS_MAX);
  });

  it("scales with the view distance and keeps at least two cells", () => {
    expect(ceilingWindow(0.075, 0.7)).toBeLessThan(ceilingWindow(0.075, 1));
    expect(ceilingWindow(0.075, 0.4)).toBeLessThan(ceilingWindow(0.075, 0.7));
    expect(ceilingWindow(0.5, 0.4)).toBe(2);
  });
});
