import { describe, expect, it } from "vitest";
import { createDefaultParty } from "../../src/sim/party";
import { averageDamageLines, damageIncreased, meleeDamage, rangedDamage } from "../../src/sim/combat";
import { bonusLines, generateRing, makeItem, MAX_RING_LEVEL } from "../../src/sim/items";
import { itemBonus } from "../../src/sim/character";
import { Rng } from "../../src/core/rng";
import { DECO_BARBARIAN, DECO_LION, MOOSE_KING_ITEM } from "../../src/data/wall-deco";
import { decoSink } from "../../src/render/interiorProps";

/** bug_fix_59: the damage increase of the rings (point 3) and the relief that hangs on a flat wall (point 1). */
describe("bug_fix_59", () => {
  it("rings never carry a flat damage, only a damage increase in percent", () => {
    const rng = new Rng(59);
    const seen = new Set<number>();
    for (let level = 1; level <= MAX_RING_LEVEL; level++) {
      for (let n = 0; n < 200; n++) {
        const ring = generateRing(rng, level);
        expect(ring.bonus.dam_min).toBeUndefined();
        expect(ring.bonus.dam_max).toBeUndefined();
        if (ring.bonus.dam_pct !== undefined) seen.add(ring.bonus.dam_pct);
      }
    }
    // the four affixes of the old table: +2 (prefix of level 3, suffix of level 2), -1 (with armor) and +5 (with less armor); a ring with a prefix and a suffix adds them up (-1 + 2 = 1, 2 + 2 = 4, 5 + 2 = 7)
    for (const value of [-1, 2, 5]) expect(seen.has(value)).toBe(true);
    for (const value of seen) expect([-1, 1, 2, 4, 5, 7]).toContain(value);
  });

  it("the tooltip names the damage increase in percent", () => {
    const ring = makeItem({ name: "Ring", type: "ring", bonus: { dam_pct: 2 } });
    const line = bonusLines(ring).find((l) => l.label === "Damage Increase");
    expect(line).toMatchObject({ value: 2, unit: "%" });
  });

  it("the percentages of the worn rings add up and multiply the finished blow", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    expect(damageIncreased(c, 100)).toBe(100);
    c.inventory.left_ring = makeItem({ name: "Ring", type: "ring", bonus: { dam_pct: 2 } });
    expect(damageIncreased(c, 100)).toBe(102);
    c.inventory.right_ring = makeItem({ name: "Ring", type: "ring", bonus: { dam_pct: 2 } });
    expect(itemBonus(c, "dam_pct")).toBe(4);
    expect(damageIncreased(c, 100)).toBe(104);
    expect(damageIncreased(c, 0)).toBe(0);
    c.inventory.right_ring = makeItem({ name: "Ring", type: "ring", bonus: { dam_pct: -1 } });
    expect(damageIncreased(c, 100)).toBe(101);
    // melee and ranged blows both carry it
    const plain = createDefaultParty().characters[0]!;
    const rolls = (who: typeof c) => {
      const out: number[] = [];
      for (let i = 0; i < 20; i++) out.push(meleeDamage(who, null, new Rng(i)), rangedDamage(who, null, 3, new Rng(i + 100)));
      return out;
    };
    c.inventory.left_ring = makeItem({ name: "Ring", type: "ring", bonus: { dam_pct: 50 } });
    c.inventory.right_ring = null;
    const boosted = rolls(c);
    const base = rolls(plain);
    expect(boosted.some((v, i) => v > base[i]!)).toBe(true);
    expect(boosted.every((v, i) => v >= base[i]!)).toBe(true);
  });

  it("a ring of damage increase shows its average damage line", () => {
    const c = createDefaultParty().characters[0]!;
    const ring = makeItem({ name: "Ring", type: "ring", bonus: { dam_pct: 5 } });
    expect(averageDamageLines(c, ring, null, false).some((l) => l.label === "Average melee damage per hit")).toBe(true);
  });

  it("the reliefs of the user hang sunk into a wall of 3D pieces and flush on a flat one", () => {
    // `decoSink` is what a wall of 3D pieces takes off again: the barbarian is a deep relief, the lion and the moose's carving are not sunk at all
    expect(decoSink(DECO_BARBARIAN, {})).toBeGreaterThan(0.05);
    expect(decoSink(DECO_LION, {})).toBe(0);
    expect(decoSink(MOOSE_KING_ITEM, {})).toBe(0);
  });
});
