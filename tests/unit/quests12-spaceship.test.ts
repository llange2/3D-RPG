import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { SECTIONS } from "../../src/data/quest-table";
import { analyzeTopology, generateInterior, planDungeon } from "../../src/interiors";
import { carriedItems, createDefaultParty, giveItem } from "../../src/sim/party";
import { questItem } from "../../src/sim/items";
import { World } from "../../src/world/world";

const pyramidsOf = (world: World) => world.allPois().filter((p) => planDungeon(world, p)?.klass === "C");

describe("the spaceship (quest document 1.2, spaceship_1)", () => {
  it("is one level behind five pyramids: the same map and objects, the party appears at the tube of the pyramid's section", { timeout: 120_000 }, () => {
    for (const seed of ["ship-a", "ship-b"]) {
      const world = new World(seed, "default");
      const pyramids = pyramidsOf(world).sort((a, b) => planDungeon(world, a)!.section! - planDungeon(world, b)!.section!);
      expect(pyramids).toHaveLength(SECTIONS);
      const maps = pyramids.map((p) => generateInterior(world, p));
      const contents = pyramids.map((p, i) => buildMapContent(world, p, maps[i]!));
      for (let i = 0; i < SECTIONS; i++) {
        expect(maps[i]!.key).toBe("spaceship:0");
        expect(maps[i]!.theme.id).toBe("cyber");
        expect(validateContent(maps[i]!, contents[i]!), `${seed} section ${i}`).toEqual([]);
        const topo = analyzeTopology(maps[i]!);
        expect(topo.reachableFloor, `${seed} section ${i}`).toBe(topo.totalFloor);
        expect(JSON.stringify(contents[i]!)).toBe(JSON.stringify(contents[0]!));
        // the party appears in the section the pyramid opens
        const layout = maps[i]!.spaceship!;
        const tube = layout.tubes[i]!;
        expect([maps[i]!.spawn.x, maps[i]!.spawn.y]).toEqual([tube.front.x, tube.front.y]);
      }
    }
  });

  it("holds 10 orbs in the five sections and puts robots only in them", () => {
    const world = new World("ship-a", "default");
    const poi = pyramidsOf(world)[0]!;
    const map = generateInterior(world, poi);
    const content = buildMapContent(world, poi, map);
    // one chest for every orb (31st playtest, point 11), two in each section
    const chests = content.actions.filter((a) => a.params.quest === "quest_orb");
    expect(chests.length).toBe(10);
    expect(chests.every((a) => a.params.count === undefined)).toBe(true);
    expect(content.spawns.length).toBeGreaterThan(5);
  });

  it("shuts the sections by airlocks that open when both levers have been pulled, each lever once", () => {
    const world = new World("ship-a", "default");
    const poi = pyramidsOf(world)[0]!;
    const map = generateInterior(world, poi);
    const content = buildMapContent(world, poi, map);
    const party = createDefaultParty();
    const opened = new Set<string>();
    const use = (a: ActionInstance) => {
      const ctx: ActionContext = { party, rootSeed: world.rootSeed, content, opened, monsterThemes: {}, tier: 5 };
      let out = resolveAction(a, ctx);
      if (out.effects.some((e) => e.type === "confirm")) out = resolveAction(a, { ...ctx, answer: "yes" });
      for (const k of out.state?.add ?? []) opened.add(k);
      for (const e of out.effects) if (e.type === "door" && e.uid) opened.add(e.uid);
      return out;
    };
    const door = content.actions.find((a) => a.kind === "door" && a.params.airlock === true)!;
    const [first, second] = content.actions.filter((a) => a.kind === "lever" && a.params.airlock === door.uid) as [ActionInstance, ActionInstance];
    expect(use(door).effects[0]).toMatchObject({ text: expect.stringContaining("shut") });
    expect(use(first).effects[0]).toMatchObject({ text: expect.stringContaining("still stands in place") });
    expect(use(first).effects[0]).toMatchObject({ text: expect.stringContaining("stuck") });
    const out = use(second);
    expect(out.effects[0]).toMatchObject({ text: expect.stringContaining("slowly opens") });
    expect(opened.has(door.uid)).toBe(true);
  });

  it("ends the game for a party with the black key card at the tube of the control deck, and not for one without it", () => {
    const world = new World("ship-a", "default");
    const poi = pyramidsOf(world)[0]!;
    const map = generateInterior(world, poi);
    const content = buildMapContent(world, poi, map);
    const final = content.actions.find((a) => a.kind === "tube" && a.params.final === true)!;
    const party = createDefaultParty();
    const ctx: ActionContext = { party, rootSeed: world.rootSeed, content, monsterThemes: {}, tier: 5 };
    expect(resolveAction(final, ctx).effects.some((e) => e.type === "ending")).toBe(false);
    expect(giveItem(party, questItem("quest_black_keycard")!)).toBe(true);
    expect(carriedItems(party).length).toBeGreaterThan(0);
    expect(resolveAction(final, ctx).effects.some((e) => e.type === "ending")).toBe(true);
    const other = content.actions.find((a) => a.kind === "tube" && a.params.final !== true)!;
    expect(resolveAction(other, ctx).effects[0]).toMatchObject({ type: "transfer", mode: "poi_exit" });
  });
});
