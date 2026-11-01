import { describe, expect, it } from "vitest";
import { START_TOWN_ID, buildMapContent, validateContent } from "../../src/actions";
import { generateInterior, planDungeon } from "../../src/interiors";
import { TRAINING_MINUTES } from "../../src/sim/economy";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

describe("41st playtest, point 2: the cartographer is always in Starthaven", () => {
  it("stands in the start town of every seed, beside the Skull Miser and the guild apprentice", { timeout: 240_000 }, () => {
    const seeds = ["north-ward-302", "ue-a", "ue-b", "ue-c", "cedar-peak-198", ...Array.from({ length: 25 }, (_, i) => `start-town-${i}`)];
    for (const seed of seeds) {
      for (const size of ["small", "default"] as WorldSize[]) {
        const world = new World(seed, size);
        const start = world.poiById(START_TOWN_ID)!;
        const map = generateInterior(world, start);
        const content = buildMapContent(world, start, map);
        const talents = content.actions.filter((a) => a.kind === "talent").map((a) => a.params.talent);
        expect(talents, `${seed} ${size}`).toContain("talent_cartographer");
        expect(talents, `${seed} ${size}`).toContain("guild_level_1");
        expect(content.actions.filter((a) => a.kind === "skullmiser"), `${seed} ${size}`).toHaveLength(1);
        // nobody shares a cell
        const cells = content.actions.filter((a) => ["talent", "skullmiser", "portal", "work"].includes(a.kind)).map((a) => `${a.x},${a.y}`);
        expect(new Set(cells).size, `${seed} ${size}: two people on one cell`).toBe(cells.length);
        expect(validateContent(map, content), `${seed} ${size}`).toEqual([]);
      }
    }
  });
});

describe("41st playtest, point 7: a quest that teleports has a pocket for its end room", () => {
  it("gives the Grotto of Wilana (quest 3, seed cedar-peak-198) an end room the runes can teleport into", () => {
    const world = new World("cedar-peak-198", "default");
    const poi = world.allPois().find((p) => p.name === "Grotto of Wilana")!;
    const map = generateInterior(world, poi);
    expect(map.dungeon?.quest).toBe("quest_3");
    expect(map.dungeon?.endRoom?.isolated).toBe(true);
    const content = buildMapContent(world, poi, map);
    expect(validateContent(map, content)).toEqual([]);
    // the end room is a pocket with the portal back
    expect(content.actions.some((a) => a.kind === "qportal")).toBe(true);
  });

  it("most places of the quests 1 and 3 have a pocket", { timeout: 240_000 }, () => {
    const world = new World("cedar-peak-198", "default");
    let teleporting = 0;
    let pockets = 0;
    for (const poi of world.allPois().filter((p) => p.kind !== "town")) {
      const plan = planDungeon(world, poi);
      if (plan?.quest !== "quest_1" && plan?.quest !== "quest_3") continue;
      teleporting++;
      if (generateInterior(world, poi).dungeon?.endRoom?.isolated) pockets++;
    }
    expect(teleporting).toBeGreaterThan(0);
    expect(pockets / teleporting).toBeGreaterThan(0.9);
  });
});

describe("41st playtest, point 5: a statue never stands in the only way through a corridor", () => {
  it("keeps the riddle statue of the Grotto of Wilana off cell 30/29", () => {
    const world = new World("cedar-peak-198", "default");
    const poi = world.allPois().find((p) => p.name === "Grotto of Wilana")!;
    const content = buildMapContent(world, poi, generateInterior(world, poi));
    const riddles = content.actions.filter((a) => a.kind === "riddle");
    expect(riddles.length).toBeGreaterThan(0);
    expect(riddles.some((a) => a.x === 30 && a.y === 29)).toBe(false);
  });
});

describe("41st playtest, point 6: training takes time", () => {
  it("costs two hours per hero, eight for a party of four", () => {
    expect(TRAINING_MINUTES).toBe(120);
    expect(TRAINING_MINUTES * 4).toBe(8 * 60);
  });
});
