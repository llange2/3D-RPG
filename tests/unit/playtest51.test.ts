import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTER_ACTION_RADIUS, monsterTurn, type Encounter, type GridView } from "../../src/sim/encounter";
import { RESISTANCE_CAP, createCharacter, resistanceShare } from "../../src/sim/character";
import { elementalDamage } from "../../src/sim/combat";
import { MONSTERS } from "../../src/data/tables";
import { addEffect, createDefaultParty } from "../../src/sim/party";
import { towerDecor, TOWER_DECOR_FORBIDDEN, TOWER_DECOR_PREFERRED } from "../../src/actions/rules";
import { placeName } from "../../src/data/names";
import { World } from "../../src/world/world";
import { caravansOf } from "../../src/world/caravans";
import { GROUND } from "../../src/world/types";

const rng = (s: string) => new Rng(seedFromString(s));

describe("51st playtest, point 13: resistance, protection and the Fairy", () => {
  const hero = () => createCharacter({ name: "T", classType: "Knight", raceType: "Human", avatar: "character05", attrs: { str: 10, int: 10, per: 10, end: 10, spd: 10, acc: 10, lck: 10 } });

  it("a resistance takes off a share of the hit and never more than 80 %", () => {
    const party = createDefaultParty();
    const c = hero();
    c.resFire = 50;
    expect(elementalDamage(party, c, "fire", 100)).toBe(50);
    c.resFire = 80;
    expect(elementalDamage(party, c, "fire", 100)).toBe(20);
    // 95 % or 150 % on the sheet count as 80 %
    c.resFire = 95;
    expect(resistanceShare(c, "fire")).toBe(RESISTANCE_CAP);
    expect(elementalDamage(party, c, "fire", 100)).toBe(20);
    c.resFire = 150;
    expect(elementalDamage(party, c, "fire", 100)).toBe(20);
  });

  it("Protection from Elements takes the caster's level in points off what is left, the Fairy adds 15 percent of resistance", () => {
    const party = createDefaultParty();
    const c = hero();
    c.resIce = 50;
    c.resFire = 0;
    // 100 hit, 50 % resisted: 50 are left; the spell of a level 12 caster takes 12 off
    addEffect(party, { kind: "protection", until: party.minutes + 480, element: "ice", amount: 12 });
    expect(elementalDamage(party, c, "ice", 100)).toBe(38);
    // it guards against its own element only
    expect(elementalDamage(party, c, "fire", 100)).toBe(100);
    party.mascot = "Fairy";
    // 50 + 15 = 65 percent resisted: 35 are left, less the 12 of the spell
    expect(elementalDamage(party, c, "ice", 100)).toBe(23);
    // never below nothing
    expect(elementalDamage(party, c, "ice", 5)).toBe(0);
  });
});

describe("51st playtest, point 4: the furniture of a tower", () => {
  it("never has a gravestone and takes the preferred pieces first", () => {
    const all = [12, 13, 14, 15, 16, 27, 29, 32, 34, 61, 62, 63, 70, 71, 75, 76, 83, 94, 95];
    let preferred = 0;
    for (let i = 0; i < 400; i++) {
      const choices = towerDecor(all, rng(`d${i}`));
      for (const g of TOWER_DECOR_FORBIDDEN) expect(choices).not.toContain(g);
      if (choices.every((c) => TOWER_DECOR_PREFERRED.includes(c))) preferred++;
    }
    // three of four draws come from the preferred list
    expect(preferred).toBeGreaterThan(250);
    expect(preferred).toBeLessThan(350);
  });

  it("falls back to the other pieces when the theme allows none of the preferred", () => {
    expect(towerDecor([12, 32, 34], rng("x"))).toEqual([12, 34]);
  });
});

describe("51st playtest, point 6: names of dungeons and caves", () => {
  it("have many more different forms", () => {
    const ends = new Set<string>();
    const stems = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const name = placeName(rng(`n${i}`), i % 2 === 0 ? "dungeon" : "cave");
      ends.add(name.split(" of ")[0]!);
      stems.add(name.split(" of ")[1]!);
    }
    expect(ends.size).toBe(32);
    expect(stems.size).toBeGreaterThan(600);
  });
});

describe("51st playtest, point 8: monsters that cannot get round the others", () => {
  /** A corridor one tile wide. */
  const corridor = {
    walkable: (x: number, y: number) => y === 0 && x >= 0 && x <= 12,
    water: () => false,
    opaque: (x: number, y: number) => !(y === 0 && x >= 0 && x <= 12),
  } as unknown as GridView;
  const enc = (id: number, xs: number[]): Encounter => ({
    monsters: xs.map((x, i) => ({ uid: `m${i}`, defId: id, x, y: 0, hp: MONSTERS[id]!.health, alerted: false }) as never),
    battleMode: false,
    sequence: [],
    attacker: null,
  });

  it("one that has no way round the monster beside the party closes up along the free tiles, an archer stays", () => {
    const melee = Number(Object.entries(MONSTERS).find(([, m]) => !m.ranged && m.terrain === "land")![0]);
    const archer = Number(Object.entries(MONSTERS).find(([, m]) => m.ranged && m.terrain === "land")![0]);
    const party = createDefaultParty();
    // the party stands at x = 6 and one monster next to it at x = 5; the second is at x = 2, the tiles 3 and 4 are free, but the way to the party's other side leads through the party
    const e = enc(melee, [5, 2]);
    monsterTurn(party, corridor, e, 6, 0, rng("t"), MONSTER_ACTION_RADIUS);
    expect(e.monsters.map((m) => m.x)).toEqual([5, 3]);
    const f = enc(archer, [5, 2]);
    monsterTurn(party, corridor, f, 6, 0, rng("t"), MONSTER_ACTION_RADIUS);
    expect(f.monsters.map((m) => m.x)).toEqual([5, 2]);
  });
});

describe("51st playtest, point 11: the hint wagon on a lava island", () => {
  it("stands at the end of a lane of dirt in frost-mere-472 (small, few dungeons)", () => {
    const world = new World("frost-mere-472", "small", "few");
    const place = world.poiById("p:3:0:125")!;
    const wagon = caravansOf(world, place)[0]!;
    expect(wagon.hint?.place).toBe(place.id);
    expect([wagon.x, wagon.y]).toEqual([91, 22]);
    expect(world.tile(91, 23).ground).toBe(GROUND.LAND);
    expect(world.tile(91, 22).ground).toBe(GROUND.LAND);
  });
});
