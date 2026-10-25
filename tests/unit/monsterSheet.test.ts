import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { hutScene } from "../../src/data/hut-texts";
import { MONSTER_IDS, MONSTERS } from "../../src/data/tables";
import { createEncounter, createMonster, monsterTurn, type CombatEvent, type GridView } from "../../src/sim/encounter";
import { applyHit } from "../../src/sim/combat";
import { createDefaultParty } from "../../src/sim/party";
import { levelAt, monsterLevel } from "../../src/world/difficulty";
import { wrapDist2 } from "../../src/world/islands";
import { HUT_RADIUS, hutGold, hutMonsters, hutsOf, hutXpPercent } from "../../src/world/huts";
import { chunkSpawns } from "../../src/world/spawns";
import { CHUNK_SIZE, GROUND } from "../../src/world/types";
import { World } from "../../src/world/world";

const id = (name: string): number => MONSTER_IDS.find((m) => MONSTERS[m]!.name === name)!;
const rng = (s: string) => new Rng(seedFromString(s));

/** Open ground all round: nothing blocks a step or a shot. */
const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };

describe("the monster sheet (docs/RPG_0.1.xlsx)", () => {
  it("replaces the old table: stats, XP column 23, treasure level column 24, abilities", () => {
    const goblin = MONSTERS[id("Goblin")]!;
    expect(goblin).toMatchObject({ health: 10, xp: 190, gold: 10, treasure_level: 1, no_of_attacks: 1, ranged: true });
    expect(MONSTERS[id("Cryo Spore")]!.attack_type).toBe("Ice");
    // the Medusa petrifies and kills, the Troll heals, the Vampire drains mana, the Ghost ages
    expect(MONSTERS[id("Medusa")]!.causes).toEqual(["Petrified", "Dead"]);
    expect(MONSTERS[id("Troll")]!.regen).toBe(0.05);
    expect(MONSTERS[id("Vampire")]).toMatchObject({ regen: 0.1, steal_mana: 0.2 });
    expect(MONSTERS[id("Ghost")]!.aging_years).toBe(1);
    expect(MONSTERS[id("Wild Fungus")]!.hits_all).toBe(true);
    expect(MONSTERS[id("Dragon Worm")]!.terrain).toBe("both");
    expect(MONSTERS[id("Vampire")]!.special_abilties).toBe("Regenerates 10%, Drains 20% of Spell Points");
  });

  it("gives a hut to the 21 monsters with an outside XP, which is 10 times their XP (the sheet's 13 was lowered on 26.10.2026)", () => {
    const huts = MONSTER_IDS.filter((m) => MONSTERS[m]!.outside === "hut");
    expect(huts).toHaveLength(21);
    for (const m of huts) expect(MONSTERS[m]!.hut_xp, MONSTERS[m]!.name).toBe(10 * MONSTERS[m]!.xp);
    for (const m of MONSTER_IDS.filter((x) => MONSTERS[x]!.outside !== "hut")) expect(MONSTERS[m]!.hut_xp).toBe(0);
    // no hut for the monsters of the deeper levels: they roam without one ("x")
    expect(huts.every((m) => MONSTERS[m]!.treasure_level <= 3)).toBe(true);
    expect(MONSTER_IDS.filter((m) => MONSTERS[m]!.outside === "wild").length).toBeGreaterThan(20);
  });

  it("writes a scene and the question for every hut", () => {
    for (const m of MONSTER_IDS.filter((x) => MONSTERS[x]!.outside === "hut")) expect(hutScene(m), MONSTERS[m]!.name).toMatch(/Burn this place down\?$/);
    expect(hutScene(id("Wild Fungus"))).toContain("small mushrooms are growing");
  });

  it("rounds the gold of a burnt hut up to the next thousand", () => {
    expect(hutGold(id("Goblin"))).toBe(1000); // 13 * 10
    expect(hutGold(id("Ghoul"))).toBe(4000); // 13 * 250 = 3250
    expect(hutGold(id("Oh No Bug"))).toBe(0);
  });
});

