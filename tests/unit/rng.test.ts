import { describe, expect, it } from "vitest";
import { derive, LAYER, Rng, rngFor, seedFromString } from "../../src/core/rng";

// The pinned numbers are regression pins produced by this implementation (cyrb128 + sfc32 + murmur-based derive).
// They catch accidental changes of generator output. If one fails on purpose, bump GEN_VERSION.
describe("rng determinism pins", () => {
  it("hashes a seed string to four words", () => {
    expect(seedFromString("alpha")).toEqual([1413577559, 3914871638, 3984592178, 1310549967]);
    expect(seedFromString("")).toEqual([41608494, 3485963809, 1435736333, 1262568316]);
  });

  it("produces a fixed sequence for a fixed seed", () => {
    const r = new Rng(seedFromString("alpha"));
    expect([r.nextU32(), r.nextU32(), r.nextU32(), r.nextU32(), r.nextU32()]).toEqual([
      3177561853, 1310840500, 1120686013, 60762570, 2903251602,
    ]);
  });

  it("derives fixed child seeds, including negative coordinates and string parts", () => {
    const s = seedFromString("alpha");
    expect(derive(s, LAYER.TERRAIN, 3, -4)).toEqual([2847368501, 3898713727, 3335150666, 3995387901]);
    expect(derive(s, LAYER.ACTION, "chest_deadend", 2)).toEqual([738448740, 31194240, 922154683, 2356761036]);
    const g = rngFor(s, LAYER.TERRAIN, 3, -4);
    expect([g.nextU32(), g.nextU32(), g.nextU32()]).toEqual([4223790760, 2024829355, 2817919111]);
  });
});

describe("derive", () => {
  const s = seedFromString("world");

  it("is a pure function of its arguments", () => {
    const first = derive(s, LAYER.POI, 5, 9);
    derive(s, LAYER.POI, 100, 100); // unrelated derivations must not influence the result
    expect(derive(s, LAYER.POI, 5, 9)).toEqual(first);
  });

  it("depends on the order and on every part", () => {
    expect(derive(s, 1, 2)).not.toEqual(derive(s, 2, 1));
    expect(derive(s, 1, 2)).not.toEqual(derive(s, 1, 3));
    expect(derive(s, 1, 2)).not.toEqual(derive(s, 1, 2, 0));
    expect(derive(s, LAYER.TERRAIN, 0, 0)).not.toEqual(derive(s, LAYER.PROPS, 0, 0));
  });

  it("separates neighbouring coordinates", () => {
    const seen = new Set<number>();
    for (let x = -20; x <= 20; x++) for (let y = -20; y <= 20; y++) seen.add(derive(s, LAYER.TERRAIN, x, y)[0]);
    expect(seen.size).toBe(41 * 41);
  });

  it("gives different worlds for different seeds", () => {
    expect(derive(seedFromString("a"), 1)).not.toEqual(derive(seedFromString("b"), 1));
  });
});

describe("Rng helpers", () => {
  it("repeats the same stream for the same seed and differs for another", () => {
    const a = new Rng(seedFromString("x"));
    const b = new Rng(seedFromString("x"));
    const c = new Rng(seedFromString("y"));
    const seqA = Array.from({ length: 50 }, () => a.nextU32());
    expect(Array.from({ length: 50 }, () => b.nextU32())).toEqual(seqA);
    expect(Array.from({ length: 50 }, () => c.nextU32())).not.toEqual(seqA);
  });

  it("int stays inside its bound and is roughly uniform", () => {
    const r = new Rng(seedFromString("uniform"));
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const v = r.int(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      buckets[v]!++;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(9_500);
      expect(count).toBeLessThan(10_500);
    }
  });

  it("int(1) is always 0 and invalid bounds throw", () => {
    const r = new Rng(seedFromString("edge"));
    expect(r.int(1)).toBe(0);
    expect(() => r.int(0)).toThrow(RangeError);
    expect(() => r.int(-3)).toThrow(RangeError);
    expect(() => r.int(1.5)).toThrow(RangeError);
  });

  it("range is inclusive on both ends", () => {
    const r = new Rng(seedFromString("range"));
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) seen.add(r.range(-2, 2));
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
  });

  it("float is in [0, 1)", () => {
    const r = new Rng(seedFromString("float"));
    for (let i = 0; i < 10_000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it("chance follows its permille probability", () => {
    const r = new Rng(seedFromString("chance"));
    let hits = 0;
    for (let i = 0; i < 100_000; i++) if (r.chance(250)) hits++;
    expect(hits).toBeGreaterThan(24_000);
    expect(hits).toBeLessThan(26_000);
    expect(new Rng(seedFromString("c0")).chance(0)).toBe(false);
    expect(new Rng(seedFromString("c1")).chance(1000)).toBe(true);
  });

  it("weightedIndex respects weights and ignores zero weights", () => {
    const r = new Rng(seedFromString("weights"));
    const counts = [0, 0, 0];
    for (let i = 0; i < 40_000; i++) counts[r.weightedIndex([1, 0, 3])]!++;
    expect(counts[1]).toBe(0);
    expect(counts[2]! / counts[0]!).toBeGreaterThan(2.7);
    expect(counts[2]! / counts[0]!).toBeLessThan(3.3);
    expect(() => r.weightedIndex([0, 0])).toThrow(RangeError);
  });

  it("shuffle returns a permutation and is deterministic", () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const a = new Rng(seedFromString("shuffle")).shuffle([...input]);
    const b = new Rng(seedFromString("shuffle")).shuffle([...input]);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(input);
    expect(a).not.toEqual(input);
  });

  it("pick rejects empty arrays", () => {
    expect(() => new Rng(seedFromString("p")).pick([])).toThrow(RangeError);
  });
});
