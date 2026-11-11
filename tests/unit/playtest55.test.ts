/** The 55th playtest (11. 11. 2026): damage changes in the item tooltip, castles' side rooms, the artifacts and their henchmen, Seth's hint, the quartermaster, health, keys, Dragon Breath. */
import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { emptyRooms } from "../../src/actions/castle";
import { resolveAction } from "../../src/actions/handlers";
import { Rng } from "../../src/core/rng";
import { ARTIFACTS_PER_KIND, ARTIFACT_TYPE } from "../../src/data/keepers";
import { QUARTERMASTER_PERSONA, STORAGE_FEE } from "../../src/data/town-people";
import { generateInterior } from "../../src/interiors";
import { worldQuestLog } from "../../src/game/questLog";
import { actionOf, defaultKeys, parseKeys } from "../../src/game/keybindings";
import { averageDamageLines } from "../../src/sim/combat";
import { healCost } from "../../src/sim/economy";
import { createEncounter, createMonster, closestInCone, type GridView } from "../../src/sim/encounter";
import { makeItem } from "../../src/sim/items";
import { createDefaultParty } from "../../src/sim/party";
import { packEntries, retrieveItem, storeItem, storedItems } from "../../src/sim/quartermaster";
import { castSpell } from "../../src/sim/spells";
import { BIOME, type Poi, type PoiKind } from "../../src/world/types";
import { World } from "../../src/world/world";

const world = new World("playtest-55", "default", "default");

