import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { RIDDLES_WORLD } from "../../src/data/riddles";
import { quickEquipTarget } from "../../src/sim/character";
import { SILLY_RUMOURS, tavernRumour } from "../../src/sim/economy";
import { makeItem } from "../../src/sim/items";
import { createDefaultParty, hasLight, setMascot, addEffect } from "../../src/sim/party";
import { World } from "../../src/world/world";

describe("release 1.2", () => {
  it("the Orb mascot is a Light spell that never runs out", () => {
    const party = createDefaultParty();
    setMascot(party, "Crow");
    expect(hasLight(party)).toBe(false);
    setMascot(party, "Orb");
    party.minutes += 10 * 24 * 60;
    expect(hasLight(party)).toBe(true);
    // the spell works as before for the other mascots, and runs out
    setMascot(party, "Wolf");
    addEffect(party, { kind: "light", until: party.minutes + 60 });
    expect(hasLight(party)).toBe(true);
    party.minutes += 120;
    expect(hasLight(party)).toBe(false);
  });

  it("Ctrl + click puts a ring into the off-hand ring slot, a free slot is still taken first", () => {
    const hero = createDefaultParty().characters[0]!;
    const spare = makeItem({ name: "Spare", type: "ring", bonus: { lck: 1 } });
    hero.inventory.left_ring = null;
    hero.inventory.right_ring = null;
    expect(quickEquipTarget(hero.inventory, spare, true)).toBe(quickEquipTarget(hero.inventory, spare, false));
    hero.inventory.left_ring = makeItem({ name: "A", type: "ring", bonus: { str: 1 } });
    hero.inventory.right_ring = makeItem({ name: "B", type: "ring", bonus: { acc: 1 } });
    const plain = quickEquipTarget(hero.inventory, spare, false);
    const off = quickEquipTarget(hero.inventory, spare, true);
    expect(plain === "left_ring" || plain === "right_ring").toBe(true);
    expect(off === "left_ring" || off === "right_ring").toBe(true);
    expect(off).not.toBe(plain);
    // nothing but rings has a second slot
    expect(quickEquipTarget(hero.inventory, makeItem({ name: "Cap", type: "helmet", bonus: { arm: 1 } }), true)).toBe(quickEquipTarget(hero.inventory, makeItem({ name: "Cap", type: "helmet", bonus: { arm: 1 } }), false));
  });

  it("a tavern puts the password it lets slip in quotation marks", () => {
    const world = new World("minis-a", "default");
    const answers = new Set(world.riddlesOfWorld().map((r) => RIDDLES_WORLD[String(r.riddle)]!.answer));
    let seen = 0;
    for (let i = 0; i < 100; i++) {
      const text = tavernRumour(world, 3, new Rng(seedFromString(`q${i}`)));
      if (SILLY_RUMOURS.includes(text)) continue;
      seen++;
      expect([...answers].some((a) => text.includes(`'${a}'`)), text).toBe(true);
    }
    expect(seen).toBeGreaterThan(20);
  });
});
