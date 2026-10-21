import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMapContent, innStart, validateContent } from "../../src/actions";
import { itemIssues } from "../../src/actions/validate";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import { blocksCell } from "../../src/actions/registry";
import { plainProps } from "../../src/actions/rules";
import type { ActionInstance } from "../../src/actions/types";
import { seedFromString } from "../../src/core/rng";
import { DUNGEON_THEMES } from "../../src/data/dungeon-themes";
import { ITEM_RULES, allowedIn, isFunctional } from "../../src/data/item-rules";
import { BARREL_COINS, BARREL_EMPTY, VILLAGER_LINES, propLine } from "../../src/data/prop-texts";
import { MAP_ITEMS } from "../../src/data/tables";
import { TALENT_SELLERS, sellerParams } from "../../src/data/talent-sellers";
import { CELL, FACING_DELTA, generateInterior, type Facing } from "../../src/interiors";
import { placeOf } from "../../src/interiors/place";
import { createDefaultParty } from "../../src/sim/party";
import { BIOME, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";

const poiFor = (kind: Poi["kind"], i: number, tier = 1 + (i % 5)): Poi => ({ id: `p:t:${kind}:${i}`, kind, name: `${kind} ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: kind === "town" || kind === "castle" ? 2 : 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome: BIOME.MEADOW });
const world = new World("playtest18");
const SIDES: Facing[] = ["N", "E", "S", "W"];
const ASSETS = join(import.meta.dirname, "..", "..", "public", "assets");

describe("eighteenth playtest: the user's list of objects (items.xlsx)", () => {
  it("knows every object of the list, where it may stand and whether it must be of use", () => {
    expect(Object.keys(ITEM_RULES).length).toBe(128);
    // a lever, a chest, a barrel, a gate and the mascots always do something; a fountain, a statue and a well may be plain decoration
    for (const id of [1, 5, 39, 80, 81, 7, 72, 74, 96]) expect(isFunctional(id), `${id} ${ITEM_RULES[id]?.name}`).toBe(true);
    for (const id of [2, 27, 28, 29, 32, 91, 94, 95, 119]) expect(isFunctional(id), `${id} ${ITEM_RULES[id]?.name}`).toBe(false);
    expect(allowedIn(118, "cave")).toBe(true); // a gong stands in castles, dungeons and, by the user's correction (ADD_PLACES), caves
    expect(allowedIn(118, "town")).toBe(false);
    expect(allowedIn(52, "cave")).toBe(false); // a Lord in castles and towns
    expect(allowedIn(52, "town")).toBe(true);
    expect(allowedIn(5, "outside")).toBe(true);
    expect(allowedIn(9999, "town")).toBe(true); // what the list does not know is not restricted
  });

  it("keeps every theme's props and objects inside the list", () => {
    for (const t of DUNGEON_THEMES) {
      const places = t.klass === "C" ? (["spaceship"] as const) : t.kinds.map((k) => (k === "cave" ? "cave" : "dungeon") as "cave" | "dungeon");
      for (const place of places) {
        for (const p of plainProps(t)) {
          if (p === 5) continue; // a barrel is a container
          expect(allowedIn(p, place), `${t.id}: prop ${p} in a ${place}`).toBe(true);
          expect(isFunctional(p), `${t.id}: prop ${p} is plain decoration`).toBe(false);
        }
        expect(allowedIn(t.chest, place), `${t.id}: chest ${t.chest} in a ${place}`).toBe(true);
        if (t.shrine !== null) expect(allowedIn(t.shrine, place), `${t.id}: shrine ${t.shrine} in a ${place}`).toBe(true);
      }
    }
  });

  it("never puts an object where the list does not allow it, in any kind of place, and never a functional object as plain decoration", () => {
    let checked = 0;
    for (const kind of ["town", "castle", "cave", "dungeon"] as const) {
      for (let i = 0; i < 120; i++) {
        const poi = poiFor(kind, i);
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        expect(itemIssues(map, content), `${kind} #${i} (${placeOf(map)})`).toEqual([]);
        checked += content.actions.length;
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it("makes a barrel a container that gives coins or a joke, never plain scenery", () => {
    const party = createDefaultParty();
    const rootSeed = seedFromString("barrels");
    const ctx: ActionContext = { party, rootSeed, monsterThemes: { beast: 1 }, tier: 1 };
    const barrel = (gold: number): ActionInstance => ({ uid: `t#barrel:${gold}`, kind: "treasure", x: 1, y: 1, params: { chest: 5, level: 1, gold, items: 0 } });
    const empty = resolveAction(barrel(0), ctx);
    expect(empty.consumed).toBe(true);
    expect(BARREL_EMPTY).toContain((empty.effects[0] as { text: string }).text);
    expect(empty.effects.some((e) => e.type === "gold")).toBe(false);
    const coins = resolveAction(barrel(25), ctx);
    expect(BARREL_COINS).toContain((coins.effects[0] as { text: string }).text);
    expect(coins.effects[1]).toEqual({ type: "gold", amount: 25 });
    expect(BARREL_EMPTY.some((t) => t.includes("fermenting fish"))).toBe(true);
    // in a town and in the themes, a barrel stands as a treasure (a container), not as decoration
    const kinds = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const poi = poiFor("cave", i);
      const content = buildMapContent(world, poi, generateInterior(world, poi));
      for (const a of content.actions) if (a.params.item === 5 || a.params.chest === 5) kinds.add(a.kind);
    }
    expect([...kinds]).toEqual(["treasure"]);
  });
});

