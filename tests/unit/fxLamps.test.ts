import { describe, expect, it } from "vitest";
import { ITEM_LAMPS, LAVA_LAMP, TOWER_TORCH_LAMP, lampSource } from "../../src/render/lamps";
import { TORCH_FLAME_HEIGHT, towerFlameSpots, towerTorchSpots } from "../../src/render/terrainMesher";

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

  it("leaves the light of a tower torch without effects of its own: its flame has them, at the flame", () => {
    expect(TOWER_TORCH_LAMP.fx).toBeUndefined();
    const poi = { x: 10, y: 10, size: 2, side: "S" as const };
    const light = towerTorchSpots(poi);
    const flame = towerFlameSpots(poi);
    expect(flame).toHaveLength(2);
    // the flames hang nearer to the wall and nearer to the door than the light does, and lower
    for (let k = 0; k < 2; k++) {
      expect(Math.hypot(flame[k]!.x - light[k]!.x, flame[k]!.z - light[k]!.z)).toBeGreaterThan(0.5);
    }
    expect(TORCH_FLAME_HEIGHT).toBeLessThan(TOWER_TORCH_LAMP.y);
  });
});