describe("what a monster does in a turn (entity 4 and the abilities of entity 8)", () => {
  /** One monster of the sheet next to the party, which stands at (5, 5); the heroes are given enough health to survive a few turns. */
  function fight(name: string, at: [number, number], seed: string) {
    const party = createDefaultParty();
    for (const c of party.characters) c.hp = c.health = 100000;
    const enc = createEncounter();
    enc.monsters.push(createMonster("m", id(name), at[0], at[1]));
    const events = monsterTurn(party, open, enc, 5, 5, rng(seed));
    return { party, enc, events, attacks: events.filter((e): e is Extract<CombatEvent, { type: "monster_attack" }> => e.type === "monster_attack") };
  }

  it("strikes as often in a row as entity 4 says in melee, but shoots half as often from afar (at most twice)", () => {
    expect(fight("Giant Spider", [5, 6], "a").attacks).toHaveLength(8);
    expect(fight("Giant Spider", [5, 6], "a").attacks.every((a) => !a.ranged)).toBe(true);
    // the Archer has four attacks and a bow: next to the party four blows, from five tiles away two arrows (BALANCE v4: half of them, at most two)
    expect(fight("Archer", [5, 6], "b").attacks).toHaveLength(4);
    const shot = fight("Archer", [5, 10], "c");
    expect(shot.attacks).toHaveLength(2);
    expect(shot.attacks.every((a) => a.ranged)).toBe(true);
    // one attack, one arrow
    expect(fight("Goblin", [5, 10], "g").attacks).toHaveLength(1);
  });

  it("does not shoot without a ranged attack", () => {
    expect(fight("Giant Spider", [5, 10], "d").attacks).toHaveLength(0);
  });

  it("hits all heroes at once with Hits All", () => {
    const { attacks } = fight("Wild Fungus", [5, 6], "e");
    expect(attacks).toHaveLength(4);
    expect(new Set(attacks.map((a) => a.target)).size).toBe(4);
  });

  it("heals a Troll by 5 % of its health at the end of the monster turn, and not above its health", () => {
    const party = createDefaultParty();
    const enc = createEncounter();
    const troll = createMonster("t", id("Troll"), 20, 20);
    troll.hp = 50;
    enc.monsters.push(troll);
    const events = monsterTurn(party, open, enc, 5, 5, rng("f"));
    expect(events.find((e) => e.type === "monster_regen")).toMatchObject({ uid: "t", amount: 6 });
    expect(troll.hp).toBe(56);
    troll.hp = troll.hp = MONSTERS[id("Troll")]!.health - 1;
    monsterTurn(party, open, enc, 5, 5, rng("g"));
    expect(troll.hp).toBe(MONSTERS[id("Troll")]!.health);
  });

  it("takes mana with the hit of a Mystic cloud and adds a year with the touch of a Ghost", () => {
    const party = createDefaultParty();
    const hero = party.characters[0]!;
    hero.mana = 40;
    hero.sp = 40;
    hero.hp = hero.health = 100000;
    const hit = applyHit(party, 0, 5, MONSTERS[id("Mystic cloud")]!, rng("h"));
    expect(hit.drained).toBe(20);
    expect(hero.sp).toBe(20);
    const before = hero.magicAge ?? 0;
    const touch = applyHit(party, 0, 5, MONSTERS[id("Ghost")]!, rng("i"));
    expect(touch.aged).toBe(1);
    expect(hero.magicAge).toBe(before + 1);
    // a miss (no damage) takes and ages nothing
    expect(applyHit(party, 0, 0, MONSTERS[id("Mystic cloud")]!, rng("j")).drained).toBeUndefined();
  });
});

