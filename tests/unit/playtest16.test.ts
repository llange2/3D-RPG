import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { seedFromString } from "../../src/core/rng";
import { ITEM_RULES } from "../../src/data/item-rules";
import { TALENT_SELLERS } from "../../src/data/talent-sellers";
import { TALENTS } from "../../src/data/tables";
import { TOWN_BLUEPRINTS } from "../../src/data/town-blueprints";
import { identifyLines } from "../../src/game/identify";
import { CELL, generateInterior, planDungeon } from "../../src/interiors";
import { blueprintFor } from "../../src/interiors/town";
import { monsterBoost } from "../../src/render/monsters";
import { brokenWallModelKeys } from "../../src/render/interiorView";
import { createDefaultParty } from "../../src/sim/party";
import { BIOME, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";

const poiFor = (kind: Poi["kind"], i: number, tier = 1 + (i % 5)): Poi => ({ id: `p:t:${kind}:${i}`, kind, name: `${kind} ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome: BIOME.MEADOW });

describe("sixteenth playtest: doors", () => {
  const world = new World("playtest16");

  it("never puts two doors (or a door and a gate) on neighbouring cells (point 8)", () => {
    let doors = 0;
    for (let i = 0; i < 80; i++) {
      for (const kind of ["dungeon", "castle"] as const) {
        const poi = poiFor(kind, i);
        const list = buildMapContent(world, poi, generateInterior(world, poi)).actions.filter((a) => a.kind === "door");
        doors += list.length;
        for (const a of list) for (const b of list) if (a !== b) expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), `${kind} ${i}: doors ${a.uid} and ${b.uid}`).toBeGreaterThanOrEqual(2);
      }
    }
    expect(doors).toBeGreaterThan(200);
  });
});

describe("sixteenth playtest: chests and props", () => {
  const world = new World("playtest16-props");

  it("never shows the object of a theme's chest or shrine as a plain prop (point 4: a chest that gives nothing)", () => {
    let props = 0;
    for (let i = 0; i < 120; i++) {
      for (const kind of ["dungeon", "cave"] as const) {
        const poi = poiFor(kind, i);
        const map = generateInterior(world, poi);
        const theme = map.dungeon?.look;
        if (!theme) continue;
        for (const a of buildMapContent(world, poi, map).actions) {
          if (a.kind !== "decor") continue;
          props++;
          expect(a.params.item, `${poi.id} ${a.uid} in ${theme.id}`).not.toBe(theme.chest);
          expect(a.params.item, `${poi.id} ${a.uid} in ${theme.id}`).not.toBe(theme.shrine);
        }
      }
    }
    expect(props).toBeGreaterThan(150);
  });
});

describe("sixteenth playtest: the wall that can be broken (point 2)", () => {
  const world = new World("playtest16-walls");

  it("leaves a model where the wall stood: the cracked wall in a dungeon, the broken city wall in a town, nothing in a castle or a cave", () => {
    const found = new Map<string, string[]>();
    for (let i = 0; i < 200 && found.size < 3; i++) {
      for (const kind of ["dungeon", "town", "castle", "cave"] as const) {
        const poi = poiFor(kind, i);
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        if (!content.actions.some((a) => a.kind === "breakable_wall") || found.has(kind)) continue;
        found.set(kind, brokenWallModelKeys(map, content));
      }
    }
    expect(found.get("dungeon")).toEqual(["blk_cracked_wall"]);
    expect(found.get("town")).toEqual(["blk_city_cracked"]);
    // a castle or a cave leaves a plain opening
    for (const kind of ["castle", "cave"]) if (found.has(kind)) expect(found.get(kind)).toEqual([]);
  });

  it("sits on a wall cell with a street or a corridor on both sides, and breaks into a floor cell", () => {
    let walls = 0;
    for (let i = 0; i < 100; i++) {
      for (const kind of ["dungeon", "town"] as const) {
        const poi = poiFor(kind, i);
        const map = generateInterior(world, poi);
        for (const a of buildMapContent(world, poi, map).actions.filter((x) => x.kind === "breakable_wall")) {
          walls++;
          expect([CELL.SOLID, CELL.BUILDING]).toContain(map.cells[a.y * map.width + a.x]);
          const open = (dx: number, dy: number) => map.cells[(a.y + dy) * map.width + a.x + dx] === CELL.FLOOR;
          expect((open(1, 0) && open(-1, 0)) || (open(0, 1) && open(0, -1)), `${poi.id} ${a.uid}`).toBe(true);
          expect(a.params.axis === "x" ? open(1, 0) && open(-1, 0) : open(0, 1) && open(0, -1)).toBe(true);
        }
      }
    }
    expect(walls).toBeGreaterThan(20);
  });
});

describe("sixteenth playtest: the towns of the old game (point 3)", () => {
  const world = new World("playtest16-towns");

  it("has one ground plan per tier, from Fountain Head to Blistering Heights", () => {
    expect(TOWN_BLUEPRINTS.map((b) => [b.tier, b.name])).toEqual([[1, "Fountain Head"], [2, "Baywatch"], [3, "Wildabar"], [4, "Swamp Town"], [5, "Blistering Heights"]]);
    for (const b of TOWN_BLUEPRINTS) expect(blueprintFor(b.tier)).toBe(b);
    // not square, and not made of identical blocks: the old towns are 16 to 18 cells a side
    for (const b of TOWN_BLUEPRINTS) {
      const w = Math.max(...b.rows.map((r) => r.length));
      expect(w).toBeGreaterThanOrEqual(16);
      expect(b.rows.length).toBeGreaterThanOrEqual(16);
      expect(w).toBeLessThanOrEqual(18);
      expect(b.rows.length).toBeLessThanOrEqual(18);
    }
    expect(TOWN_BLUEPRINTS.filter((b) => Math.max(...b.rows.map((r) => r.length)) !== b.rows.length).length).toBeGreaterThan(0);
  });

  it("sells the talents of the old towns: the cartographer in tier 1, the pathfinder and cave explorer in tier 2, the sailor, weapon master and body builder in tier 3", () => {
    const sold = (tier: number) =>
      buildMapContent(world, poiFor("town", tier, tier), generateInterior(world, poiFor("town", tier, tier)))
        .actions.filter((a) => a.kind === "talent")
        .map((a) => String(a.params.talent))
        .sort();
    // and, since the seventeenth session, the apprentice of the town's guild in every one of them (`guild_level_<tier>`)
    expect(sold(1)).toEqual(["guild_level_1", "talent_cartographer"]);
    expect(sold(2)).toEqual(["guild_level_2", "talent_cave_explorer", "talent_pathfinder"]);
    expect(sold(3)).toEqual(["guild_level_3", "talent_arms_master", "talent_body_builder", "talent_seafarer"]);
    expect(sold(4)).toEqual(["guild_level_4"]);
    expect(sold(5)).toEqual(["guild_level_5"]);
  });

  it("builds every town of every tier into a playable map, turned every way", () => {
    const turns = new Set<string>();
    for (let tier = 1; tier <= 5; tier++) {
      for (let i = 0; i < 40; i++) {
        const poi = poiFor("town", i, tier);
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        expect(validateContent(map, content), `tier ${tier} #${i}`).toEqual([]);
        turns.add(`${tier}:${map.width}x${map.height}:${map.spawn.facing}`);
      }
    }
    // five plans, each seen upright and on its side, facing more than one way
    expect(turns.size).toBeGreaterThanOrEqual(15);
  });

  it("knows who sells every talent of a plan or a theme", () => {
    for (const b of TOWN_BLUEPRINTS) for (const t of b.talents) expect(TALENT_SELLERS[t.talent], t.talent).toBeDefined();
    for (const id of Object.keys(TALENT_SELLERS)) expect(TALENTS[id], id).toBeDefined();
  });

  const rootSeed = seedFromString("playtest16");
  const ctx = (party: ReturnType<typeof createDefaultParty>, answer?: string | null): ActionContext => ({ party, rootSeed, monsterThemes: { beast: 1 }, tier: 1, ...(answer !== undefined ? { answer } : {}) });
  const seller = (talent: string): ActionInstance => ({ uid: `t#talent:${talent}`, kind: "talent", x: 1, y: 1, params: { talent, text: "I am Cypher.", persona: 48 } });

  it("asks before it sells, takes the price once and then says the talent is already there", () => {
    const party = createDefaultParty();
    party.gold = 500;
    const asked = resolveAction(seller("talent_cartographer"), ctx(party));
    expect(asked.effects[0]).toMatchObject({ type: "confirm", title: "Cartographer", question: expect.stringContaining("Become Cartographer for 50 gold?") });
    expect(party.gold).toBe(500);
    // declined
    expect(resolveAction(seller("talent_cartographer"), ctx(party, null)).effects).toEqual([]);
    expect(party.talents).not.toContain("talent_cartographer");
    // bought
    const bought = resolveAction(seller("talent_cartographer"), ctx(party, "yes"));
    expect(bought.effects[0]).toEqual({ type: "talent", talent: "talent_cartographer", price: 50 });
    expect(party.gold).toBe(450);
    expect(party.talents).toContain("talent_cartographer");
    // there is nothing more to sell
    const again = resolveAction(seller("talent_cartographer"), ctx(party));
    expect(again.effects[0]).toMatchObject({ type: "text", text: expect.stringContaining("already") });
    expect(party.gold).toBe(450);
  });

  it("does not sell to a party that cannot pay", () => {
    const party = createDefaultParty();
    party.gold = 100;
    const r = resolveAction(seller("talent_pathfinder"), ctx(party, "yes"));
    expect(r.effects[0]).toMatchObject({ type: "text", text: expect.stringContaining("cannot afford") });
    expect(party.gold).toBe(100);
    expect(party.talents).not.toContain("talent_pathfinder");
  });
});

