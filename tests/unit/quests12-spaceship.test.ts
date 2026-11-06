import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { resolveAction, type ActionContext, type ActionOutcome } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { BRIDGE, CONTROL_ROOM, ENGINES_FLAG, ENGINE_CRYSTAL_FLAG, ENGINE_ROOM, LIFE_FLAG, LIFE_SUPPORT, ORBS_IN_SPACESHIP, SECTIONS, STORAGE_BAY } from "../../src/data/quest-table";
import { analyzeTopology, generateInterior, planDungeon } from "../../src/interiors";
import { sectionAt } from "../../src/interiors/spaceship";
import { carriedItems, createDefaultParty, giveItem } from "../../src/sim/party";
import { blocksCell, heapGone } from "../../src/actions/registry";
import { splitsRing } from "../../src/interiors/passage";
import { CELL } from "../../src/interiors/types";
import { questItem } from "../../src/sim/items";
import { World } from "../../src/world/world";

const pyramidsOf = (world: World) => world.allPois().filter((p) => planDungeon(world, p)?.klass === "C");

const shipOf = (seed = "ship-a") => {
  const world = new World(seed, "default");
  const poi = pyramidsOf(world)[0]!;
  const map = generateInterior(world, poi);
  const content = buildMapContent(world, poi, map);
  return { world, map, content, layout: map.spaceship! };
};

/** Uses an action the way the game does: asks again with a yes for a question, with the first hero for a pick. */
function use(a: ActionInstance, ctx: ActionContext, answer: "yes" | null = "yes"): ActionOutcome {
  let out = resolveAction(a, ctx);
  if (out.effects.some((e) => e.type === "pick")) out = resolveAction(a, { ...ctx, hero: 0 });
  else if (out.effects.some((e) => e.type === "confirm")) out = resolveAction(a, { ...ctx, answer });
  for (const k of out.state?.add ?? []) (ctx.opened as Set<string>).add(k);
  for (const k of out.state?.remove ?? []) (ctx.opened as Set<string>).delete(k);
  return out;
}

