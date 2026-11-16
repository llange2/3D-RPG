import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import { BRIDGE, COMPUTER_ITEM, CONSOLE_ITEM, TEMPORAL_ITEM } from "../../src/data/quest-table";
import { allowedIn } from "../../src/data/item-rules";
import { analyzeTopology, generateInterior, planDungeon } from "../../src/interiors";
import { BRIDGE_BONES_TEXT, BRIDGE_H, BRIDGE_TERMINAL_TEXT, BRIDGE_TOKENS, BRIDGE_W, TEMPORAL_GENERATOR_TEXT, bridgeCells, bridgeFeature, bridgeFeatures } from "../../src/interiors/bridge";
import { roundCorners } from "../../src/interiors/roundCorners";
import { sectionAt } from "../../src/interiors/spaceship";
import { CELL } from "../../src/interiors/types";
import { createDefaultParty } from "../../src/sim/party";
import { World } from "../../src/world/world";

const SEEDS = ["ship-a", "ship-b", "ship-c", "ship-d", "jade-shore-568"];

const shipOf = (seed: string, section = 0) => {
  const world = new World(seed, "default");
  // (the pyramid that opens the section: the five pyramids are given to the sections by the plan of the world)
  const poi = world.allPois().find((p) => planDungeon(world, p)?.klass === "C" && planDungeon(world, p)?.section === section)!;
  const map = generateInterior(world, poi);
  return { world, poi, map, content: buildMapContent(world, poi, map), layout: map.spaceship! };
};