describe("sixteenth playtest: the caves that sell talents (point 3), changed by the seventeenth session", () => {
  it("sells no talent in any cave any more: orientation, perception and swimming are sold by the rusty caravans near the towns of tier 1, the lords stand in castles", () => {
    for (const talent of ["talent_orientation", "talent_perceptive", "talent_swimmer"]) expect(TALENT_SELLERS[talent], talent).toMatchObject({ item: 26 });
    expect(TALENT_SELLERS.talent_prayer_master).toMatchObject({ persona: 52 });
    // the user's object list: a person (Lord) stands in castles and towns only, a head statue in no cave
    expect(ITEM_RULES[52]!.places).not.toContain("cave");
  });

  it("stands the lords in castles, one in about every second castle, in a dead end", () => {
    const world = new World("playtest16-lords");
    let castles = 0;
    let lords = 0;
    for (let i = 0; i < 80; i++) {
      const poi = poiFor("castle", i);
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      castles++;
      for (const a of content.actions.filter((x) => x.kind === "talent")) {
        lords++;
        expect(["talent_prayer_master", "talent_prestidigitator"]).toContain(a.params.talent);
        expect(a.params.persona).toBe(52);
      }
      expect(validateContent(map, content), `castle ${i}`).toEqual([]);
    }
    expect(lords).toBeGreaterThan(castles / 4);
    expect(lords).toBeLessThan(castles);
  });
});

