import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { pickMonsters } from "../../src/data/dungeon-themes";
import { LAND_GROUPS } from "../../src/data/quest-table";
import { MONSTERS, TALENTS, talentInfo } from "../../src/data/tables";
import { sellerParams } from "../../src/data/talent-sellers";
import { placeSegments } from "../../src/game/questLog";
import { grantTalent, createDefaultParty, stepMinutes } from "../../src/sim/party";
import { ARMS_MASTER, makeItem, needsArmsMaster } from "../../src/sim/items";

describe("43rd playtest: talents", () => {
  it("the Pathfinder shortens a step in the open country to 7 minutes, and nothing else", () => {
    expect(stepMinutes(true)).toBe(10);
    expect(stepMinutes(true, ["talent_pathfinder"])).toBe(7);
    expect(stepMinutes(false, ["talent_pathfinder"])).toBe(1);
    expect(talentInfo("talent_pathfinder").description).toMatch(/^Pathfinding will help you to travel faster/);
    expect(sellerParams("talent_pathfinder").text).toMatch(/7 minutes instead of 10/);
  });

  it("the Body Builder adds one hit point per level and works out every hero at once", () => {
    const party = createDefaultParty();
    const before = party.characters.map((c) => c.health);
    grantTalent(party, "talent_body_builder");
    party.characters.forEach((c, i) => expect(c.health).toBe(before[i]! + c.level));
  });

  it("the Arms Master costs 10'000 and only obsidian gear takes it", () => {
    expect(TALENTS.talent_arms_master!.price).toBe(10_000);
    expect(sellerParams("talent_arms_master").text).toMatch(/Obsidian is hard/);
    expect(needsArmsMaster(makeItem({ name: "Obsidian long sword", type: "long sword", material: 8 }))).toBe(true);
    expect(needsArmsMaster(makeItem({ name: "Obsidian plate", type: "plate_armor", material: 8 }))).toBe(true);
    expect(needsArmsMaster(makeItem({ name: "Gold long sword", type: "long sword", material: 5 }))).toBe(false);
    expect(needsArmsMaster(makeItem({ name: "Ring", type: "ring", material: 8 }))).toBe(false);
    expect(ARMS_MASTER).toBe("talent_arms_master");
  });
});

describe("43rd playtest: monsters of the place's own level", () => {
  it("a cave or dungeon of level N holds monsters of level N only", () => {
    for (const groups of [["beast", "plant"], LAND_GROUPS] as const) {
      for (let tier = 1; tier <= 5; tier++) {
        for (let seed = 0; seed < 20; seed++) {
          const { monsters } = pickMonsters(new Rng(seedFromString(`own-level:${tier}:${seed}`)), groups, tier);
          expect(monsters.length).toBe(3);
          for (const id of monsters) expect(MONSTERS[id]!.treasure_level).toBe(tier);
        }
      }
    }
  });
});

describe("43rd playtest: quest log", () => {
  it("cuts the names of caves and dungeons out of a line for the bold print", () => {
    const parts = placeSegments("Explore the scary Cave of Aldoa at 3/4.", ["Cave of Aldoa"]);
    expect(parts).toEqual([
      { text: "Explore the scary ", bold: false },
      { text: "Cave of Aldoa", bold: true },
      { text: " at 3/4.", bold: false },
    ]);
    expect(placeSegments("nothing", [])).toEqual([{ text: "nothing", bold: false }]);
  });
});