describe("eighteenth playtest: every object says what it is", () => {
  it("has a line for the objects the generator stands, and a plain description for the rest", () => {
    for (const id of [2, 5, 12, 16, 27, 28, 29, 32, 34, 61, 69, 83, 89, 91, 94, 95, 119, 45, 26, 33, 101]) {
      const text = propLine(id, "a");
      expect(text.length, `${id} ${MAP_ITEMS[id]?.name}`).toBeGreaterThan(10);
      expect(text, `${id}`).not.toMatch(/^You see an? object\.$/);
    }
    // several lines are chosen by the uid, the same one every time
    expect(propLine(2, "t#decor:3")).toBe(propLine(2, "t#decor:3"));
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((n) => propLine(91, n))).size).toBeGreaterThan(1);
    // an object without a line of its own still gets its name as a sentence
    expect(propLine(97, 0)).toMatch(/book|shelf/i);
    expect(propLine(78)).toBe("You see a bird's perch and by the reaction of your mascot companion it seems to be his.");
    // the town's villagers are funny and different
    expect(new Set(VILLAGER_LINES).size).toBe(VILLAGER_LINES.length);
    expect(VILLAGER_LINES.length).toBeGreaterThanOrEqual(20);
  });

  it("says the line of a decoration when it is used, one line per object", () => {
    const party = createDefaultParty();
    const ctx: ActionContext = { party, rootSeed: seedFromString("decor"), monsterThemes: { beast: 1 }, tier: 1 };
    const out = resolveAction({ uid: "t#decor_town:3", kind: "decor", x: 1, y: 1, params: { item: 91 } }, ctx);
    expect(out.effects).toEqual([{ type: "text", text: propLine(91, "t#decor_town:3") }]);
    expect(out.consumed).toBe(false);
  });
});

