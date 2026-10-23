import { describe, expect, it } from "vitest";
import monsterModels from "../../public/assets/models.monsters.json";
import staticModels from "../../public/assets/models.static.json";
import { GROUNDED_ITEMS, HEIGHT_FACTOR, WIDTH_FACTOR, tunedItemModels } from "../../src/data/item-tuning";
import { itemProp } from "../../src/render/itemProps";
import { EYES_AT } from "../../src/render/monsters";
import type { StaticModelInfo } from "../../src/render/assets";

const info = (staticModels as unknown as { models?: Record<string, StaticModelInfo> }).models ?? (staticModels as unknown as Record<string, StaticModelInfo>);
const monsters = monsterModels as unknown as Record<string, { animated: boolean }>;

describe("24th playtest, point 3: the rustic caravan is 85 % as wide", () => {
  it("scales width and depth by 0.85 and keeps the 75 % of its height", () => {
    const old = (tunedItemModels<{ scale3: [number, number, number] }>())["26"]!.scale3;
    expect(WIDTH_FACTOR["26"]).toBe(0.85);
    expect(old[0]).toBeCloseTo(1.3 * 0.85, 6);
    expect(old[2]).toBeCloseTo(1.3 * 0.85, 6);
    expect(old[1]).toBeCloseTo(1.6 * HEIGHT_FACTOR["26"]!, 6);
  });
});

describe("24th playtest, point 5: things that stand on the ground touch it", () => {
  it("rests the lowest point of the caravan, barrow, donkey, cave entrance and burnt hut on the ground height they are given", () => {
    for (const item of GROUNDED_ITEMS) {
      const key = `ci_${item}`;
      const model = info[key];
      if (!model) continue;
      const inst = itemProp(item, 0, 0, 0, info)!;
      expect(inst, `item ${item} has a model`).not.toBeNull();
      // the prop renderer puts the model's lowest point at `y` (less its small sink into the ground), so the instance height is the ground height
      expect(Math.abs(inst.y), `item ${item}`).toBeLessThan(1e-9);
    }
  });

  it("leaves the items that hang or float where the old game's table puts them", () => {
    const orb = itemProp(10, 0, 0, 0, info)!;
    expect(orb.y).toBeGreaterThan(1);
  });
});

describe("24th playtest, point 4: monsters without feet look the party in the eye", () => {
  it("lists static monsters only, with the eyes inside the model", () => {
    for (const [id, share] of Object.entries(EYES_AT)) {
      expect(monsters[id], `monster ${id} has a model`).toBeDefined();
      expect(monsters[id]!.animated, `monster ${id} is static`).toBe(false);
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThan(1);
    }
    // the sorcerer floats on his cloud
    expect(EYES_AT[66]).toBeDefined();
  });
});
