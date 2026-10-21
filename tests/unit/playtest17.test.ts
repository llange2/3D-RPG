import { describe, expect, it } from "vitest";
import { resolveAction } from "../../src/actions/handlers";
import { seedFromString } from "../../src/core/rng";
import { TALENT_SELLERS, sellerParams } from "../../src/data/talent-sellers";
import { bargainFactor } from "../../src/sim/economy";
import { createDefaultParty } from "../../src/sim/party";
import { CARAVAN_ITEM, CARAVAN_TALENTS, caravansIn, caravansOf } from "../../src/world/caravans";
import { DECO, GROUND, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";

function townsOf(world: World, tier: number, count: number): Poi[] {
  return world.allPois().filter((p) => p.kind === "town" && p.tier === tier).slice(0, count);
}

describe("seventeenth session: the rusty caravans", () => {
  it("sells orientation, perception and swimming near the towns of tier 1 (so near Starthaven), the bargainer near those of tier 2 and the merchant near those of tier 4, and nothing near the others", () => {
    expect(CARAVAN_TALENTS).toEqual({ 1: ["talent_orientation", "talent_perceptive", "talent_swimmer"], 2: ["talent_bargainer"], 4: ["talent_merchant"] });
    for (const talent of Object.values(CARAVAN_TALENTS).flat()) expect(TALENT_SELLERS[talent], talent).toMatchObject({ item: CARAVAN_ITEM });
    for (const seed of ["test", "alpha", "hollow-mere-793"]) {
      const world = new World(seed, "large");
      for (const tier of [1, 2, 3, 4, 5]) {
        for (const town of townsOf(world, tier, 6)) {
          const caravans = caravansOf(world, town);
          const wanted = CARAVAN_TALENTS[tier] ?? [];
          expect(caravans.map((c) => c.talent), `${seed} ${town.id} tier ${tier}`).toEqual([...wanted]);
          // wagons do not stand on each other: there is room to walk between them
          for (const a of caravans) for (const b of caravans) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)), `${town.id}`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("stands on plain, open ground near the town's entrance, off the roads, with room to walk round it", { timeout: 120_000 }, () => {
    let seen = 0;
    for (const seed of ["test", "alpha", "ember"]) {
      const world = new World(seed, "large");
      for (const tier of [1, 2, 4]) {
        for (const town of townsOf(world, tier, 8)) {
          for (const c of caravansOf(world, town)) {
            seen++;
            const t = world.tile(c.x, c.y);
            expect([t.ground, t.deco, t.poiId], `${seed} ${town.id}`).toEqual([GROUND.LAND, DECO.NONE, null]);
            expect(world.isOpenGround(c.x, c.y)).toBe(true);
            const front = world.frontOf(town);
            const d = Math.max(Math.abs(c.x - front.x), Math.abs(c.y - front.y));
            expect(d).toBeGreaterThanOrEqual(1); // never on the entrance tile itself
            expect(d).toBeLessThanOrEqual(16);
            expect([c.faceX, c.faceY]).toEqual([front.x, front.y]);
          }
          // the same town always has the same caravans
          expect(caravansOf(new World(seed, "large"), town)).toEqual(caravansOf(world, town));
        }
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it("is found by the towns in a rectangle", () => {
    const world = new World("test");
    const town = townsOf(world, 2, 1)[0]!;
    const found = caravansIn(world, town.x - 30, town.y - 30, town.x + 30, town.y + 30);
    expect(found.map((c) => c.town)).toContain(town.id);
  });

  it("is sold like the people of the towns: asked, paid once, and the bargainer's discount works", () => {
    const rootSeed = seedFromString("playtest17");
    const party = createDefaultParty();
    party.gold = 20000;
    const act = (talent: string) => ({ uid: `caravan:x:${talent}`, kind: "talent" as const, x: 1, y: 1, params: { talent, ...sellerParams(talent) } });
    const ctx = (answer?: string | null) => ({ party, rootSeed, monsterThemes: { beast: 1 }, tier: 2, ...(answer !== undefined ? { answer } : {}) });
    expect(bargainFactor(party)).toBe(1);
    const asked = resolveAction(act("talent_bargainer"), ctx());
    expect(asked.effects[0]).toMatchObject({ type: "confirm", question: expect.stringContaining("5'000") });
    expect(resolveAction(act("talent_bargainer"), ctx("yes")).effects[0]).toEqual({ type: "talent", talent: "talent_bargainer", price: 5000 });
    expect(party.gold).toBe(15000);
    // the name the old game never matched: the discount applies now
    expect(bargainFactor(party)).toBe(0.75);
    expect(resolveAction(act("talent_merchant"), ctx("yes")).effects[0]).toEqual({ type: "talent", talent: "talent_merchant", price: 10000 });
    expect(bargainFactor(party)).toBe(0.5);
    expect(party.gold).toBe(5000);
  });
});