describe("the bridge of the spaceship (quest document 1.9)", () => {
  it("is the document's grid of 22 x 7 cells and holds the things of its legend", () => {
    expect(BRIDGE_TOKENS.length).toBe(BRIDGE_H);
    for (const row of BRIDGE_TOKENS) expect(row.length).toBe(BRIDGE_W);
    const count = (thing: string) => bridgeFeatures().filter((f) => f.thing === thing).length;
    expect({ MT: count("MT"), MA: count("MA"), SK: count("SK"), TE: count("TE"), TG: count("TG"), CO: count("CO"), CD: count("CD"), CL: count("CL"), LE: count("LE"), LC: count("LC"), DEN: count("DEN") }).toEqual({
      MT: 7,
      MA: 2,
      SK: 5,
      TE: 1,
      TG: 1,
      CO: 1,
      CD: 3,
      CL: 1,
      LE: 1,
      LC: 1,
      DEN: 1,
    });
    // a corner of a room (floor on two sides at a right angle) is floor and round, the caps of the corridor with the lever and the tube are wall
    const cells = bridgeCells();
    for (const [x, y] of [[1, 1], [1, 5], [9, 5]] as const) expect(cells[y]![x], `CI at ${x},${y}`).toBe(CELL.FLOOR);
    for (const [x, y] of [[18, 1], [20, 1], [18, 5], [20, 5]] as const) expect(cells[y]![x], `CI cap at ${x},${y}`).toBe(CELL.SOLID);
    expect(cells[3]![2], "the console stands on floor").toBe(CELL.FLOOR);
  });

  it("stands the same in every world, with everything on the cell the document names, and passes the validation", { timeout: 120_000 }, () => {
    for (const seed of SEEDS) {
      const { map, content, layout } = shipOf(seed);
      const b = layout.bridge;
      expect([b.w, b.h]).toEqual([BRIDGE_W, BRIDGE_H]);
      const cells = bridgeCells();
      for (let y = 0; y < BRIDGE_H; y++) for (let x = 0; x < BRIDGE_W; x++) expect(map.cells[(b.y + y) * map.width + b.x + x], `${seed} cell ${x},${y}`).toBe(cells[y]![x]);
      // every robot alone on its cell: seven terminators and two Titanic Automatos
      const at = (thing: Parameters<typeof bridgeFeature>[0]) => ({ x: b.x + bridgeFeature(thing).x, y: b.y + bridgeFeature(thing).y });
      for (const f of bridgeFeatures().filter((o) => o.thing === "MT" || o.thing === "MA")) {
        const spawn = content.spawns.find((s) => s.x === b.x + f.x && s.y === b.y + f.y)!;
        expect(spawn.monsterIds, `${seed} ${f.thing} at ${f.x},${f.y}`).toEqual([f.thing === "MT" ? 69 : 88]);
      }
      expect(content.spawns.filter((s) => sectionAt(layout, s.x, s.y) === BRIDGE).length).toBe(9);
      // the console in the middle of the western room, a terminator on each of its four sides, its front the cell to the south
      expect(layout.console).toMatchObject({ ...at("CO"), front: { x: at("CO").x, y: at("CO").y + 1 } });
      for (const d of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) expect(content.spawns.some((s) => s.x === layout.console.x + d[0] && s.y === layout.console.y + d[1] && s.monsterIds[0] === 69)).toBe(true);
      // the way in is the tube at the end of the corridor, the party arrives in front of it and looks north
      expect(layout.tubes[BRIDGE]).toMatchObject({ ...at("DEN"), front: { x: at("DEN").x, y: at("DEN").y - 1 }, facing: "N" });
      // the airlock to the control room at the east end, its lever at the other end of the corridor
      expect(layout.locks[0]).toMatchObject({ door: at("LC"), a: at("LE"), from: BRIDGE });
      expect(content.actions.filter((a) => a.kind === "lever" && a.x === at("LE").x && a.y === at("LE").y).length).toBe(1);
      expect(validateContent(map, content), seed).toEqual([]);
      const topo = analyzeTopology(map);
      expect(topo.reachableFloor, seed).toBe(topo.totalFloor);
    }
  });

  it("holds the computer terminal with the message, the generator that is offline, the bone piles and three sliding doors", () => {
    const { content, layout } = shipOf("ship-a");
    const b = layout.bridge;
    const on = (thing: Parameters<typeof bridgeFeature>[0]) => content.actions.find((a) => a.x === b.x + bridgeFeature(thing).x && a.y === b.y + bridgeFeature(thing).y)!;
    const terminal = on("TE");
    expect(terminal).toMatchObject({ kind: "lore", params: { item: COMPUTER_ITEM, text: BRIDGE_TERMINAL_TEXT } });
    expect(BRIDGE_TERMINAL_TEXT.startsWith("To whomever might find this.")).toBe(true);
    expect(BRIDGE_TERMINAL_TEXT.endsWith("I am afraid that I do not have much longer.")).toBe(true);
    expect(BRIDGE_TERMINAL_TEXT.split("\n\n").length).toBe(4);
    const generator = on("TG");
    expect(generator).toMatchObject({ kind: "lore", params: { item: TEMPORAL_ITEM, text: TEMPORAL_GENERATOR_TEXT } });
    expect(TEMPORAL_GENERATOR_TEXT).toBe("Temporal field generator offline");
    const piles = content.actions.filter((a) => a.kind === "decor" && a.params.item === 70);
    expect(piles.length).toBe(5);
    expect(new Set(piles.map((p) => p.params.text))).toEqual(new Set([BRIDGE_BONES_TEXT]));
    expect(BRIDGE_BONES_TEXT).toBe("Ordinary human remains, except that the clothing looks like something you have never seen before.");
    // reading them shows the words (decoration: nothing else happens, nothing is used up)
    const party = createDefaultParty();
    const ctx: ActionContext = { party, rootSeed: new World("ship-a", "default").rootSeed, content, opened: new Set(), monsterThemes: {}, tier: 5 };
    for (const a of [terminal, generator, piles[0]!]) expect(resolveAction(a, ctx)).toMatchObject({ effects: [{ type: "text", text: a.params.text }], consumed: false });
    const doors = content.actions.filter((a) => a.kind === "door" && a.x >= b.x && a.x < b.x + b.w && a.y >= b.y && a.y < b.y + b.h);
    expect(doors.filter((d) => d.params.slide === true).length).toBe(3);
    // the object list allows the piles in a spaceship (the user's correction), and nothing else of the bridge is forbidden there
    expect(allowedIn(70, "spaceship")).toBe(true);
    expect(CONSOLE_ITEM).toBe(303);
  });

  it("has a locked door to the generator room: it says so, asks, and the lock is the lightest there is", () => {
    const { content, layout, world } = shipOf("ship-a");
    const b = layout.bridge;
    const lock = content.actions.find((a) => a.kind === "door" && a.params.locked === true)!;
    expect({ x: lock.x - b.x, y: lock.y - b.y }).toEqual({ x: bridgeFeature("CL").x, y: bridgeFeature("CL").y });
    expect(lock.params).toMatchObject({ ask: true, trivial: true, axis: "y" });
    // no robot opens it: it has no `slide`
    expect(lock.params.slide).toBeUndefined();
    const party = createDefaultParty();
    const ctx: ActionContext = { party, rootSeed: world.rootSeed, content, opened: new Set(), monsterThemes: {}, tier: 5 };
    const asked = resolveAction(lock, ctx);
    expect(asked.effects[0]).toMatchObject({ type: "confirm", title: "Locked door" });
    expect(resolveAction(lock, { ...ctx, answer: null }).consumed).toBe(false);
    // a party of level 1 and one of level 40 pick it alike (the lock stays at difficulty 1)
    for (const level of [1, 40]) {
      const strong = createDefaultParty();
      for (const c of strong.characters) c.level = level;
      const out = resolveAction(lock, { ...ctx, party: strong, answer: "yes" });
      expect(out.effects.some((e) => e.type === "door" && e.state === "unlocked"), `level ${level}`).toBe(true);
    }
  });

  it("rounds the corners of the document and keeps the corners at its doors and under the generator and the terminal square", () => {
    const { map, layout } = shipOf("ship-a");
    const b = layout.bridge;
    const rounded = new Map(roundCorners(map).map((c) => [`${c.x - b.x},${c.y - b.y}`, c.kind]));
    // the walls of the document that are rounded outside (CO1 to CO4) and the corners of its rooms (CI): the model of the engine stands there
    for (let y = 0; y < BRIDGE_H; y++) {
      for (let x = 0; x < BRIDGE_W; x++) {
        const t = BRIDGE_TOKENS[y]![x]!;
        if (/^CO[1-4]$/.test(t)) expect(rounded.get(`${x},${y}`), `${t} at ${x},${y}`).toBe("outer");
      }
    }
    for (const k of ["1,1", "1,5", "9,5"]) expect(rounded.get(k), `corner ${k}`).toBe("inner");
    // not beside a door (the frame stands in a straight wall) and not on the generator or the terminal
    for (const f of bridgeFeatures()) {
      if (f.thing === "TG" || f.thing === "TE") expect(rounded.has(`${f.x},${f.y}`), f.thing).toBe(false);
      if (f.thing === "CD" || f.thing === "CL") for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) expect(rounded.has(`${f.x + dx},${f.y + dy}`), `beside ${f.thing} at ${f.x},${f.y}`).toBe(false);
    }
  });

  it("shows one line of the old secret on the computers of the other sections, the new last log entry among them", () => {
    const lines = new Set<string>();
    for (const seed of SEEDS) {
      const { content } = shipOf(seed);
      for (const a of content.actions) if (a.kind === "lore" && a.params.item === COMPUTER_ITEM && typeof a.params.text === "string" && a.params.terminal === undefined) lines.add(String(a.params.text));
    }
    expect([...lines].some((l) => l.includes("THE WORLD IS A GAME"))).toBe(false);
    expect([...lines].some((l) => l === "Last log entry: 'An unknown anomaly from the planet has been detected and has affected our systems. Update follows.'")).toBe(true);
  });

  it("is the same level behind every pyramid: the party arrives at the bridge's tube facing north, at the others' facing south", () => {
    for (const section of [0, 1, 2, 3, 4]) {
      const { map, layout } = shipOf("ship-a", section);
      const tube = layout.tubes[section]!;
      expect(map.spawn).toMatchObject({ x: tube.front.x, y: tube.front.y, facing: section === BRIDGE ? "N" : "S" });
      expect(map.exit).toEqual({ x: tube.x, y: tube.y });
    }
  });
});