describe("the spaceship (quest document 1.5, quest_7)", () => {
  it("is one level behind five pyramids: the same map and objects, the party appears at the tube of the pyramid's section", { timeout: 180_000 }, () => {
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
        expect(sectionAt(layout, tube.x, tube.y)).toBe(i);
      }
    }
  });

  it("lays its sections in a grid: the bridge in front, life support under the control room, four airlocks that join them as the document says", () => {
    const { layout } = shipOf();
    expect(layout.locks.map((l) => [l.from, l.to, l.axis])).toEqual([
      [BRIDGE, CONTROL_ROOM, "x"],
      [CONTROL_ROOM, LIFE_SUPPORT, "y"],
      [CONTROL_ROOM, STORAGE_BAY, "x"],
      [STORAGE_BAY, ENGINE_ROOM, "x"],
    ]);
    expect(layout.origins[LIFE_SUPPORT]!.x).toBe(layout.origins[CONTROL_ROOM]!.x);
    expect(layout.origins[LIFE_SUPPORT]!.y).toBeGreaterThan(layout.origins[CONTROL_ROOM]!.y);
    // every lock stands on the border of the two sections it joins
    for (const lock of layout.locks) {
      const first = sectionAt(layout, lock.door.x - (lock.axis === "x" ? 1 : 0), lock.door.y - (lock.axis === "y" ? 1 : 0));
      const second = sectionAt(layout, lock.door.x, lock.door.y);
      expect([first, second]).toEqual([lock.from, lock.to]);
    }
  });

  it("holds 8 orbs, 2 in every section but the bridge, and puts robots only in them: terminators on the bridge, rare in the others", () => {
    const { content, layout } = shipOf();
    // one chest for every orb (31st playtest, point 11)
    const chests = content.actions.filter((a) => a.params.quest === "quest_orb");
    expect(chests.length).toBe(ORBS_IN_SPACESHIP);
    expect(chests.every((a) => a.params.count === undefined)).toBe(true);
    expect(chests.some((a) => sectionAt(layout, a.x, a.y) === BRIDGE)).toBe(false);
    expect(content.spawns.length).toBeGreaterThan(5);
    const onBridge = content.spawns.filter((s) => sectionAt(layout, s.x, s.y) === BRIDGE);
    expect(onBridge.length).toBeGreaterThan(3);
    expect(onBridge.every((s) => s.monsterIds.every((id) => id === 69))).toBe(true);
    const others = content.spawns.filter((s) => sectionAt(layout, s.x, s.y) !== BRIDGE).flatMap((s) => s.monsterIds);
    expect(others.filter((id) => id === 69).length / others.length).toBeLessThan(0.3);
  });

  it("shuts the sections by airlocks that open when both levers have been pulled, each lever once", () => {
    const { world, content } = shipOf();
    const party = createDefaultParty();
    const opened = new Set<string>();
    const ctx: ActionContext = { party, rootSeed: world.rootSeed, content, opened, monsterThemes: {}, tier: 5 };
    const doorUse = (a: ActionInstance) => {
      const out = use(a, ctx);
      for (const e of out.effects) if (e.type === "door" && e.uid) opened.add(e.uid);
      return out;
    };
    const door = content.actions.find((a) => a.kind === "door" && a.params.airlock === true)!;
    const [first, second] = content.actions.filter((a) => a.kind === "lever" && a.params.airlock === door.uid) as [ActionInstance, ActionInstance];
    expect(doorUse(door).effects[0]).toMatchObject({ text: expect.stringContaining("shut") });
    expect(doorUse(first).effects[0]).toMatchObject({ text: expect.stringContaining("still stands in place") });
    expect(doorUse(first).effects[0]).toMatchObject({ text: expect.stringContaining("stuck") });
    const out = doorUse(second);
    expect(out.effects[0]).toMatchObject({ text: expect.stringContaining("slowly opens") });
    expect(opened.has(door.uid)).toBe(true);
  });

  it("keeps ten crates in the storage bay: eight with pills or serum whose packaging never names the attribute, two with a power crystal the party carries away", () => {
    const { world, content, layout } = shipOf();
    const crates = content.actions.filter((a) => a.params.item === 301 || a.params.chest === 301);
    expect(crates).toHaveLength(10);
    expect(crates.every((c) => sectionAt(layout, c.x, c.y) === STORAGE_BAY)).toBe(true);
    const party = createDefaultParty();
    const opened = new Set<string>();
    const ctx: ActionContext = { party, rootSeed: world.rootSeed, content, opened, monsterThemes: {}, tier: 5 };
    // a pill: the question names the product, the hero the player picked gets the points
    const pill = crates.find((c) => c.kind === "chalice" && c.params.bonus === "attr")!;
    const ask = resolveAction(pill, ctx).effects[0]!;
    expect(ask.type).toBe("pick");
    const question = (ask as { question: string }).question;
    expect(question).toContain("You find a package with a single pill inside it. The packaging reads '");
    expect(question).toContain("Who wants to try the pill?");
    expect(question.toLowerCase()).not.toContain(String(pill.params.attr));
    const before = party.characters[0]![pill.params.attr as "str"];
    const done = resolveAction(pill, { ...ctx, hero: 0 });
    expect(done.effects.some((e) => e.type === "attribute" && e.character === 0 && e.amount === 15)).toBe(true);
    expect(party.characters[0]![pill.params.attr as "str"]).toBe(before + 15);
    // nobody chosen: nothing happens
    expect(resolveAction(pill, { ...ctx, hero: null }).effects).toEqual([]);
    const res = crates.find((c) => c.kind === "chalice" && c.params.bonus === "res")!;
    expect(resolveAction(res, { ...ctx, hero: 1 }).effects.some((e) => e.type === "resistance" && e.character === 1 && e.amount === 30)).toBe(true);
    const xp = crates.find((c) => c.kind === "chalice" && c.params.bonus === "xp")!;
    expect(String((resolveAction(xp, ctx).effects[0] as { question: string }).question)).toContain("serum");
    // a crystal in the crate: it lands in a backpack as a quest item
    const crystal = crates.find((c) => c.kind === "treasure")!;
    use(crystal, ctx);
    expect(carriedItems(party).some((i) => i.type === "quest_power_crystal")).toBe(true);
    // the emptied crate stays where it stands and still blocks its cell, like the others (it used to vanish with its pick-up)
    expect(heapGone(crystal, opened)).toBe(false);
  });

  it("leaves the cells round the console free, keeps the tube rooms empty of finds, spreads the crystals over rooms and never lets an object shut a passage", { timeout: 120_000 }, () => {
    for (const seed of ["ship-a", "ship-b", "ship-c", "ship-d"]) {
      const { content, map, layout } = shipOf(seed);
      // (the validation checks the console's free cells, the tube rooms and the spread of the crystals)
      expect(validateContent(map, content), seed).toEqual([]);
      const w = map.width;
      const holds = new Set(content.actions.filter((a) => a.kind !== "tube" && a.kind !== "door").map((a) => a.y * w + a.x));
      const open = (x: number, y: number) => map.cells[y * w + x] === CELL.FLOOR && !holds.has(y * w + x);
      // a blocking object stands in no passage: with its own cell open again, the ring of cells round it is whole (or it stands in a dead end)
      const blockers = content.actions.filter((o) => blocksCell(o) && o.kind !== "lever" && o.kind !== "lore");
      expect(blockers.length).toBeGreaterThan(25);
      for (const a of blockers) {
        expect(splitsRing((x, y) => (x === a.x && y === a.y) || open(x, y), a.x, a.y), `${seed}: ${a.uid} shuts a passage`).toBe(false);
      }
      expect(layout.console.front.y).toBe(layout.console.y + 1);
    }
  });

  it("mends the broken crystals with a power crystal: it is used up, life support turns the light on for the whole ship, the engine room makes the engines functional", () => {
    const { world, content } = shipOf();
    const party = createDefaultParty();
    const opened = new Set<string>();
    const ctx: ActionContext = { party, rootSeed: world.rootSeed, content, opened, monsterThemes: {}, tier: 5 };
    const broken = (reactor: string) => content.actions.find((a) => a.params.terminal === "crystal" && a.params.reactor === reactor)!;
    // without a crystal
    expect(resolveAction(broken("engine"), ctx).effects[0]).toMatchObject({ type: "text", text: expect.stringContaining("is broken") });
    giveItem(party, questItem("quest_power_crystal")!);
    giveItem(party, questItem("quest_power_crystal")!);
    // asked first, a no changes nothing
    expect(resolveAction(broken("life"), ctx).effects[0]).toMatchObject({ type: "confirm", question: expect.stringContaining("seems to have the same size like the broken one") });
    use(broken("life"), ctx, null);
    expect(opened.has(LIFE_FLAG)).toBe(false);
    expect(carriedItems(party).filter((i) => i.type === "quest_power_crystal")).toHaveLength(2);
    // a yes: the crystal is gone, the light comes on, and the sound of the light plays
    const life = use(broken("life"), ctx);
    expect(opened.has(LIFE_FLAG)).toBe(true);
    expect(life.effects.some((e) => e.type === "sound" && e.id === 9055)).toBe(true);
    expect(carriedItems(party).filter((i) => i.type === "quest_power_crystal")).toHaveLength(1);
    const engine = use(broken("engine"), ctx);
    expect(opened.has(ENGINE_CRYSTAL_FLAG)).toBe(true);
    expect(engine.effects.some((e) => e.type === "sound")).toBe(false);
    expect(carriedItems(party).filter((i) => i.type === "quest_power_crystal")).toHaveLength(0);
    // a mended crystal asks for nothing more
    expect(resolveAction(broken("engine"), ctx).effects[0]).toMatchObject({ type: "text" });
  });

  it("tells the ship's status and offers to start the engines once both systems work, then keeps them ready", () => {
    const { world, content } = shipOf();
    const party = createDefaultParty();
    const opened = new Set<string>();
    const ctx: ActionContext = { party, rootSeed: world.rootSeed, content, opened, monsterThemes: {}, tier: 5 };
    const status = content.actions.find((a) => a.params.terminal === "status")!;
    const text = (o: ActionOutcome) => String((o.effects[0] as { text?: string; question?: string }).text ?? (o.effects[0] as { question?: string }).question);
    expect(text(resolveAction(status, ctx))).toBe("Ship status:\nLife support: Emergency only\nEngines: Failure");
    opened.add(LIFE_FLAG);
    expect(text(resolveAction(status, ctx))).toContain("Life support: Functional");
    opened.add(ENGINE_CRYSTAL_FLAG);
    const ask = resolveAction(status, ctx);
    expect(ask.effects[0]).toMatchObject({ type: "confirm", question: expect.stringContaining("Engines: Functional") });
    expect(text(ask)).toContain("Would you like to activate the engines?");
    // a no leaves the engines off
    use(status, ctx, null);
    expect(opened.has(ENGINES_FLAG)).toBe(false);
    use(status, ctx);
    expect(opened.has(ENGINES_FLAG)).toBe(true);
    expect(text(resolveAction(status, ctx))).toBe("Ship status:\nLife support: Functional\nEngines: Ready");
  });

  it("lists the code words of the mini quests on computers of the control room, one for each level that has them", () => {
    const { content, layout } = shipOf();
    const codes = content.actions.filter((a) => a.params.terminal === "codes");
    const levels = [...new Set(layout.codeWords.map((c) => c.tier))];
    expect(levels.length).toBeGreaterThan(2);
    expect(codes.length).toBeGreaterThanOrEqual(levels.length);
    for (const c of codes) {
      expect(sectionAt(layout, c.x, c.y)).toBe(CONTROL_ROOM);
      expect(String(c.params.text).startsWith("Code words for surface entities\nLevel ")).toBe(true);
    }
    // every word of every place stands on a page
    const all = codes.map((c) => String(c.params.text)).join("\n");
    for (const place of layout.codeWords) for (const word of place.words) expect(all, `${place.place}: ${word}`).toContain(`'${word}'`);
  });

  it("starts the ending at the console of the bridge only with life support, the engines and the black key card", () => {
    const { world, content, layout } = shipOf();
    const consoleAction = content.actions.find((a) => a.params.terminal === "console")!;
    expect(sectionAt(layout, consoleAction.x, consoleAction.y)).toBe(BRIDGE);
    const party = createDefaultParty();
    const opened = new Set<string>();
    const ctx: ActionContext = { party, rootSeed: world.rootSeed, content, opened, monsterThemes: {}, tier: 5 };
    const ends = () => resolveAction(consoleAction, { ...ctx, answer: "yes" }).effects.some((e) => e.type === "ending");
    // nothing works yet
    expect(resolveAction(consoleAction, ctx).effects[0]).toMatchObject({ text: "Ship not fully operational" });
    expect(resolveAction(consoleAction, ctx).effects.some((e) => e.type === "sound" && e.id === 9014)).toBe(true);
    // the card alone does not do it, and neither do the systems alone
    giveItem(party, questItem("quest_black_keycard")!);
    expect(ends()).toBe(false);
    opened.add(LIFE_FLAG);
    opened.add(ENGINE_CRYSTAL_FLAG);
    expect(ends()).toBe(false);
    opened.add(ENGINES_FLAG);
    expect(ends()).toBe(true);
    // the heroes are asked before the card goes in: without an answer nothing ends, a no leaves everything as it was
    expect(resolveAction(consoleAction, ctx).effects.map((e) => e.type)).toEqual(["confirm"]);
    expect(resolveAction(consoleAction, { ...ctx, answer: null }).effects).toEqual([]);
    // the systems without the card: denied, with the slot's word
    const poor = createDefaultParty();
    const without = resolveAction(consoleAction, { ...ctx, party: poor });
    expect(without.effects.some((e) => e.type === "ending")).toBe(false);
    expect(without.effects[0]).toMatchObject({ text: expect.stringContaining("black key card") });
    // the tubes only lead back to the pyramid now
    const tube = content.actions.find((a) => a.kind === "tube")!;
    expect(resolveAction(tube, ctx).effects[0]).toMatchObject({ type: "transfer", mode: "poi_exit" });
  });
});
