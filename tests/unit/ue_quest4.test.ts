import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { PEARL, PEARLS_IN_WORLD } from "../../src/data/quest-table";
import { generateInterior, planDungeon } from "../../src/interiors";
import { fromSaveFile, newGameState, toSaveFile } from "../../src/game/state";
import { worldQuestLog } from "../../src/game/questLog";
import { questItem } from "../../src/sim/items";
import { PIRATE_SPEED, pirateDistance, pirateHome, pirateSail, pirateSails } from "../../src/world/pirate";
import { GROUND } from "../../src/world/types";
import { World } from "../../src/world/world";

describe("ue_quest_4 (quest document 1.4): the Pearls of Youth and Beauty", () => {
  it("has the quest item with its picture in the table", () => {
    const pearl = questItem(PEARL);
    expect(pearl?.name).toMatch(/pearl/i);
    expect(pearl?.quest).toBe(true);
  });

  it("hides 20 pearls in the chests of the places of level 3 and 4, and nowhere else", { timeout: 240_000 }, () => {
    for (const [seed, size] of [["ue-a", "default"], ["ue-b", "small"]] as const) {
      const world = new World(seed, size);
      let pearls = 0;
      for (const poi of world.allPois().filter((p) => p.kind !== "town" && planDungeon(world, p)?.klass !== "C")) {
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        expect(validateContent(map, content), `${seed} ${poi.id}`).toEqual([]);
        let here = 0;
        for (const a of content.actions) {
          if (typeof a.params.extra !== "string") continue;
          here += a.params.extra.split(",").filter((t) => t === PEARL).length;
        }
        if (here > 0) expect([3, 4], `${seed} ${poi.id} (${poi.kind}, level ${poi.tier}) holds pearls`).toContain(poi.tier);
        pearls += here;
      }
      expect(pearls, `${seed} ${size}`).toBe(PEARLS_IN_WORLD);
    }
  });
});

describe("ue_quest_4: the pirate ship", () => {
  it("starts on deep water in the middle of the largest ocean, in every size of world", () => {
    for (const size of ["small", "default", "large"] as const) {
      const world = new World("pirate-a", size);
      const home = pirateHome(world);
      expect(home, size).not.toBeNull();
      expect(world.tile(home!.x, home!.y).ground, size).toBe(GROUND.WATER);
      expect(pirateSails(world, home!.x, home!.y)).toBe(true);
      // a pure function of the world
      expect(pirateHome(new World("pirate-a", size))).toEqual(home);
    }
  });

  it("sails three fields a step over water only, and stops next to the party", () => {
    const world = new World("pirate-a", "default");
    const home = pirateHome(world)!;
    let ship = home;
    const party = { x: world.wrapX(home.x + 14), y: home.y };
    let last = pirateDistance(world, ship, party);
    for (let i = 0; i < 12; i++) {
      const to = pirateSail(world, ship, party, () => false);
      // a step of at most three fields, each of them water
      expect(pirateDistance(world, ship, to)).toBeLessThanOrEqual(PIRATE_SPEED);
      expect(pirateSails(world, to.x, to.y)).toBe(true);
      ship = to;
      const d = pirateDistance(world, ship, party);
      expect(d).toBeLessThanOrEqual(last);
      last = d;
    }
    expect(last).toBeLessThanOrEqual(2);
  });

  it("does not sail onto a field that is taken", () => {
    const world = new World("pirate-a", "default");
    const home = pirateHome(world)!;
    const party = { x: world.wrapX(home.x + 8), y: home.y };
    const to = pirateSail(world, home, party, (x, y) => x === world.wrapX(home.x + 1) && y === home.y);
    expect(to.x === world.wrapX(home.x + 1) && to.y === home.y).toBe(false);
  });

  it("is kept in a save, and a save from before the ship loads without it", () => {
    const state = newGameState("pirate-save", { x: 5, y: 5, facing: "N" });
    expect(state.pirate).toBeNull();
    state.pirate = { x: 10, y: 20, away: 99_999 };
    expect(fromSaveFile(toSaveFile(state)).pirate).toEqual({ x: 10, y: 20, away: 99_999 });
    const old = toSaveFile(state);
    delete old.state.pirate;
    expect(fromSaveFile(old).pirate).toBeNull();
  });

  it("appears in the quest log once the party has met the queen or carries a pearl", () => {
    const world = new World("pirate-a", "small");
    const log = (opened: string[], carried = 0) => worldQuestLog({ world, opened: new Set(opened), visited: new Set(), carried: (t) => (t === PEARL ? carried : 0) });
    expect(log([]).open.some((l) => /pirate queen/.test(l))).toBe(false);
    expect(log(["pirate:met"]).open.find((l) => /pirate queen/.test(l))).toMatch(/0\/20 handed in\.$/);
    expect(log(["pirate:met", "pearls=3"], 2).open.find((l) => /pirate queen/.test(l))).toMatch(/3\/20 handed in, you carry 2\.$/);
    expect(log(["pearls=20"]).done.some((l) => /all 20 Pearls/.test(l))).toBe(true);
  });
});