function poiFor(kind: PoiKind, i: number, tier = 1 + (i % 5)): Poi {
  return { id: `p:t55:${kind}:${i}`, kind, name: `${kind} ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome: BIOME.MEADOW };
}

describe("point 1: the average damage line shows the change to what the hero hits for now", () => {
  it("has a positive change for a better weapon, none for one that is worn already", () => {
    const party = createDefaultParty();
    const hero = party.characters[0]!;
    const sword = makeItem({ name: "Mighty sword", type: "1h_long_sword" });
    sword.bonus.dam_min = 40;
    sword.bonus.dam_max = 60;
    const lines = averageDamageLines(hero, sword, null, false);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.change).toBeGreaterThan(0);
    expect(lines[0]!.value).toBeGreaterThan(lines[0]!.change);
    expect(averageDamageLines(hero, sword, null, true)[0]!.change).toBe(0);
  });
});

describe("point 6: the temple's healing costs by the hero's level", () => {
  it("is multiplied by the level", () => {
    const party = createDefaultParty();
    const hero = party.characters[0]!;
    hero.hp = 1;
    hero.level = 1;
    const one = healCost(hero, 2, party);
    hero.level = 4;
    expect(healCost(hero, 2, party)).toBe(one * 4);
  });
});

describe("point 15: closest means the fewest steps to reach the party", () => {
  const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };
  it("prefers a monster on the diagonal that is two steps nearer over one straight ahead that is farther away", () => {
    const enc = createEncounter();
    // the party at 5/5 looks north: straight ahead at 5/1 (four steps), on the diagonal at 7/3 (three steps)
    enc.monsters.push(createMonster("straight", 1, 5, 1), createMonster("diagonal", 1, 7, 3));
    expect(closestInCone(open, enc, 5, 5, 0, -1)?.uid).toBe("diagonal");
  });

  it("still takes the one straight ahead when it needs the fewest steps", () => {
    const enc = createEncounter();
    enc.monsters.push(createMonster("straight", 1, 5, 3), createMonster("diagonal", 1, 8, 2));
    expect(closestInCone(open, enc, 5, 5, 0, -1)?.uid).toBe("straight");
  });
});

describe("point 9: the key I opens the party info", () => {
  it("is bound to the talents screen (the party info tab), C stays with the inventory", () => {
    const keys = defaultKeys();
    expect(actionOf(keys, "i")).toBe("talents");
    expect(actionOf(keys, "t")).toBe("talents");
    expect(actionOf(keys, "c")).toBe("inventory");
  });

  it("moves the old pair of defaults of a stored setting over, and leaves a changed binding alone", () => {
    expect(actionOf(parseKeys({ inventory: ["i", "c"], talents: ["t"] }), "i")).toBe("talents");
    expect(actionOf(parseKeys({ inventory: ["i"], talents: ["t"] }), "i")).toBe("inventory");
  });
});

describe("point 16: Dragon Breath carries the element the caster picks", () => {
  it("uses the chosen element, and one of the four elements without a choice", () => {
    const party = createDefaultParty();
    const hero = party.characters[0]!;
    hero.spells.push(50);
    hero.sp = hero.mana = 5000;
    for (const element of ["acid", "fire", "ice", "magic"] as const) {
      const result = castSpell(party, 0, 50, new Rng([1, 2, 3, 4]), { element });
      expect(result.kind).toBe("attack");
      if (result.kind === "attack") expect(result.type).toBe(element);
    }
    const free = castSpell(party, 0, 50, new Rng([1, 2, 3, 4]));
    expect(free.kind === "attack" && ["acid", "fire", "ice", "magic"].includes(free.type)).toBe(true);
  });
});

describe("point 14: the quartermaster keeps things for 1000 gold a piece", () => {
  it("takes the item for the fee, gives it back for nothing and refuses a party without the gold", () => {
    const party = createDefaultParty();
    party.gold = 2500;
    const item = makeItem({ name: "Old boot", type: "boots" });
    party.characters[0]!.inventory["slot1"] = item;
    const first = packEntries(party)[0]!;
    const stored = storeItem(party, first.bag, first.slot);
    expect(stored.ok).toBe(true);
    expect(party.gold).toBe(2500 - STORAGE_FEE);
    expect(storedItems(party)).toHaveLength(1);
    expect(party.characters[0]!.inventory["slot1"]).toBeNull();
    const back = retrieveItem(party, 0);
    expect(back.ok).toBe(true);
    expect(storedItems(party)).toHaveLength(0);
    expect(party.gold).toBe(2500 - STORAGE_FEE);
    party.gold = 10;
    const again = packEntries(party)[0]!;
    expect(storeItem(party, again.bag, again.slot)).toEqual({ ok: false, reason: "gold" });
  });
});

describe("points 13 and 14: the people the plan puts in the towns", () => {
  const towns = world.allPois().filter((p) => p.kind === "town");
  const contents = new Map(towns.map((t) => [t.id, buildMapContent(world, t, generateInterior(world, t))]));

  it("has a person in every town of level 2 who names the dungeon of Seth Squirm with its position", () => {
    const home = world.allPois().find((p) => world.dungeonRef(p.id)?.seth === true)!;
    const second = towns.filter((t) => t.tier === 2);
    expect(second.length).toBeGreaterThan(0);
    for (const t of second) {
      const hint = contents.get(t.id)!.actions.find((a) => a.uid.includes("#sethhint:"));
      expect(hint, t.name).toBeDefined();
      expect(String(hint!.params.text)).toContain(home.name);
      expect(String(hint!.params.text)).toContain(`${home.x}/${home.y}`);
    }
    for (const t of towns.filter((x) => x.tier !== 2)) expect(contents.get(t.id)!.actions.some((a) => a.uid.includes("#sethhint:"))).toBe(false);
  });

  it("has the quartermaster in exactly one town of level 3, with two stacks of his goods beside him", () => {
    const withQm = towns.filter((t) => contents.get(t.id)!.actions.some((a) => a.kind === "quartermaster"));
    expect(withQm).toHaveLength(1);
    expect(withQm[0]!.tier).toBe(3);
    const actions = contents.get(withQm[0]!.id)!.actions;
    const qm = actions.find((a) => a.kind === "quartermaster")!;
    expect(qm.params.persona).toBe(QUARTERMASTER_PERSONA);
    const goods = actions.filter((a) => a.uid.includes("#quartermaster-goods:"));
    expect(goods).toHaveLength(2);
    for (const g of goods) {
      expect(Math.abs(g.x - qm.x) + Math.abs(g.y - qm.y)).toBe(1);
      expect(g.params.text).toBe("This belongs to the quartermaster. You better talk to him directly.");
    }
  });

  it("answers a talk with the quartermaster by opening his window", () => {
    const withQm = towns.find((t) => contents.get(t.id)!.actions.some((a) => a.kind === "quartermaster"))!;
    const qm = contents.get(withQm.id)!.actions.find((a) => a.kind === "quartermaster")!;
    const outcome = resolveAction(qm, { party: createDefaultParty(), rootSeed: world.rootSeed, tier: 3, opened: new Set<string>(), monsterThemes: {} } as never);
    expect(outcome.effects).toEqual([{ type: "quartermaster" }]);
  });
});

describe("point 12: the artifacts and the king's henchmen", () => {
  const places = world.allPois().filter((p) => p.kind === "dungeon" || p.kind === "cave");
  const holders = places.filter((p) => (world.dungeonRef(p.id)?.artifacts?.length ?? 0) > 0);

  it("lie in the places of level 2 and up, one in a place, ARTIFACTS_PER_KIND of each kind at most", () => {
    const all = holders.flatMap((p) => world.dungeonRef(p.id)!.artifacts!);
    expect(all.length).toBeGreaterThan(0);
    for (const p of holders) {
      expect(p.tier).toBeGreaterThanOrEqual(2);
      expect(world.dungeonRef(p.id)!.artifacts).toHaveLength(1);
    }
    for (const kind of Object.values(ARTIFACT_TYPE)) expect(all.filter((t) => t === kind).length).toBeLessThanOrEqual(ARTIFACTS_PER_KIND);
  });

  it("are hidden in a locked chest of their place", () => {
    for (const p of holders.slice(0, 12)) {
      const ref = world.dungeonRef(p.id)!;
      const content = buildMapContent(world, p, generateInterior(world, p));
      const chests = content.actions.filter((a) => a.kind === "treasure" && String(a.params.extra ?? "").includes(ref.artifacts![0]!));
      expect(chests.length, p.name).toBe(1);
      expect(chests[0]!.params.difficulty, p.name).toBeDefined();
    }
  });

  it("has a henchman of the castle's own kind in every castle", () => {
    const castles = world.allPois().filter((p) => p.kind === "castle");
    expect(castles.length).toBe(3);
    for (const c of castles) {
      const content = buildMapContent(world, c, generateInterior(world, c));
      const keepers = content.actions.filter((a) => a.kind === "keeper");
      expect(keepers, c.name).toHaveLength(1);
      expect(keepers[0]!.params.alignment).toBe(world.castleAlignment(c.id));
    }
  });
});

describe("point 11: the side rooms of a castle hold something", () => {
  const castles = Array.from({ length: 60 }, (_, i) => {
    const poi = poiFor("castle", i);
    const map = generateInterior(world, poi);
    return { poi, map, content: buildMapContent(world, poi, map) };
  });

  it("leaves no side room without an object (a banner alone does not count)", () => {
    let rooms = 0;
    for (const { map, content } of castles) {
      const objects = content.actions.filter((a) => !(a.kind === "decor" && [103, 104, 105].includes(Number(a.params.item))));
      expect(emptyRooms(map, content.actions).length, map.key).toBe(0);
      // the rooms of the plan with the banners taken away: every one of them holds a chest, a prop or a gate
      const bare = emptyRooms(map, objects);
      rooms += bare.length;
    }
    expect(rooms).toBe(0);
  });

  it("shuts some of them with a gate of a harder lock and a chest of the next level behind it, never on level 5", () => {
    let gates = 0;
    for (const { poi, content } of castles) {
      const gate = content.actions.filter((a) => a.uid.includes("#roomgate:"));
      if (poi.tier >= 5) expect(gate).toHaveLength(0);
      for (const g of gate) {
        gates++;
        expect(g.params).toMatchObject({ locked: true, difficulty: 1, harder: 1 });
        expect(content.actions.some((a) => a.uid.includes("#roomchest:") && a.kind === "treasure" && Number(a.params.level) === Math.min(8, poi.tier + 1))).toBe(true);
      }
    }
    expect(gates).toBeGreaterThan(0);
  });
});

describe("point 19: a place keeps one of several wordings in the quest log", () => {
  it("does not say 'Explored the scary' for every cave", () => {
    const caves = world.allPois().filter((p) => p.kind === "cave");
    const log = worldQuestLog({ world, opened: new Set(), visited: new Set(caves.map((c) => c.id)), carried: () => 0 });
    const words = new Set(log.open.map((line) => line.replace(/[A-Z][^ ]*( of [A-Z][^ ]*)?/g, "").replace(/\d+\/\d+/g, "").trim().split(" ").slice(0, 3).join(" ")));
    expect(words.size).toBeGreaterThan(2);
  });
});