describe("eighteenth playtest: the streets of a town", () => {
  it("has no message on the floor: it speaks through an object or a person", () => {
    for (let i = 0; i < 200; i++) {
      const poi = poiFor("town", i);
      const content = buildMapContent(world, poi, generateInterior(world, poi));
      expect(content.actions.filter((a) => a.kind === "lore" && a.params.persona === undefined && a.params.object === undefined && a.params.item === undefined), `town #${i}`).toEqual([]);
    }
  });

  it("puts something in every dead end: a person, a barrel, scenery, a chest, a shop or the Crow's perch", () => {
    let deadEnds = 0;
    for (let i = 0; i < 160; i++) {
      const poi = poiFor("town", i);
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      const taken = new Set([...content.actions.map((a) => `${a.x},${a.y}`), ...content.spawns.map((s) => `${s.x},${s.y}`), ...(map.sites ?? []).filter((s) => s.kind === "perch").map((s) => `${s.x},${s.y}`)]);
      for (let y = 1; y < map.height - 1; y++) {
        for (let x = 1; x < map.width - 1; x++) {
          if (map.cells[y * map.width + x] !== CELL.FLOOR) continue;
          if (SIDES.filter((f) => map.cells[(y + FACING_DELTA[f].dy) * map.width + x + FACING_DELTA[f].dx] === CELL.FLOOR).length !== 1) continue;
          // the way in and out are no dead ends to fill
          if (Math.abs(x - map.spawn.x) <= 1 && Math.abs(y - map.spawn.y) <= 1) continue;
          if (Math.abs(x - map.exit.x) <= 1 && Math.abs(y - map.exit.y) <= 1) continue;
          deadEnds++;
          // a dead end can hold one thing that did not fit the plan (a blocked cell the rules turned down), so allow a rare empty one
          if (!taken.has(`${x},${y}`)) expect(deadEnds, `town #${i}: nothing at ${x},${y}`).toBe(-1);
        }
      }
    }
    expect(deadEnds).toBeGreaterThan(300);
  });

  it("shuts a pocket with chests by a gate that asks, with guards behind it that cannot get out", () => {
    let gates = 0;
    let guards = 0;
    for (let i = 0; i < 400; i++) {
      const poi = poiFor("town", i);
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      const doors = content.actions.filter((a) => a.kind === "door");
      gates += doors.length;
      guards += content.spawns.length;
      for (const d of doors) {
        expect(d.params.ask, d.uid).toBe(true);
        expect(d.params.locked, d.uid).toBe(false);
        // a gate sits in a straight street, between two walls
        const open = SIDES.filter((f) => map.cells[(d.y + FACING_DELTA[f].dy) * map.width + d.x + FACING_DELTA[f].dx] === CELL.FLOOR);
        expect(open, d.uid).toHaveLength(2);
        // and it asks before it opens
        const party = createDefaultParty();
        const ctx: ActionContext = { party, rootSeed: world.rootSeed, monsterThemes: {}, tier: poi.tier };
        expect(resolveAction(d, ctx).effects[0]).toMatchObject({ type: "confirm" });
        expect(resolveAction(d, { ...ctx, answer: "yes" }).effects[0]).toEqual({ type: "door", state: "opened" });
        expect(resolveAction(d, { ...ctx, answer: null }).effects).toEqual([]);
      }
      // the only monsters of a town are the guards of these pockets; the old towns' own kinds
      if (content.spawns.length > 0) {
        expect(doors.length, `town #${i}`).toBeGreaterThan(0);
        for (const s of content.spawns) for (const m of s.monsterIds) expect([4, 46, 64, 80, 49, 39, 29, 44, 25]).toContain(m);
      }
      expect(validateContent(map, content), `town #${i}`).toEqual([]);
    }
    expect(gates).toBeGreaterThan(80);
    expect(guards).toBeGreaterThan(40);
  });

  it("stands the guild's apprentice in every town, selling the membership of that town's guild", () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (let i = 0; i < 20; i++) {
        const poi = poiFor("town", i, tier);
        const content = buildMapContent(world, poi, generateInterior(world, poi));
        const apprentices = content.actions.filter((a) => a.kind === "talent" && String(a.params.talent).startsWith("guild_level_"));
        expect(apprentices.map((a) => a.params.talent), `tier ${tier} #${i}`).toEqual([`guild_level_${tier}`]);
        expect(apprentices[0]!.params.persona).toBe(50);
        expect(blocksCell(apprentices[0]!)).toBe(true);
      }
    }
    // the apprentice sells it: asks, takes the price, and the party is a member
    const party = createDefaultParty();
    party.gold = 1000;
    const apprentice: ActionInstance = { uid: "t#talents:0", kind: "talent", x: 1, y: 1, params: { talent: "guild_level_2", ...sellerParams("guild_level_2") } };
    const ctx: ActionContext = { party, rootSeed: world.rootSeed, monsterThemes: {}, tier: 2 };
    expect(resolveAction(apprentice, ctx).effects[0]).toMatchObject({ type: "confirm", question: expect.stringContaining("200 gold") });
    expect(resolveAction(apprentice, { ...ctx, answer: "yes" }).effects[0]).toEqual({ type: "talent", talent: "guild_level_2", price: 200 });
    expect(party.talents).toContain("guild_level_2");
    expect(party.gold).toBe(800);
    for (let level = 1; level <= 5; level++) expect(TALENT_SELLERS[`guild_level_${level}`], `guild ${level}`).toMatchObject({ persona: 50 });
  });
});

describe("eighteenth playtest: where a new game begins", () => {
  it("stands the party on the street in front of the inn of Starthaven with its back to the inn's door", () => {
    for (const seed of ["alpha", "ember", "kelp-mere-931", "pearl-wood-564", "test", "dune-keep-451"]) {
      const w = new World(seed);
      const town = w.poiById("p:0:0:0")!;
      const map = generateInterior(w, town);
      const content = buildMapContent(w, town, map);
      const spot = innStart(map, content);
      const inn = content.actions.find((a) => a.kind === "service" && a.params.service === "inn")!;
      expect(map.cells[spot.y * map.width + spot.x], seed).toBe(CELL.FLOOR);
      expect(content.actions.some((a) => blocksCell(a) && a.x === spot.x && a.y === spot.y), `${seed}: nothing in the way`).toBe(false);
      // the inn is one step behind the party: it looks away from the door
      const d = FACING_DELTA[spot.facing];
      expect([spot.x - d.dx, spot.y - d.dy], seed).toEqual([inn.x, inn.y]);
    }
  });
});

describe("eighteenth playtest: the map symbols and the ground pictures", () => {
  it("has one sheet for the symbols, with every symbol the map draws and the colours of the grounds", () => {
    const register = JSON.parse(readFileSync(join(ASSETS, "ui", "minimap.json"), "utf-8")) as { cell: number; icons: Record<string, unknown>; tints: Record<string, number[]> };
    for (const name of ["ground", "mountain", "trees", "palms", "wall", "floor", "water", "door", "door_open", "event", "info", "persona", "trap", "maptransfer", "inn", "training", "tavern", "smith", "temple", "bank", "guild", "unknown", "pos1", "pos2"]) {
      expect(register.icons[name], name).toBeDefined();
    }
    for (const name of ["grass", "desert", "dirt", "floor", "lava", "swamp", "cobble", "snow"]) expect(register.tints[name], name).toHaveLength(3);
    // the 38 single files are not shipped any more
    expect(() => readFileSync(join(ASSETS, "icons", "minimap", "tex_mm_inn.webp"))).toThrow();
  });
});
