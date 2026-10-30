import { describe, expect, it } from "vitest";
import { START_TOWN_ID, buildMapContent, validateContent } from "../../src/actions";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import { machineItem } from "../../src/actions/machines";
import { COIN, SKULL } from "../../src/data/quest-table";
import { generateInterior, planDungeon } from "../../src/interiors";
import { COINS_IN_WORLD, SKULLS_IN_WORLD } from "../../src/interiors/dungeonPlan";
import { createDefaultParty, giveItem, carriedItems } from "../../src/sim/party";
import { questItem } from "../../src/sim/items";
import { World } from "../../src/world/world";

describe("ue_quest_1 and ue_quest_2: Quatloo coins and silver skulls", () => {
  it("spreads 25 coins and 15 skulls over the places of the first levels and puts Seth Squirm in one dungeon of level 2", { timeout: 240_000 }, () => {
    for (const seed of ["ue-a", "ue-b"]) {
      const world = new World(seed, "default");
      let coins = 0;
      let skulls = 0;
      let seth = 0;
      for (const poi of world.allPois().filter((p) => p.kind !== "town" && planDungeon(world, p)?.klass !== "C")) {
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        expect(validateContent(map, content), `${seed} ${poi.id}`).toEqual([]);
        for (const a of content.actions) {
          if (typeof a.params.extra !== "string") continue;
          for (const type of a.params.extra.split(",")) {
            if (type === COIN) coins++;
            if (type === SKULL) skulls++;
          }
        }
        const ref = planDungeon(world, poi);
        if (ref?.seth) {
          seth++;
          expect(poi.tier, "Seth lives on level 2").toBe(2);
          expect(map.dungeon!.machines, poi.id).toBeDefined();
          const machines = content.actions.filter((a) => a.kind === "machine");
          expect(machines.map((m) => m.params.attr).sort()).toEqual(["acc", "end", "int", "lck", "per", "spd", "str"]);
          expect(new Set(machines.map((m) => m.params.item)).size, "one kind of statue").toBe(1);
          expect(machines[0]!.params.item).toBe(machineItem(world.rootSeed));
          expect(content.actions.some((a) => a.kind === "lore" && a.params.persona === 90)).toBe(true);
        }
      }
      expect(seth, seed).toBe(1);
      expect(coins, seed).toBe(COINS_IN_WORLD);
      expect(skulls, seed).toBe(SKULLS_IN_WORLD);
    }
  });

  it("lets a hero put a coin into a machine for three points, and shows the slot to a party without one", () => {
    const world = new World("ue-a", "default");
    const poi = world.allPois().find((p) => p.kind === "dungeon" && planDungeon(world, p)?.seth)!;
    const map = generateInterior(world, poi);
    const content = buildMapContent(world, poi, map);
    const machine = content.actions.find((a) => a.kind === "machine" && a.params.attr === "str")!;
    const party = createDefaultParty();
    const ctx: ActionContext = { party, rootSeed: world.rootSeed, content, monsterThemes: {}, tier: 2 };
    expect(resolveAction(machine, ctx).effects[0]).toMatchObject({ type: "text", text: expect.stringContaining("small slot") });
    expect(giveItem(party, questItem(COIN)!)).toBe(true);
    const before = party.characters[0]!.str;
    expect(resolveAction(machine, ctx).effects.some((e) => e.type === "pick")).toBe(true);
    expect(resolveAction(machine, { ...ctx, hero: null }).effects).toEqual([]);
    const done = resolveAction(machine, { ...ctx, hero: 0 });
    expect(done.effects.some((e) => e.type === "attribute" && e.amount === 3)).toBe(true);
    expect(party.characters[0]!.str).toBe(before + 3);
    expect(carriedItems(party).some((i) => i.type === COIN)).toBe(false);
  });

  it("always has the Skull Miser in the start town", () => {
    for (const seed of ["ue-a", "ue-b", "ue-c"]) {
      const world = new World(seed, "default");
      const start = world.poiById(START_TOWN_ID)!;
      const content = buildMapContent(world, start, generateInterior(world, start));
      expect(content.actions.filter((a) => a.kind === "skullmiser"), seed).toHaveLength(1);
      expect(content.actions.find((a) => a.kind === "skullmiser")!.params.persona).toBe(82);
    }
  });
});
