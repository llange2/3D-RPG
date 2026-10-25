import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FlatRegister } from "../../src/data/flatTerrain";
import { DEFAULT_SETTINGS, parseSettings } from "../../src/game/settings";
import { VIEW_CHUNKS, VIEW_FOG_RANGE, VIEW_SHARE, chunkRadius } from "../../src/render/engine";
import { FlatTileSet } from "../../src/render/flatGround";
import { setTileModels } from "../../src/render/heights";
import { FLAT_SLAB_SINK, hasOwnSlab, meshChunk, setFlatGround } from "../../src/render/terrainMesher";
import { isAlive } from "../../src/sim/character";
import { train, trainAll, trainAllPlan, trainingCost, trainingOrder } from "../../src/sim/economy";
import { createDefaultParty } from "../../src/sim/party";
import { CHUNK_SIZE } from "../../src/world/types";
import { World } from "../../src/world/world";

describe("options (fourteenth playtest, points 1, 2 and 6)", () => {
  it("starts from the defaults when nothing is stored or the text is damaged", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("42")).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.showFps).toBe(false);
  });

  it("keeps what is stored and ignores values it does not know", () => {
    const s = parseSettings(JSON.stringify({ floorModel: false, viewDistance: "close", resolution: "low", showFps: true, music: false, sfx: false, animatedTown: true, junk: 1 }));
    expect(s).toEqual({ floorModel: false, viewDistance: "close", resolution: "low", showFps: true, music: false, sfx: false, animatedTown: true });
    expect(parseSettings(JSON.stringify({ viewDistance: "sideways", resolution: "huge", showFps: "yes" }))).toEqual(DEFAULT_SETTINGS);
  });

  it("turns the old quality setting into a view distance and a resolution", () => {
    // the old far was the quality's own radius: low 2, med 3, high 4 chunks; medium one less, close half of it
    const old = (quality: string, viewDistance: string) => parseSettings(JSON.stringify({ floorModel: true, quality, viewDistance }));
    expect(old("med", "far")).toMatchObject({ viewDistance: "medium", resolution: "normal" });
    expect(old("low", "far")).toMatchObject({ viewDistance: "close", resolution: "low" });
    expect(old("high", "far")).toMatchObject({ viewDistance: "far", resolution: "normal" });
    expect(old("ultra", "far")).toMatchObject({ viewDistance: "far", resolution: "normal" });
    expect(old("high", "medium").viewDistance).toBe("medium");
    expect(old("high", "close").viewDistance).toBe("close");
    expect(old("med", "close").viewDistance).toBe("close");
  });

  it("draws 2, 4 and 6 chunks, with fog that ends well inside them", () => {
    expect(VIEW_CHUNKS).toEqual({ close: 2, medium: 4, far: 6 });
    expect(chunkRadius("close")).toBe(2);
    const tile = 3;
    const close = VIEW_FOG_RANGE.close!;
    // close: clear for 10 tiles, fully fogged at 15 (the user's figures)
    expect(close.start / tile).toBe(10);
    expect(close.end / tile).toBe(15);
    const medium = VIEW_FOG_RANGE.medium!;
    expect(medium.start).toBeGreaterThan(close.start);
    expect(medium.end).toBeGreaterThan(close.end);
    expect(VIEW_FOG_RANGE.far).toBeNull(); // far keeps the exponential fog of the biome
    // the nearest edge of what is drawn is the radius' chunks away, and the fog must have covered it by then
    for (const view of ["close", "medium"] as const) expect(VIEW_FOG_RANGE[view]!.end).toBeLessThan(VIEW_CHUNKS[view] * CHUNK_SIZE * tile);
    expect(VIEW_SHARE.close).toBeLessThan(VIEW_SHARE.medium);
  });
});

