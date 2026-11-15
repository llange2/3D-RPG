/**
 * The 58th playtest (15. 11. 2026): the temple's revival by hero level (formulas 1.3), a lock that holds is tried again with the next push, the guild that only teaches
 * (one tab per hero, the lessons not learned yet), and the cartographer's cottage of every island.
 */
import { describe, expect, it } from "vitest";
import { lockRng } from "../../src/actions/handlers";
import { seedFromString } from "../../src/core/rng";
import { GUILD_SCHOOLS, guildLessons, guildScrolls, learnSpell, reviveCost, templeRevive } from "../../src/sim/economy";
import { createDefaultParty } from "../../src/sim/party";
import { learnBlock } from "../../src/sim/spells";
import { ISLAND_MAP_PRICE, LARGE_ISLAND_TILES, MEDIUM_ISLAND_TILES, caravansIn, islandMapSize, islandMapTiles, mapCottageOf, mapCottages } from "../../src/world/caravans";
import { DECO, GROUND } from "../../src/world/types";
import { World } from "../../src/world/world";

describe("point 2: the temple revives by the hero's level (formulas 1.3)", () => {
  it("charges 300 a level for the dead and 1000 a level for the rotten, whatever the tier of the temple", () => {
    const party = createDefaultParty();
    const hero = party.characters[0]!;
    hero.level = 12;
    hero.conditions = ["Dead"];
    expect(reviveCost(hero)).toBe(3600);
    hero.conditions = ["Rotten"];
    expect(reviveCost(hero)).toBe(12_000);
    hero.conditions = ["Dead"];
    party.gold = 3599;
    expect(templeRevive(party, 0)).toBe(false);
    party.gold = 3600;
    expect(templeRevive(party, 0)).toBe(true);
    expect(party.gold).toBe(0);
  });
});

describe("point 3: a lock that holds rolls again on the next try", () => {
  it("gives every try at the same lock its own stream, the same try the same one", () => {
    const ctx = { rootSeed: seedFromString("playtest-58"), attempt: 77 };
    const roll = (retries: number) => lockRng({ ...ctx, retries }, "door#1@lock").int(1_000_000);
    expect(roll(0)).toBe(roll(0));
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(roll)).size).toBeGreaterThan(5);
    // the first try is what it always was
    expect(lockRng(ctx, "door#1@lock").int(1_000_000)).toBe(roll(0));
  });
});

describe("point 5: the guild only teaches", () => {
  const party = createDefaultParty();
  const knight = party.characters[0]!;
  const archer = party.characters[2]!;

  it("has no lessons for a class without magic", () => {
    expect(guildLessons(knight, 5)).toBeNull();
  });

  it("offers a caster the spells of its school that it has not learned, from the lowest band up to the top of the guild", () => {
    const school = "Arcane";
    for (const level of [1, 2, 3, 4, 5]) {
      const lessons = guildLessons(archer, level)!;
      expect(lessons.length).toBeGreaterThan(0);
      for (const s of lessons) {
        expect(s.type).toContain(school);
        expect(archer.spells).not.toContain(s.id);
        expect(learnBlock({ ...archer, level: 99 }, s.id)).toBeNull();
      }
      // the guild of level 1 stops at level 5 spells, the one of level 2 at 10, and so on
      const top = [5, 10, 15, 20, Infinity][level - 1]!;
      expect(Math.max(...lessons.map((s) => s.level))).toBeLessThanOrEqual(top);
      expect(Math.min(...lessons.map((s) => s.level))).toBeGreaterThanOrEqual(2);
    }
    // the lessons of a higher guild contain those of the lower ones, so the guild of level 5 shows them all
    const ids = (level: number) => new Set(guildLessons(archer, level)!.map((s) => s.id));
    for (let level = 2; level <= 5; level++) for (const id of ids(level - 1)) expect(ids(level).has(id)).toBe(true);
    const all = GUILD_SCHOOLS.flatMap((s) => guildScrolls(5, s)).filter((s) => s.type.includes(school));
    for (const s of all) if (!archer.spells.includes(s.id)) expect(ids(5).has(s.id)).toBe(true);
  });

  it("drops a spell the hero has learned from the list", () => {
    const p = createDefaultParty();
    const c = p.characters[2]!;
    c.level = 40;
    p.gold = 1_000_000_000;
    const first = guildLessons(c, 5)![0]!;
    expect(learnSpell(p, 2, first.id).ok).toBe(true);
    expect(guildLessons(c, 5)!.map((s) => s.id)).not.toContain(first.id);
  });
});

