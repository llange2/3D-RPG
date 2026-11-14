import { describe, expect, it } from "vitest";
import { createDefaultParty } from "../../src/sim/party";
import { averageDamageLines, damageIncreased, meleeDamage, rangedDamage } from "../../src/sim/combat";
import { bonusLines, generateRing, makeItem, MAX_RING_LEVEL } from "../../src/sim/items";
import { itemBonus } from "../../src/sim/character";
import { Rng, seedFromString } from "../../src/core/rng";
import { DECO_BARBARIAN, DECO_LION, MOOSE_KING_ITEM } from "../../src/data/wall-deco";
import { decoSink } from "../../src/render/interiorProps";
import { NEUTRAL_SCALE, coinPoints, parseRewardScale, scaleAction, scaledGold, scaledXp } from "../../src/actions/rewardScale";
import { REWARD_TARGETS, measureWorld, rewardScaleOf } from "../../src/actions/rewardMeasure";
import type { ActionInstance } from "../../src/actions/types";
import { MONSTERS } from "../../src/data/tables";
import { createMonster, monsterXp } from "../../src/sim/encounter";
import { World } from "../../src/world/world";

/** bug_fix_59: the damage increase of the rings (point 3) and the relief that hangs on a flat wall (point 1). */
describe("bug_fix_59", () => {
  it("rings never carry a flat damage, only a damage increase in percent", () => {
    const rng = new Rng(seedFromString("59"));
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
      for (let i = 0; i < 20; i++) out.push(meleeDamage(who, null, new Rng(seedFromString(`m${i}`))), rangedDamage(who, null, 3, new Rng(seedFromString(`r${i}`))));
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

  it("the islands share the levels 4 and 5 by land, and the stronger level lies farther from the start", () => {
    for (const size of ["small", "default", "large"] as const) {
      for (let s = 0; s < 6; s++) {
        const world = new World(`land-split-${s}`, size, "default");
        const land: Record<number, number> = { 4: 0, 5: 0 };
        for (const isl of world.islands) for (const t of isl.tiers) if (t >= 4) land[t] = (land[t] ?? 0) + isl.area;
        // (the main islands are fixed; the others even the two out as far as the line between the levels allows)
        const share = land[5]! / (land[4]! + land[5]!);
        expect(share, `${size} seed ${s}`).toBeGreaterThan(0.3);
        expect(share, `${size} seed ${s}`).toBeLessThan(0.7);
      }
    }
  });

  describe("the reward factors (points 4 and 6)", () => {
    const chest = (params: ActionInstance["params"], kind: ActionInstance["kind"] = "treasure", uid = "m#a:1"): ActionInstance => ({ uid, kind, x: 1, y: 1, params });

    it("leaves a neutral world alone and scales gold, points and experience in another", () => {
      const a = chest({ gold: 1000, items: 2 });
      expect(scaleAction(a, NEUTRAL_SCALE)).toBe(a);
      expect(scaleAction(a, undefined)).toBe(a);
      const scale = { gold: 0.5, xp: 2, attr: 2, coin: 3, res: 0.5 };
      expect(scaleAction(a, scale).params.gold).toBe(500);
      expect(scaleAction(chest({ bonus: "attr", attr: "str", amount: 10 }, "chalice"), scale).params.amount).toBe(20);
      expect(scaleAction(chest({ bonus: "res", amount: 40 }, "chalice"), scale).params.amount).toBe(20);
      expect(scaleAction(chest({ bonus: "xp", amount: 100_000 }, "chalice"), scale).params.amount).toBe(200_000);
      expect(scaleAction(chest({ effect: "resist", amount: 20 }, "shrine"), scale).params.amount).toBe(10);
      // a barrel with points is a chalice for the handler: the factor does not apply twice
      const once = scaleAction(chest({ bonus: "attr", attr: "str", amount: 10 }), scale);
      expect(scaleAction({ ...once, kind: "chalice" }, scale).params.amount).toBe(20);
      expect(scaledGold(1000, scale)).toBe(500);
      expect(scaledGold(0, scale)).toBe(0);
      expect(scaledXp(10, scale)).toBe(20);
      expect(coinPoints(scale)).toBe(9);
      expect(coinPoints(undefined)).toBe(3);
    });

    it("rounds gifts of a few points by the uid, so that many small gifts keep the factor", () => {
      let total = 0;
      for (let i = 0; i < 400; i++) total += Number(scaleAction(chest({ effect: "attribute", amount: 1 }, "shrine", `m#s:${i}`), { ...NEUTRAL_SCALE, attr: 1.5 }).params.amount);
      expect(total).toBeGreaterThan(560);
      expect(total).toBeLessThan(640);
    });

    it("keeps old saves at the tables and knows the experience factor of a monster", () => {
      expect(parseRewardScale(undefined)).toEqual(NEUTRAL_SCALE);
      expect(parseRewardScale({ gold: 0.5 })).toEqual({ ...NEUTRAL_SCALE, gold: 0.5 });
      const def = MONSTERS[1]!;
      const m = createMonster("u", 1, 0, 0);
      expect(monsterXp(m, def)).toBe(def.xp);
      expect(monsterXp(m, def, 0.5)).toBe(Math.max(1, Math.floor(def.xp * 0.5)));
    });

    it("a world of any size pays the gold of the default world: 120 to 130 million with the quests", { timeout: 240_000 }, () => {
      for (const [seed, size] of [["table-47", "small"], ["table-47", "default"], ["table-48", "default"], ["table-49", "default"], ["table-50", "default"], ["table-51", "default"]] as const) {
        const raw = measureWorld(new World(seed, size, "default"));
        const scale = rewardScaleOf(raw);
        const gold = (raw.goldMonsters + raw.goldObjects) * scale.gold + raw.goldQuests;
        expect(gold, `${seed} ${size}`).toBeGreaterThanOrEqual(120_000_000);
        expect(gold, `${seed} ${size}`).toBeLessThanOrEqual(130_000_000);
        const xp = (raw.xpMonsterPlaces + raw.xpMonsterWild + raw.xpHuts + raw.xpObjects) * scale.xp + raw.xpQuests;
        expect(Math.abs(xp / REWARD_TARGETS.xp - 1), `${seed} ${size} xp`).toBeLessThan(0.02);
        // a small world pays more for each monster and chest, the default world about what the tables say
        if (size === "small") expect(scale.gold).toBeGreaterThan(1.2);
        else {
          expect(scale.gold).toBeGreaterThan(0.5);
          expect(scale.gold).toBeLessThan(1.1);
        }
      }
    });
  });
});