describe("Train all (fourteenth playtest, point 3)", () => {
  const party = (levels: number[], gold: number) => {
    const p = createDefaultParty();
    p.characters.forEach((c, i) => {
      c.level = levels[i]!;
      c.xp = 99_999_999;
    });
    p.gold = gold;
    return p;
  };

  it("begins with the lowest level among those who can rise", () => {
    const p = party([2, 1, 3, 5], 1_000_000);
    p.characters[0]!.xp = 0; // not enough experience: left out
    expect(trainingOrder(p)).toEqual([1, 2, 3]);
    p.characters[2]!.conditions.push("Dead");
    expect(isAlive(p.characters[2]!)).toBe(false);
    expect(trainingOrder(p)).toEqual([1, 3]);
  });

  it("trains everybody one level when the gold lasts", () => {
    const p = party([3, 1, 2, 5], 1_000_000);
    const before = p.gold;
    const plan = trainAllPlan(p);
    expect(plan.who).toEqual([1, 2, 0, 3]); // levels 1, 2, 3, 5
    expect(plan.waiting).toEqual([]);
    const done = trainAll(p);
    expect(done.who).toEqual(plan.who);
    expect(p.characters.map((c) => c.level)).toEqual([4, 2, 3, 6]);
    expect(before - p.gold).toBe(plan.cost);
  });

  it("trains as many as the gold reaches, lowest level first, and lets the rest wait", () => {
    // BALANCE v4: the gold is the price of the three lowest heroes, whatever the training formula is (it was a fixed 1500 at 250 × level)
    const probe = party([2, 1, 3, 5], 0);
    const price = (i: number) => trainingCost(probe.characters[i]!, probe);
    const gold = price(1) + price(0) + price(2);
    const p = party([2, 1, 3, 5], gold);
    const cost = (i: number) => trainingCost(p.characters[i]!, p);
    expect(cost(1) + cost(0) + cost(2)).toBe(gold);
    const done = trainAll(p);
    expect(done.who).toEqual([1, 0, 2]);
    expect(done.waiting).toEqual([3]);
    expect(done.cost).toBe(gold);
    expect(p.gold).toBe(0);
    expect(p.characters.map((c) => c.level)).toEqual([3, 2, 4, 5]);
  });

  it("does nothing, and takes no gold, when not even the lowest can be paid", () => {
    const probe = party([2, 1, 3, 5], 0);
    const gold = trainingCost(probe.characters[1]!, probe) - 1; // one short of the lowest hero's price
    const p = party([2, 1, 3, 5], gold);
    const done = trainAll(p);
    expect(done.who).toEqual([]);
    expect(done.waiting).toEqual([1, 0, 2, 3]);
    expect(p.gold).toBe(gold);
    expect(p.characters.map((c) => c.level)).toEqual([2, 1, 3, 5]);
  });

  it("costs what training each hero by hand costs", () => {
    const a = party([2, 1, 3, 5], 1_000_000);
    const b = party([2, 1, 3, 5], 1_000_000);
    trainAll(a);
    for (const i of [1, 0, 2, 3]) train(b, i);
    expect(a.gold).toBe(b.gold);
    expect(a.characters.map((c) => c.level)).toEqual(b.characters.map((c) => c.level));
  });
});

describe("no dark floor around trees and mountains (fourteenth playtest, point 4)", () => {
  const registerFile = join(import.meta.dirname, "..", "..", "public", "assets", "terrain", "flat", "tiles.json");
  const world = new World("test");

  afterEach(() => setFlatGround(null));

  /** The chunks around the start that hold tile models with a slab of their own. */
  const chunks = () => {
    const out: { cx: number; cy: number }[] = [];
    for (let cy = -3; cy <= 3; cy++) for (let cx = -3; cx <= 3; cx++) out.push({ cx, cy });
    return out;
  };

  it("lays the ground tile of the biome under every tree and mountain in the 3D mode", () => {
    setTileModels(true);
    setFlatGround(null);
    let checked = 0;
    for (const { cx, cy } of chunks()) {
      const geo = meshChunk(world, cx, cy);
      const grounds = geo.props.filter((p) => p.model.startsWith("gnd_"));
      for (const p of geo.props) {
        if (!hasOwnSlab(p.model) || p.model === "mtn_lava") continue; // lava ground has no tile
        const under = grounds.filter((g) => Math.abs(g.x - p.x) < 0.01 && Math.abs(g.z - p.z) < 0.01);
        expect(under, `${p.model} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`).toHaveLength(1);
        // a hair above the model's own slab (never level with it, so the two do not flicker), a few centimetres at most
        const lift = under[0]!.y - p.y;
        expect(lift).toBeGreaterThan(0.003);
        expect(lift).toBeLessThan(0.021);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("draws the ground tiles larger than the old game did, so that they meet", () => {
    setTileModels(true);
    setFlatGround(null);
    const sizes = new Set<number>();
    for (const { cx, cy } of chunks()) for (const p of meshChunk(world, cx, cy).props) if (p.model === "gnd_grass") sizes.add(p.scale);
    expect([...sizes]).toEqual([1.7 * 1.25]);
  });

  it.skipIf(!existsSync(registerFile))("sinks the slab of a tree or mountain below the painted ground in the flat mode", () => {
    setTileModels(true);
    const tiles = new FlatTileSet(JSON.parse(readFileSync(registerFile, "utf-8")) as FlatRegister);
    let checked = 0;
    for (const { cx, cy } of chunks()) {
      setFlatGround(null);
      const solid = meshChunk(world, cx, cy).props.filter((p) => hasOwnSlab(p.model));
      setFlatGround(tiles);
      const flat = meshChunk(world, cx, cy).props;
      expect(flat.some((p) => p.model.startsWith("gnd_"))).toBe(false); // the painted tiles are the ground
      for (const p of solid) {
        const same = flat.find((q) => q.model === p.model && Math.abs(q.x - p.x) < 0.01 && Math.abs(q.z - p.z) < 0.01);
        expect(same, `${p.model} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`).toBeDefined();
        expect(same!.y - p.y).toBeCloseTo(FLAT_SLAB_SINK, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});
