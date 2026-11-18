import { describe, expect, it } from "vitest";
import { ITEM_LAMPS, LAVA_LAMP, LOOT_LAMP, TOWER_TORCH_LAMP, lampSource } from "../../src/render/lamps";
import { caveFlameSpots, caveTorchSpots, towerFlameSpots, towerTorchSpots } from "../../src/render/terrainMesher";
import { poiBounds } from "../../src/world/types";

/** The middle of a place's footprint in the world (a tile is 3 units, grid y grows towards -z). */
const middleOf = (poi: { x: number; y: number; size: number; side: "N" | "E" | "S" | "W" }): { x: number; z: number } => {
  const b = poiBounds(poi);
  return { x: (b.x0 + poi.size / 2) * 3, z: -(b.y0 + poi.size / 2) * 3 };
};

/** What the effects add round a lamp (`LampKind.fx`, bug_fix_68): the lamp sources carry it to `Effects.setLamps`. */
describe("effects: what rises from the lamps", () => {
  it("names a kind for the objects that burn, bubble, shimmer or glitter", () => {
    expect(ITEM_LAMPS[117]!.fx).toBe("crystal");
    expect(ITEM_LAMPS[120]!.fx).toBe("lava");
    expect(ITEM_LAMPS[92]!.fx).toBe("acid");
    expect(ITEM_LAMPS[121]!.fx).toBe("magic");
    expect(ITEM_LAMPS[3]!.fx).toBe("portal");
    expect(ITEM_LAMPS[71]!.fx).toBe("torch");
    expect(ITEM_LAMPS[4]!.fx).toBe("gold");
  });

  it("hands the kind on to the lamp source", () => {
    expect(lampSource(LAVA_LAMP, 1, 2, "k").fx).toBe("lava");
    expect(lampSource({ y: 1, color: [1, 1, 1] }, 1, 2, "k").fx).toBeUndefined();
  });

  it("starts what rises from a pool at its surface, not at the height of its light (the lava puddle is 0.2 high, its light hangs at 0.9)", () => {
    for (const item of [120, 92]) {
      const lamp = lampSource(ITEM_LAMPS[item]!, 1, 2, "k");
      expect(lamp.fxY).toBeDefined();
      expect(lamp.fxY!).toBeLessThan(0.3);
      expect(lamp.y).toBeGreaterThan(lamp.fxY!);
    }
  });

  it("gives the magic pools (the red and the yellow well) smoke in their own colour", () => {
    for (const item of [37, 88]) {
      const lamp = ITEM_LAMPS[item]!;
      expect(lamp.fx).toBe("pool");
      expect(lamp.fxY!).toBeLessThan(0.7); // a well is 0.67 high
    }
    expect(ITEM_LAMPS[37]!.color).not.toEqual(ITEM_LAMPS[88]!.color);
  });

  it("lets the loot twinkle like the heap of treasure", () => {
    expect(LOOT_LAMP.fx).toBe(ITEM_LAMPS[4]!.fx);
  });

  it("leaves the light of a tower torch without effects of its own: its flame has them, at the flame", () => {
    expect(TOWER_TORCH_LAMP.fx).toBeUndefined();
    const poi = { x: 10, y: 10, size: 2, side: "S" as const };
    const light = towerTorchSpots(poi);
    const flame = towerFlameSpots(poi);
    expect(flame).toHaveLength(2);
    // the flames hang nearer to the wall than the light does, and lower
    for (let k = 0; k < 2; k++) {
      expect(Math.hypot(flame[k]!.x - light[k]!.x, flame[k]!.z - light[k]!.z)).toBeGreaterThan(0.5);
      expect(flame[k]!.y).toBeLessThan(TOWER_TORCH_LAMP.y);
    }
  });

  it("puts the flames of the tower on its wall: inside the footprint, 1.6 units in front of the middle, the two 2.5 apart, as high as the torches of the model", () => {
    for (const side of ["N", "E", "S", "W"] as const) {
      const poi = { x: 10, y: 10, size: 2, side };
      const [a, b] = towerFlameSpots(poi);
      const { x: cx, z: cz } = middleOf(poi);
      const mid = { x: (a!.x + b!.x) / 2, z: (a!.z + b!.z) / 2 };
      expect(Math.hypot(mid.x - cx, mid.z - cz)).toBeGreaterThan(1.4);
      expect(Math.hypot(mid.x - cx, mid.z - cz)).toBeLessThan(1.8);
      expect(Math.hypot(a!.x - b!.x, a!.z - b!.z)).toBeGreaterThan(2.3);
      expect(Math.hypot(a!.x - b!.x, a!.z - b!.z)).toBeLessThan(2.7);
      expect(a!.y).toBeCloseTo(2.0, 0);
    }
  });

  it("gives the cave entrance one torch with its flame and its light, the light in front of the flame and higher", () => {
    const poi = { x: 20, y: 12, size: 1, side: "E" as const };
    const flame = caveFlameSpots(poi);
    const light = caveTorchSpots(poi);
    expect(flame).toHaveLength(1);
    expect(light).toHaveLength(1);
    expect(light[0]!.y).toBeGreaterThan(flame[0]!.y);
    expect(Math.hypot(light[0]!.x - flame[0]!.x, light[0]!.z - flame[0]!.z)).toBeGreaterThan(0.5);
    // the flame is on the model, not far away from it: within a tile of the middle of the footprint
    const { x: cx, z: cz } = middleOf(poi);
    expect(Math.hypot(flame[0]!.x - cx, flame[0]!.z - cz)).toBeLessThan(3);
  });
});
