import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { hutScene } from "../../src/data/hut-texts";
import { MONSTER_IDS, MONSTERS } from "../../src/data/tables";
import { createEncounter, createMonster, monsterTurn, monsterXp, partyAttack, updateBattleMode, type GridView } from "../../src/sim/encounter";
import { createDefaultParty } from "../../src/sim/party";
import { castSpell, movesParty } from "../../src/sim/spells";
import { HUT_RADIUS, hutMonsters, hutsOf, hutXpPercent } from "../../src/world/huts";
import { wrapDelta, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const rng = (s: string) => new Rng(seedFromString(s));
const id = (name: string): number => MONSTER_IDS.find((m) => MONSTERS[m]!.name === name)!;
const SIZES: WorldSize[] = ["small", "default", "large", "huge"];
const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };

describe("the Monster Huts by world size (25th playtest, 3 and 7)", () => {
  it("holds 4, 6, 8 and 10 monsters, which give 150, 100, 75 and 60 % of the sheet's XP", () => {
    expect(SIZES.map(hutMonsters)).toEqual([4, 6, 8, 10]);
    expect(SIZES.map(hutXpPercent)).toEqual([150, 100, 75, 60]);
    // a hut is worth the same on every map (the sheet's XP for six monsters)
    for (const size of SIZES) expect((hutMonsters(size) * hutXpPercent(size)) / 100).toBe(6);
  });

  it("scales the XP of one monster with the percent, and gives the sheet's XP without one", () => {
    const def = MONSTERS[id("Goblin")]!;
    const m = createMonster("h:x", def.id, 0, 0);
    expect(monsterXp(m, def)).toBe(def.xp);
    m.xpPercent = 150;
    expect(monsterXp(m, def)).toBe(Math.floor(def.xp * 1.5));
    m.xpPercent = 60;
    expect(monsterXp(m, def)).toBe(Math.floor(def.xp * 0.6));
  });

  it("gives the party the scaled XP when the monster falls", () => {
    const party = createDefaultParty();
    const enc = createEncounter();
    const def = MONSTERS[id("Goblin")]!;
    const goblin = createMonster("h:g", def.id, 5, 4);
    goblin.xpPercent = 150;
    goblin.hp = 1;
    enc.monsters.push(goblin);
    const before = party.characters[0]!.xp;
    const events = partyAttack(party, open, enc, 5, 5, rng("xp"), { kind: "melee", targetUid: "h:g", magic: undefined });
    const dead = events.find((e) => e.type === "monster_dead");
    if (dead && dead.type === "monster_dead") {
      expect(dead.xp).toBe(Math.floor(def.xp * 1.5));
      expect(party.characters[0]!.xp - before).toBe(dead.xp);
    }
  });

  for (const size of SIZES) {
    it(`stands every hut once on a ${size} world, its monsters within ${HUT_RADIUS} tiles, spaced apart`, () => {
      for (const seed of ["p25-a", "p25-b", "p25-c"]) {
        const world = new World(seed, size);
        const huts = hutsOf(world);
        expect(huts, seed).toHaveLength(21);
        let crowded = 0;
        for (const h of huts) {
          expect(h.slots.length, h.id).toBeGreaterThan(0);
          expect(h.slots.length, h.id).toBeLessThanOrEqual(hutMonsters(size));
          for (const s of h.slots) expect(Math.max(Math.abs(wrapDelta(h.x, s.x, world.width)), Math.abs(wrapDelta(h.y, s.y, world.height))), h.id).toBeLessThanOrEqual(HUT_RADIUS);
          const nearest = Math.min(...huts.filter((o) => o !== h).map((o) => Math.max(Math.abs(wrapDelta(h.x, o.x, world.width)), Math.abs(wrapDelta(h.y, o.y, world.height)))));
          expect(nearest, h.id).toBeGreaterThanOrEqual(2);
          if (nearest < 14) crowded++;
        }
        // the big worlds have the room to keep nearly every hut well apart from the others (two radii and some more), so that two huts never meet in one fight
        if (size === "large" || size === "huge") expect(crowded, `${seed} ${size}`).toBeLessThanOrEqual(10);
      }
    });
  }

  it("keeps the huts out of the start's first steps", () => {
    for (const size of SIZES) {
      const world = new World("p25-start", size);
      const s = world.startPosition();
      for (const h of hutsOf(world)) {
        for (const slot of h.slots) expect(Math.hypot(wrapDelta(s.x, slot.x, world.width), wrapDelta(s.y, slot.y, world.height)), h.id).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it("stands the huts of levels 1 and 2 from the weakest to the strongest monster, outwards from Starthaven (kelp-peak-430)", () => {
    for (const size of SIZES) {
      for (const seed of ["kelp-peak-430", "p25-a", "p25-b"]) {
        const world = new World(seed, size);
        const home = world.poiById("p:0:0:0")!;
        for (const level of [1, 2]) {
          const ranked = hutsOf(world)
            .filter((h) => MONSTERS[h.monster]!.treasure_level === level)
            .sort((a, b) => MONSTERS[a.monster]!.xp - MONSTERS[b.monster]!.xp || a.monster - b.monster);
          const dist = ranked.map((h) => (h.x - home.x) ** 2 + (h.y - home.y) ** 2);
          expect(dist, `${seed} ${size} level ${level}`).toEqual([...dist].sort((a, b) => a - b));
        }
      }
    }
    // the first three of Starthaven on the world of the playtest: Goblin, Vampire Bat, Wild Fungus
    const world = new World("kelp-peak-430", "small");
    const home = world.poiById("p:0:0:0")!;
    const nearest = hutsOf(world)
      .filter((h) => MONSTERS[h.monster]!.treasure_level === 1)
      .sort((a, b) => (a.x - home.x) ** 2 + (a.y - home.y) ** 2 - ((b.x - home.x) ** 2 + (b.y - home.y) ** 2))
      .slice(0, 3)
      .map((h) => MONSTERS[h.monster]!.name);
    expect(nearest).toEqual(["Goblin", "Vampire Bat", "Wild Fungus"]);
  });

  it("names the monster in the scene of its hut", () => {
    for (const m of MONSTER_IDS.filter((x) => MONSTERS[x]!.outside === "hut")) {
      const text = hutScene(m);
      expect(text, MONSTERS[m]!.name).toContain(`the ${MONSTERS[m]!.name}.`);
      expect(text).toMatch(/Burn this place down\?$/);
    }
  });
});

describe("the towns of the start island (25th playtest, 2)", () => {
  for (const size of SIZES) {
    it(`puts the town of level 1 and the town of level 2 at the ends of the island on a ${size} world`, () => {
      for (const seed of ["p25-a", "p25-b", "p25-c", "p25-d"]) {
        const world = new World(seed, size);
        const isl = world.islands[0]!;
        const towns = world.allPois().filter((p) => p.kind === "town" && p.id.startsWith("p:0:"));
        const ones = towns.filter((p) => p.tier === 1);
        const twos = towns.filter((p) => p.tier === 2);
        expect(ones.length).toBeGreaterThan(0);
        expect(twos.length).toBeGreaterThan(0);
        const along = (p: { x: number; y: number }): number => wrapDelta(isl.x, p.x, world.width) * isl.axis.x + wrapDelta(isl.y, p.y, world.height) * isl.axis.y;
        const mean = (list: { x: number; y: number }[]): number => list.reduce((n, p) => n + along(p), 0) / list.length;
        // along the axis the level-1 towns lie on one side and the level-2 towns on the other, well over the radius of the island apart (before, the
        // towns stood half a radius from the middle: a radius apart); Starthaven itself stands out at the end
        expect(mean(ones) - mean(twos), `${seed} ${size}`).toBeGreaterThan(isl.r * 1.2);
        expect(along(world.allPois().find((p) => p.id === "p:0:0:0")!), `${seed} ${size}`).toBeGreaterThan(isl.r * 0.5);
        expect(ones.every((p) => along(p) > 0) && twos.every((p) => along(p) < 0), `${seed} ${size}`).toBe(true);
      }
    });
  }
});

describe("monsters in a fight keep coming (25th playtest, 1)", () => {
  it("lets the monsters behind the first one go round it to a free side of the party", () => {
    const party = createDefaultParty();
    for (const c of party.characters) c.hp = c.health = 100000;
    const enc = createEncounter();
    // the party at (5, 5); one monster already next to it, three more in a row behind it
    const front = createMonster("a", id("Giant Spider"), 5, 4);
    const rear = ["b", "c", "d"].map((u, i) => createMonster(u, id("Giant Spider"), 5, 3 - i));
    enc.monsters.push(front, ...rear);
    for (let turn = 0; turn < 10; turn++) monsterTurn(party, open, enc, 5, 5, rng(`queue${turn}`));
    // after some turns the monsters stand on all four sides of the party, none in a queue behind another (before, the three behind stood still)
    const sides = enc.monsters.filter((m) => Math.abs(m.x - 5) + Math.abs(m.y - 5) === 1);
    expect(sides.length).toBe(4);
  });

  it("does not move a monster that is next to the party, nor through the party", () => {
    const party = createDefaultParty();
    const enc = createEncounter();
    const m = createMonster("a", id("Giant Spider"), 6, 5);
    enc.monsters.push(m);
    monsterTurn(party, open, enc, 5, 5, rng("still"));
    expect([m.x, m.y]).toEqual([6, 5]);
  });

  it("walks every monster of a crowd up while others hold the sides", () => {
    const party = createDefaultParty();
    for (const c of party.characters) c.hp = c.health = 100000;
    const enc = createEncounter();
    for (let i = 0; i < 6; i++) enc.monsters.push(createMonster(`m${i}`, id("Giant Spider"), 5 + (i % 3) - 1, 1 - Math.floor(i / 3)));
    const start = enc.monsters.map((m) => Math.abs(m.x - 5) + Math.abs(m.y - 5));
    monsterTurn(party, open, enc, 5, 5, rng("crowd"));
    const after = enc.monsters.map((m) => Math.abs(m.x - 5) + Math.abs(m.y - 5));
    // every one of them closed in
    after.forEach((d, i) => expect(d, `m${i}`).toBeLessThan(start[i]!));
  });
});

describe("the party cannot leave a melee by spell (25th playtest, 6)", () => {
  it("knows the spells that carry the party away", () => {
    for (const spell of [16, 42, 45, 47, 62, 66]) expect(movesParty(spell), String(spell)).toBe(true);
    expect(movesParty(32, "return")).toBe(true);
    expect(movesParty(32, "set")).toBe(false);
    expect(movesParty(32)).toBe(false);
    // casting light, healing, resting and the monster spells are no moves
    for (const spell of [2, 6, 13, 22, 26, 52]) expect(movesParty(spell), String(spell)).toBe(false);
  });

  it("fizzles every such spell in battle, without spending the spell points", () => {
    for (const spell of [16, 42, 45, 47, 62, 66]) {
      const party = createDefaultParty();
      const caster = party.characters.findIndex((c) => c.spells.includes(spell));
      const who = caster < 0 ? 0 : caster;
      const c = party.characters[who]!;
      if (!c.spells.includes(spell)) c.spells.push(spell);
      c.mana = c.sp = 500;
      const result = castSpell(party, who, spell, rng(`s${spell}`), { battle: true });
      expect(result, String(spell)).toEqual({ kind: "fizzle", reason: "in_battle" });
      expect(c.sp, String(spell)).toBe(500);
    }
  });

  it("is in battle only while a monster stands next to the party", () => {
    const enc = createEncounter();
    enc.monsters.push(createMonster("a", id("Giant Spider"), 5, 8));
    updateBattleMode(enc, 5, 5, open);
    expect(enc.battleMode).toBe(false);
    enc.monsters[0]!.y = 6;
    updateBattleMode(enc, 5, 5, open);
    expect(enc.battleMode).toBe(true);
  });
});