describe("point 8: the cartographer's cottage of every island", () => {
  // the world of the playtest note: its small island at 32/36, its medium ones at 46/52 and 115/11
  const world = new World("pearl-shore-794", "default", "default");

  it("sorts the islands by their land: small below 300 tiles, medium below 620, large above, and prices them 500, 2 000 and 10 000", () => {
    expect(islandMapSize({ area: MEDIUM_ISLAND_TILES - 1 })).toBe("small");
    expect(islandMapSize({ area: MEDIUM_ISLAND_TILES })).toBe("medium");
    expect(islandMapSize({ area: LARGE_ISLAND_TILES - 1 })).toBe("medium");
    expect(islandMapSize({ area: LARGE_ISLAND_TILES })).toBe("large");
    expect(ISLAND_MAP_PRICE).toEqual({ small: 500, medium: 2000, large: 10_000 });
    const byCentre = (x: number, y: number) => world.islands.find((i) => i.x === x && i.y === y)!;
    expect(islandMapSize(byCentre(32, 36))).toBe("small");
    expect(islandMapSize(byCentre(46, 52))).toBe("medium");
    expect(islandMapSize(byCentre(115, 11))).toBe("medium");
    expect(islandMapSize(byCentre(112, 92))).toBe("large");
  });

  it("puts one cottage on every island, on land of that island and not on a place", () => {
    expect(mapCottages(world)).toHaveLength(world.islands.length);
    for (const isl of world.islands) {
      const c = mapCottageOf(world, isl);
      expect(c, `island ${isl.index}`).not.toBeNull();
      const t = world.tile(c!.x, c!.y);
      expect(t.ground).toBe(GROUND.LAND);
      expect(t.deco).toBe(DECO.NONE);
      expect(t.poiId).toBeNull();
      expect(world.islandAt(c!.x, c!.y)?.index).toBe(isl.index);
      expect(c!.cottage).toBe(true);
      expect(c!.islandMap).toEqual({ island: isl.index, price: ISLAND_MAP_PRICE[islandMapSize(isl)], size: islandMapSize(isl) });
    }
  });

  it("keeps the cottages apart and off the mascots, the huts and the wagons", () => {
    const list = mapCottages(world);
    for (const a of list) for (const b of list) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThan(1);
  });

  it("is the same in a second world of the same seed, and shows up with the wagons that come with hints only", () => {
    const again = new World("pearl-shore-794", "default", "default");
    expect(mapCottages(again).map((c) => [c.id, c.x, c.y])).toEqual(mapCottages(world).map((c) => [c.id, c.x, c.y]));
    const c = mapCottages(world)[0]!;
    expect(caravansIn(world, c.x - 5, c.y - 5, c.x + 5, c.y + 5, true).some((w) => w.islandMap?.island === c.islandMap!.island)).toBe(true);
    expect(caravansIn(world, c.x - 5, c.y - 5, c.x + 5, c.y + 5).some((w) => w.islandMap)).toBe(false);
  });

  it("shows the land of the island and two tiles of sea round it on the map", () => {
    const isl = world.islands.find((i) => i.x === 32 && i.y === 36)!;
    const tiles = islandMapTiles(world, isl);
    expect(tiles.length).toBeGreaterThanOrEqual(isl.area);
    const have = new Set(tiles.map((t) => `${t.x},${t.y}`));
    for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) if (world.islandAt(x, y)?.index === isl.index) expect(have.has(`${x},${y}`)).toBe(true);
  });
});
