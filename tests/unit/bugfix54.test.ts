import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS } from "../../src/data/tables";
import { FLEE_EXTRA, MONSTER_ACTION_RADIUS, monsterTurn, type Encounter, type GridView } from "../../src/sim/encounter";
import { createDefaultParty } from "../../src/sim/party";
import { searchPlaces, searchTerm, SEARCH_MIN_LETTERS } from "../../src/game/mapSearch";
import type { Poi } from "../../src/world/types";

const rng = (s: string) => new Rng(seedFromString(s));
const entries = Object.entries(MONSTERS).map(([id, m]) => ({ id: Number(id), m }));
const melee = entries.find((e) => !e.m.ranged && e.m.terrain === "land")!;
const archer = entries.find((e) => e.m.ranged && e.m.terrain === "land")!;
const swimmer = entries.find((e) => e.m.terrain === "water")!;

/** A shore: land from x = 0 to 10 (rows 0 to `rows` - 1), water beyond it. */
function shore(rows: number): GridView {
  return {
    walkable: (x: number, y: number) => x >= 0 && x <= 10 && y >= 0 && y < rows,
    water: (x: number) => x > 10,
    opaque: () => false,
  } as unknown as GridView;
}

function encounter(list: { id: number; x: number; y: number; hurt?: boolean }[]): Encounter {
  return {
    monsters: list.map((s, i) => ({ uid: `m${i}`, defId: s.id, x: s.x, y: s.y, hp: s.hurt ? 1 : MONSTERS[s.id]!.health }) as never),
    battleMode: false,
    sequence: [],
    attacker: null,
  };
}

describe("bug_fix_54, point 1: land monsters back off from a party that attacks from the water", () => {
  it("a hurt melee monster with no way to the party walks away from it, a healthy one stays", () => {
    const party = createDefaultParty();
    const e = encounter([
      { id: melee.id, x: 10, y: 1, hurt: true },
      { id: melee.id, x: 10, y: 3 },
    ]);
    monsterTurn(party, shore(5), e, 14, 2, rng("a"), MONSTER_ACTION_RADIUS);
    expect(e.monsters[0]!.x).toBe(9);
    expect(e.monsters[1]!.x).toBe(10);
  });

  it("goes no farther than the action radius + 3 from the party", () => {
    const party = createDefaultParty();
    const e = encounter([{ id: melee.id, x: 10, y: 2, hurt: true }]);
    for (let i = 0; i < 30; i++) monsterTurn(party, shore(5), e, 14, 2, rng(`t${i}`), MONSTER_ACTION_RADIUS);
    expect(14 - e.monsters[0]!.x).toBe(MONSTER_ACTION_RADIUS + FLEE_EXTRA);
  });

  it("a monster with a ranged attack and a water monster do not back off", () => {
    const party = createDefaultParty();
    const e = encounter([
      { id: archer.id, x: 10, y: 1, hurt: true },
      { id: swimmer.id, x: 12, y: 3, hurt: true },
    ]);
    monsterTurn(party, shore(5), e, 14, 2, rng("b"), MONSTER_ACTION_RADIUS);
    expect(e.monsters[0]!.x).toBe(10);
    expect(e.monsters[1]!.x).not.toBeLessThan(11);
  });

  it("a party on dry land is not fled from: the monsters come for it as before", () => {
    const party = createDefaultParty();
    const land = { walkable: (x: number, y: number) => x >= 0 && x <= 20 && y >= 0 && y < 5, water: () => false, opaque: () => false } as unknown as GridView;
    const e = encounter([{ id: melee.id, x: 10, y: 2, hurt: true }]);
    monsterTurn(party, land, e, 14, 2, rng("c"), MONSTER_ACTION_RADIUS);
    expect(e.monsters[0]!.x).toBe(11);
  });

  it("in a one-tile corridor the monsters do not block each other: the farthest moves first, and a shooter in the way trades places", () => {
    const party = createDefaultParty();
    const row = shore(1);
    // two hurt monsters in a row: both get one tile farther
    const chain = encounter([
      { id: melee.id, x: 10, y: 0, hurt: true },
      { id: melee.id, x: 9, y: 0, hurt: true },
    ]);
    monsterTurn(party, row, chain, 14, 0, rng("d"), MONSTER_ACTION_RADIUS);
    expect(chain.monsters.map((m) => m.x)).toEqual([9, 8]);
    // an archer stands in the bottleneck between the water and the monster that wants to get away
    const blocked = encounter([
      { id: melee.id, x: 10, y: 0, hurt: true },
      { id: archer.id, x: 9, y: 0 },
    ]);
    monsterTurn(party, row, blocked, 14, 0, rng("e"), MONSTER_ACTION_RADIUS);
    expect(blocked.monsters[0]!.x).toBe(9);
    expect(blocked.monsters[1]!.x).toBe(10);
  });
});

describe("bug_fix_54, point 4: the search field of the big map", () => {
  const poi = (name: string, id: string): Poi => ({ id, name, kind: "town", x: 5, y: 5, size: 2 }) as unknown as Poi;
  const world = { allPois: () => [poi("Fountain Head", "a"), poi("Starthaven", "b"), poi("Mount Haven", "c"), poi("Dark Cave", "d")] };

  it("searches from the third letter on, without case, and finds the text anywhere in the name", () => {
    expect(SEARCH_MIN_LETTERS).toBe(3);
    expect(searchTerm("ha")).toBeNull();
    expect(searchTerm("  Ha ")).toBeNull();
    expect(searchTerm("Hav")).toBe("hav");
    expect(searchPlaces(world, "ha", () => true)).toEqual([]);
    expect(searchPlaces(world, "HAV", () => true).map((p) => p.id)).toEqual(["b", "c"]);
    expect(searchPlaces(world, "cave", () => true).map((p) => p.id)).toEqual(["d"]);
    expect(searchPlaces(world, "", () => true)).toEqual([]);
  });

  it("gives away no place the party has not seen", () => {
    expect(searchPlaces(world, "haven", (p) => p.id === "c").map((p) => p.id)).toEqual(["c"]);
  });
});