describe("the Monster Huts on the overworld", () => {
  for (const size of ["small", "default", "large", "huge"] as const) {
    it(`puts every hut once into a ${size} world, on islands of the level of its monster`, () => {
      const world = new World(`huts-${size}`, size);
      const huts = hutsOf(world);
      expect(huts).toHaveLength(21);
      expect(new Set(huts.map((h) => h.id)).size).toBe(huts.length);
      for (const h of huts) {
        const def = MONSTERS[h.monster]!;
        expect(def.outside).toBe("hut");
        expect(world.islandAt(h.x, h.y)?.index, h.id).toBe(h.island);
        expect(world.tierAt(h.x, h.y), `${def.name} ${h.id}`).toBe(def.treasure_level);
        expect(world.tile(h.x, h.y).ground).toBe(GROUND.LAND);
        // its monsters: at most as many as the size says (4, 6, 8, 10), within five tiles, on the island of the hut, one to a tile
        expect(h.slots.length).toBeGreaterThan(0);
        expect(h.slots.length).toBeLessThanOrEqual(hutMonsters(size));
        for (const s of h.slots) {
          expect(Math.max(Math.abs(s.x - h.x), Math.abs(s.y - h.y)), h.id).toBeLessThanOrEqual(HUT_RADIUS);
          expect(world.islandAt(s.x, s.y)?.index, h.id).toBe(h.island);
        }
      }
      const tiles = new Set(huts.flatMap((h) => h.slots.map((s) => `${world.wrapX(s.x)},${world.wrapY(s.y)}`)));
      expect(tiles.size).toBe(huts.reduce((n, h) => n + h.slots.length, 0));
    });
  }

  it("is a pure function of the seed", () => {
    expect(hutsOf(new World("same", "default"))).toEqual(hutsOf(new World("same", "default")));
    expect(hutsOf(new World("same", "default"))).not.toEqual(hutsOf(new World("other", "default")));
  });

  it("stands the weak monsters of a level near the level below and the strong ones near the next level", () => {
    for (const seed of ["rank-a", "rank-b", "rank-c"]) {
      const world = new World(seed, "default");
      const huts = hutsOf(world);
      const at = (name: string) => levelAt(world, huts.find((h) => h.monster === id(name))!.x, huts.find((h) => h.monster === id(name))!.y);
      // levels 1 and 2 (the start island) grow harder with the distance from Starthaven, strictly in the order of the monsters' XP (25th playtest)
      const home = world.poiById("p:0:0:0")!;
      for (const level of [1, 2]) {
        const ranked = huts.filter((h) => MONSTERS[h.monster]!.treasure_level === level).sort((a, b) => MONSTERS[a.monster]!.xp - MONSTERS[b.monster]!.xp || a.monster - b.monster);
        const dist = ranked.map((h) => wrapDist2(h.x, h.y, home.x, home.y, world.width, world.height));
        expect(dist, `${seed} level ${level}`).toEqual([...dist].sort((a, b) => a - b));
      }
      expect(at("Archer"), seed).toBeLessThan(at("Mini Dragon"));
      // and the scale of the monsters runs the same way
      expect(monsterLevel(id("Goblin"))).toBeLessThan(monsterLevel(id("Giant Spider")));
      expect(monsterLevel(id("Giant Spider"))).toBeLessThan(monsterLevel(id("Magic Mantis")));
    }
  });

  it("keeps the monsters of the huts out of the wild groups, which are made of the sheet's x", () => {
    const world = new World("wild-sheet", "large");
    const across = world.width / CHUNK_SIZE;
    const down = world.height / CHUNK_SIZE;
    let groups = 0;
    for (let cy = 0; cy < down; cy++) {
      for (let cx = 0; cx < across; cx++) {
        for (const g of chunkSpawns(world, cx, cy)) {
          groups++;
          for (const m of g.monsterIds) expect(MONSTERS[m]!.outside, `${g.uid} ${MONSTERS[m]!.name}`).toBe("wild");
        }
      }
    }
    expect(groups).toBeGreaterThan(50);
  });
});
