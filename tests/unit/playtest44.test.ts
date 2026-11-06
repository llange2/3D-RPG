import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { resistanceTone } from "../../src/data/resistance-tone";
import { firesLaser } from "../../src/data/robot-sounds";
import { MONSTERS, SPELLS } from "../../src/data/tables";
import { ELEMENTAL_STORM_ELEMENTS, areaSpell, createEncounter, createMonster, identifyMonsters, type GridView } from "../../src/sim/encounter";
import { MONSTER_ACTION_RADIUS } from "../../src/sim/encounter";
import { createDefaultParty } from "../../src/sim/party";
import { castSpell, isAreaSpell, isAttackSpell } from "../../src/sim/spells";
import { DECO, GROUND, poiBounds } from "../../src/world/types";
import { EXIT_MONSTER_LIMIT, EXIT_RADIUS, townExits } from "../../src/world/safezone";
import { hutsOf } from "../../src/world/huts";
import { chunkSpawns } from "../../src/world/spawns";
import { World } from "../../src/world/world";
import type { WorldSize } from "../../src/world/types";

const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };
const rng = (s: string) => new Rng(seedFromString(s));
const GOBLIN = Object.values(MONSTERS).find((m) => m.name === "Goblin")!.id;

describe("the 6. 11. 2026 playtest: spells", () => {
  it("lets Meteor Shower and Elemental Storm hit every monster in the action radius, with no target", () => {
    expect(isAreaSpell(72) && isAreaSpell(75)).toBe(true);
    expect(isAttackSpell(72) || isAttackSpell(75)).toBe(false);
    const party = createDefaultParty();
    const enc = createEncounter();
    // three monsters in different directions, one of them out of the radius
    enc.monsters.push(createMonster("a", GOBLIN, 5, 0), createMonster("b", GOBLIN, 0, -4), createMonster("c", GOBLIN, -3, 3), createMonster("far", GOBLIN, 0, MONSTER_ACTION_RADIUS + 3));
    const events = areaSpell(party, open, enc, 0, 0, rng("storm"), "elemental_storm", { damage: 1, type: "fire" });
    const hit = events.filter((e) => e.type === "party_attack");
    expect(hit.map((e) => (e.type === "party_attack" ? e.uid : "")).sort()).toEqual(["a", "b", "c"]);
    for (const e of hit) if (e.type === "party_attack") expect(ELEMENTAL_STORM_ELEMENTS).toContain(e.element);
    const meteors = areaSpell(party, open, enc, 0, 0, rng("meteor"), "meteor_shower", { damage: 1, type: "fire" });
    for (const e of meteors) if (e.type === "party_attack") expect(e.element).toBe("fire");
  });

  it("gives every monster its own element in the storm", () => {
    const party = createDefaultParty();
    const seen = new Set<string>();
    for (let n = 0; n < 12; n++) {
      const enc = createEncounter();
      for (let i = 0; i < 6; i++) enc.monsters.push(createMonster(`m${i}`, GOBLIN, 1 + i, 1));
      for (const e of areaSpell(party, open, enc, 0, 0, rng(`s${n}`), "elemental_storm", { damage: 1, type: "fire" })) if (e.type === "party_attack" && e.element) seen.add(e.element);
    }
    expect([...seen].sort()).toEqual([...ELEMENTAL_STORM_ELEMENTS].sort());
  });

  it("casts the two as attacks that need nothing to aim at, and says that Meteor Shower works only outside", () => {
    const party = createDefaultParty();
    const druid = party.characters[3]!;
    druid.spells = [72, 75];
    druid.sp = druid.mana = 500;
    for (const id of [72, 75]) {
      const r = castSpell(party, 3, id, rng(`c${id}`), {});
      expect(r.kind).toBe("attack");
    }
    expect(SPELLS[72]!.text).toContain("Works only outside.");
  });

  it("reports every kind of monster once, with its resistances", () => {
    const enc = createEncounter();
    enc.monsters.push(createMonster("a", GOBLIN, 2, 0), createMonster("b", GOBLIN, 3, 0), createMonster("c", GOBLIN, 4, 0));
    const rows = identifyMonsters(enc, 0, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Goblin");
    expect(Object.keys(rows[0]!.resistances).sort()).toEqual(["acid", "fire", "ice", "magic", "physical"]);
  });

  it("colours resistances green up to 0.2, orange below 0.7 and red from 0.7", () => {
    expect([0, 0.2].map(resistanceTone)).toEqual(["low", "low"]);
    expect([0.21, 0.5, 0.69].map(resistanceTone)).toEqual(["mid", "mid", "mid"]);
    expect([0.7, 1].map(resistanceTone)).toEqual(["high", "high"]);
  });

  it("lets the ED-409, the Terminator and the Iron Wizard fire lasers", () => {
    const named = (n: string) => Object.values(MONSTERS).find((m) => m.name === n)!.id;
    for (const n of ["ED-409", "Terminator", "Iron Wizard"]) expect(firesLaser(named(n)), n).toBe(true);
    expect(firesLaser(named("Titanic Automato"))).toBe(false);
  });
});

describe("the 6. 11. 2026 playtest: the land round a town", () => {
  const worlds: [string, WorldSize][] = [["alpha", "small"], ["delta", "small"], ["beta", "default"]];
  for (const [seed, size] of worlds) {
    it(`${seed} (${size}): trees and rock stand three tiles from every town, and the roads lead through`, { timeout: 60_000 }, () => {
      const world = new World(seed, size);
      let ring = 0;
      let blocked = 0;
      for (const town of world.allPois().filter((p) => p.kind === "town")) {
        const b = poiBounds(town);
        for (let y = b.y0 - 3; y <= b.y1 + 3; y++) {
          for (let x = b.x0 - 3; x <= b.x1 + 3; x++) {
            if (Math.max(x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0, y < b.y0 ? b.y0 - y : y > b.y1 ? y - b.y1 : 0) !== 3) continue;
            const t = world.tile(x, y);
            // roads, water and the like are no free land to shelter
            if (t.ground !== GROUND.LAND && t.ground !== GROUND.MOUNTAIN) continue;
            ring++;
            if (t.ground === GROUND.MOUNTAIN || t.deco === DECO.TREE) blocked++;
          }
        }
      }
      expect(ring).toBeGreaterThan(0);
      expect(blocked / ring, `${blocked} of ${ring}`).toBeGreaterThan(0.4);
      expect(blocked / ring).toBeLessThan(0.9);
      // the start stands in front of Starthaven and can leave along a road
      const start = world.startPosition();
      expect(world.tile(start.x, start.y).ground).not.toBe(GROUND.MOUNTAIN);
    });

    it(`${seed} (${size}): at most ${EXIT_MONSTER_LIMIT} monsters within the action radius of the exit of any town`, { timeout: 120_000 }, () => {
      const world = new World(seed, size);
      const slots = hutsOf(world).flatMap((h) => h.slots);
      for (const e of townExits(world)) {
        let count = 0;
        const within = (x: number, y: number) => Math.max(Math.abs(world.wrapX(x - e.x + world.width / 2) - world.width / 2), Math.abs(world.wrapY(y - e.y + world.height / 2) - world.height / 2)) <= EXIT_RADIUS;
        for (let cy = Math.floor((e.y - EXIT_RADIUS) / 10) - 1; cy <= Math.floor((e.y + EXIT_RADIUS) / 10) + 1; cy++) {
          for (let cx = Math.floor((e.x - EXIT_RADIUS) / 10) - 1; cx <= Math.floor((e.x + EXIT_RADIUS) / 10) + 1; cx++) {
            for (const g of chunkSpawns(world, cx, cy)) if (within(g.x, g.y)) count += g.monsterIds.length;
          }
        }
        for (const s of slots) if (within(s.x, s.y)) count++;
        expect(count, `exit ${e.x},${e.y}`).toBeLessThanOrEqual(EXIT_MONSTER_LIMIT);
      }
    });
  }
});
