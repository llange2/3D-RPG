import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { emptyContainerLine } from "../../src/data/prop-texts";
import { MONSTERS } from "../../src/data/tables";
import { generateItem } from "../../src/sim/items";
import { DUPLICATION_GOLD, duplicate } from "../../src/sim/itemSpells";
import { FLEE_EXTRA, MONSTER_ACTION_RADIUS, monsterTurn, type Encounter, type GridView } from "../../src/sim/encounter";
import { train, trainAll, trainAllPlan, trainingCap, trainingOrder } from "../../src/sim/economy";
import { createDefaultParty } from "../../src/sim/party";
import { levelUp } from "../../src/sim/character";

const rng = (s: string) => new Rng(seedFromString(s));

describe("bug_fix_55, point 1: a gravestone is searched, not opened", () => {
  it("the empty line of a gravestone names the grave, the others stay", () => {
    expect(emptyContainerLine(32)).toBe("There is nothing more to find in the grave.");
    expect(emptyContainerLine(5)).toBe("The barrel is empty.");
    expect(emptyContainerLine(1)).toBe("The chest is empty.");
  });
});

describe("bug_fix_55, point 4: the training grounds teach up to level tier × 10", () => {
  it("the cap is tier × 10 and the fifth tier has none", () => {
    expect([1, 2, 3, 4].map(trainingCap)).toEqual([10, 20, 30, 40]);
    expect(trainingCap(5)).toBe(Infinity);
  });

  it("a hero at the cap cannot train, in 'Train all' neither; without a tier nothing limits", () => {
    const p = createDefaultParty();
    p.gold = 10_000_000;
    const hero = p.characters[0]!;
    while (hero.level < 40) levelUp(hero, p.talents, 1, p.mascot);
    hero.xp = 1e15;
    expect(train(p, 0, 4)).toMatchObject({ ok: false, reason: "cap", cap: 40 });
    expect(trainingOrder(p, 4)).not.toContain(0);
    expect(trainAllPlan(p, 4).who).not.toContain(0);
    expect(trainAll(p, 4).who).not.toContain(0);
    expect(hero.level).toBe(40);
    expect(train(p, 0, 5).ok).toBe(true);
    expect(hero.level).toBe(41);
  });
});

describe("bug_fix_55, point 6: Duplication sacrifices 10'000 gold in every case", () => {
  function party(gold: number) {
    const p = createDefaultParty();
    p.gold = gold;
    const hero = p.characters[0]!;
    for (const slot of Object.keys(hero.inventory)) hero.inventory[slot] = null;
    hero.inventory.slot1 = { ...generateItem(rng("item"), 1, { forcedMaterial: 2, forcedType: 20 }), id: "i1" };
    return p;
  }

  it("the gold is gone whether the item is copied, destroyed or untouched", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = party(25_000);
      const r = duplicate(p, p.characters[0]!, "slot1", rng(`d${i}`));
      seen.add(r);
      expect(p.gold).toBe(25_000 - DUPLICATION_GOLD);
    }
    expect(seen).toContain("duplicated");
    expect(seen).toContain("destroyed");
    expect(seen).toContain("nothing");
  });

  it("a party with less gold casts nothing and loses nothing", () => {
    const p = party(DUPLICATION_GOLD - 1);
    expect(duplicate(p, p.characters[0]!, "slot1", rng("poor"))).toBe("no_gold");
    expect(p.gold).toBe(DUPLICATION_GOLD - 1);
    expect(p.characters[0]!.inventory.slot1).not.toBeNull();
  });
});

describe("bug_fix_55, point 2: water monsters back off from a party that attacks them from land", () => {
  const entries = Object.entries(MONSTERS).map(([id, m]) => ({ id: Number(id), m }));
  const swimmer = entries.find((e) => e.m.terrain === "water" && !e.m.ranged)!;
  const shooter = entries.find((e) => e.m.terrain === "water" && e.m.ranged);
  const melee = entries.find((e) => !e.m.ranged && e.m.terrain === "land")!;

  /** Water from x = 0 to 10, land beyond it. */
  function coast(rows: number): GridView {
    return {
      walkable: (x: number, y: number) => x > 10 && y >= 0 && y < rows,
      water: (x: number, y: number) => x >= 0 && x <= 10 && y >= 0 && y < rows,
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

  it("a hurt water monster with no way to the party swims away, a healthy one stays", () => {
    const party = createDefaultParty();
    // the party stands two tiles inland: no water tile touches it
    const e = encounter([
      { id: swimmer.id, x: 10, y: 1, hurt: true },
      { id: swimmer.id, x: 10, y: 3 },
    ]);
    monsterTurn(party, coast(5), e, 13, 2, rng("a"), MONSTER_ACTION_RADIUS);
    expect(e.monsters[0]!.x).toBe(9);
    expect(e.monsters[1]!.x).toBe(10);
  });

  it("goes no farther than the action radius + 3 and never leaves the water", () => {
    const party = createDefaultParty();
    const e = encounter([{ id: swimmer.id, x: 10, y: 2, hurt: true }]);
    for (let i = 0; i < 30; i++) monsterTurn(party, coast(5), e, 13, 2, rng(`t${i}`), MONSTER_ACTION_RADIUS);
    expect(13 - e.monsters[0]!.x).toBe(Math.min(MONSTER_ACTION_RADIUS + FLEE_EXTRA, 13));
    expect(e.monsters[0]!.x).toBeGreaterThanOrEqual(0);
  });

  it("a shooter stays, and a land monster is not made to flee by a party on land", () => {
    const party = createDefaultParty();
    if (shooter) {
      const e = encounter([{ id: shooter.id, x: 10, y: 1, hurt: true }]);
      monsterTurn(party, coast(5), e, 13, 2, rng("b"), MONSTER_ACTION_RADIUS);
      expect(e.monsters[0]!.x).toBe(10);
    }
    const land = { walkable: (x: number, y: number) => x >= 0 && x <= 20 && y >= 0 && y < 5, water: () => false, opaque: () => false } as unknown as GridView;
    const e = encounter([{ id: melee.id, x: 10, y: 2, hurt: true }]);
    monsterTurn(party, land, e, 14, 2, rng("c"), MONSTER_ACTION_RADIUS);
    expect(e.monsters[0]!.x).toBe(11);
  });
});
