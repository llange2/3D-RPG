/** bug_fix_63 (15. 11. 2026): the Evil Paladin holds his sword by a measured grip in the hand of the user's Mixamo rig. */
import { describe, expect, it } from "vitest";
import { equipmentModel } from "../../src/data/equipment";
import { MONSTERS } from "../../src/data/tables";
import { MIXAMO_GRIP } from "../../src/render/equipment";

describe("the Paladin's sword (63rd playtest)", () => {
  it("has a grip for the sword the Paladin holds, a unit rotation that tips the blade up and across the body", () => {
    const key = equipmentModel(MONSTERS[54]!.anim_weapon)!;
    const grip = MIXAMO_GRIP[key]!;
    expect(grip).toBeDefined();
    const [x, y, z, w] = grip.rotation;
    expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 3);
    // every sword of the old table shares the grip
    for (const sword of ["wpn_sword1", "wpn_sword2", "wpn_sword3"]) expect(MIXAMO_GRIP[sword]).toEqual(grip);
  });
});
