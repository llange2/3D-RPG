import { describe, expect, it } from "vitest";
import { cellsOfLine, glowAt, glowPixels, PULSE_LENGTH, ribbonAlong } from "../../src/render/glowLineGeometry";

/** The light lines over the floor (`render/glowLines.ts`): the parts that need no Babylon. */
describe("light line geometry", () => {
  it("makes a flat ribbon of the given width along a straight line", () => {
    const r = ribbonAlong([{ x: 0, z: 0 }, { x: 12, z: 0 }], 1.5, 0.06);
    expect(r.positions).toHaveLength(2 * 2 * 3);
    expect(r.indices).toHaveLength(6);
    for (let i = 1; i < r.positions.length; i += 3) expect(r.positions[i]).toBe(0.06);
    // the two edges are 1.5 apart, left and right of the line
    expect(Math.abs(r.positions[2]! - r.positions[5]!)).toBeCloseTo(1.5);
    // u counts pulses along the line, v goes across
    expect(r.uvs).toEqual([0, 1, 0, 0, 12 / PULSE_LENGTH, 1, 12 / PULSE_LENGTH, 0]);
  });

  it("mitres a right-angled bend without a gap or an overlap", () => {
    const r = ribbonAlong([{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: -6 }], 2, 0);
    // three points, two vertices each; the middle pair lies on the diagonal through the corner, one unit away on each axis
    expect(r.positions).toHaveLength(3 * 2 * 3);
    const a = [r.positions[6]!, r.positions[8]!];
    const b = [r.positions[9]!, r.positions[11]!];
    expect(Math.abs(a[0]! - 6)).toBeCloseTo(1);
    expect(Math.abs(a[1]!)).toBeCloseTo(1);
    expect(a[0]! + b[0]!).toBeCloseTo(12);
    expect(a[1]! + b[1]!).toBeCloseTo(0);
    expect(r.indices).toHaveLength(12);
    // every index points at a vertex
    for (const i of r.indices) expect(i).toBeLessThan(r.positions.length / 3);
  });

  it("gives nothing for a line without length and ignores repeated points", () => {
    expect(ribbonAlong([{ x: 1, z: 1 }], 1, 0).indices).toEqual([]);
    expect(ribbonAlong([{ x: 1, z: 1 }, { x: 1, z: 1 }], 1, 0).indices).toEqual([]);
    expect(ribbonAlong([{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 3, z: 0 }], 1, 0).indices).toHaveLength(6);
  });

  it("lists the cells a line passes over, the corners once", () => {
    expect(cellsOfLine([{ x: 2, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 3 }])).toEqual([
      { x: 2, y: 5 },
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 4 },
      { x: 4, y: 3 },
    ]);
    expect(() => cellsOfLine([{ x: 0, y: 0 }, { x: 2, y: 2 }])).toThrow();
  });
});

describe("light line picture", () => {
  it("is brightest in the middle of the line, fades to nothing at the edges and never goes dark along the line", () => {
    for (const u of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(glowAt(u, 0.5)).toBeGreaterThan(0.25);
      expect(glowAt(u, 0)).toBe(0);
      expect(glowAt(u, 1)).toBe(0);
      expect(glowAt(u, 0.5)).toBeGreaterThan(glowAt(u, 0.8));
      expect(glowAt(u, 0.8)).toBeGreaterThan(glowAt(u, 0.95));
    }
    // the pulse is the bright part
    expect(glowAt(0.5, 0.5)).toBeCloseTo(1);
    expect(glowAt(0.5, 0.5)).toBeGreaterThan(glowAt(0, 0.5) * 2);
  });

  it("joins up where the picture repeats, so that the scrolling pulses have no seam", () => {
    for (const a of [0.3, 0.5, 0.7]) expect(Math.abs(glowAt(0, a) - glowAt(1, a))).toBeLessThan(0.01);
  });

  it("holds the full colour in every pixel and the brightness in the alpha", () => {
    const px = glowPixels(8, 4, [10, 200, 30]);
    expect(px).toHaveLength(8 * 4 * 4);
    for (let i = 0; i < px.length; i += 4) expect([px[i], px[i + 1], px[i + 2]]).toEqual([10, 200, 30]);
    // the rows next to the middle are brighter than the outermost
    expect(px[(1 * 8 + 4) * 4 + 3]!).toBeGreaterThan(px[(0 * 8 + 4) * 4 + 3]!);
  });
});