describe("sixteenth playtest: monsters under the torch (point 5)", () => {
  it("lifts the nearly black textures towards a common brightness and leaves the rest as it was", () => {
    expect(monsterBoost(0.6)).toBe(1.3);
    expect(monsterBoost(0.3)).toBe(1.3);
    expect(monsterBoost(0.1)).toBeGreaterThan(3);
    expect(monsterBoost(0.01)).toBeLessThanOrEqual(3.2);
    expect(monsterBoost(undefined)).toBe(1.3);
  });
});

describe("sixteenth playtest: the debug menu's Identify (point 9)", () => {
  it("tells which old map a cave or a dungeon is built after, who lives there and what it asks for and holds", () => {
    const world = new World("playtest16-identify");
    let themed = 0;
    for (let i = 0; i < 60 && themed < 8; i++) {
      const poi = poiFor(i % 2 === 0 ? "cave" : "dungeon", i);
      const ref = planDungeon(world, poi);
      if (!ref) continue;
      themed++;
      const lines = identifyLines(poi, ref);
      expect(lines[0]).toBe(poi.name);
      const text = lines.join("\n");
      expect(text).toContain(`Quest: ${ref.quest}, layout ${ref.layout}`);
      expect(text).toMatch(/Class: [ABC]/);
      expect(text).toContain("Quest: ");
      expect(text).toContain("Entrance asks for: ");
      expect(text).toContain("Monsters: ");
    }
    expect(themed).toBe(8);
    // towns and castles have no theme
    expect(identifyLines(poiFor("town", 1), null).join("\n")).toContain("No quest");
  });
});
