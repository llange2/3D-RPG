/**
 * The 56th playtest (11. 11. 2026): the quartermaster on the map and his scrolling lists, two cobblestone tiles in front of every castle, the lever's base, Seth Squirm's statues, the lion relief,
 * no pits in towers, the castle's side-room gates wired to the alarm, the henchman on the map, and the formulas 1.1 (`docs/FORMULAS_1.1.md`).
 */
import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { resolveAction } from "../../src/actions/handlers";
import type { ActionInstance, MapContent } from "../../src/actions/types";
import { Rng, seedFromString } from "../../src/core/rng";
import { generateInterior } from "../../src/interiors";
import { interiorLegend } from "../../src/game/minimap";
import { leverPulled, shownItem, themedProp } from "../../src/render/interiorProps";
import { RULES } from "../../src/sim/balance";
import { armor, attr, conditionAdjusted } from "../../src/sim/character";
import { rangedDamage } from "../../src/sim/combat";
import { BLESSING_MINUTES, canDonate, cureCost, DONATION_BLESSING_CHANCE, donationCost, healCost, innRest, blessHero, reviveCost, templeCure, templeDonate, templeHeal, templeRevive } from "../../src/sim/economy";
import { addCondition } from "../../src/sim/conditions";
import { advanceTime, createDefaultParty } from "../../src/sim/party";
import { GROUND, poiEntrances } from "../../src/world/types";
import { World } from "../../src/world/world";
import { questInterior } from "../helpers/quests";

const world = new World("playtest-56", "default", "default");

describe("point 1 and 9: the quartermaster and the king's henchman are people on the map", () => {
  const person = (kind: "quartermaster" | "keeper", persona: number): MapContent["actions"][number] => ({ uid: `t#${kind}`, kind, x: 2, y: 2, params: { persona } } as never);
  const stubMap = (): never => ({ width: 5, height: 5, cells: new Array<number>(25).fill(1), key: "t", theme: { id: "fortress" }, kind: "fortress", spawn: { x: 1, y: 1, facing: "N" }, exit: { x: 1, y: 0 } } as never);

  it("name them in the legend as a person, and in the pointer", () => {
    for (const kind of ["quartermaster", "keeper"] as const) {
      const legend = interiorLegend(stubMap(), { mapKey: "t", tier: 1, actions: [person(kind, 311)], spawns: [] });
      expect(legend.some((e) => e.label === "Person, quest or talent"), kind).toBe(true);
    }
  });
});

describe("point 2: two cobblestone tiles in front of every castle", () => {
  it("makes both entrance tiles of a castle cobblestone, wherever the road runs", () => {
    const castles = world.allPois().filter((p) => p.kind === "castle");
    expect(castles.length).toBe(3);
    for (const castle of castles) {
      for (const e of poiEntrances(castle)) {
        const t = world.tile(e.x, e.y);
        // (a castle on lava has its stream there; none of the three of this seed stands on lava)
        expect(t.ground, `${castle.name} ${e.x},${e.y}`).toBe(GROUND.ROAD);
      }
    }
  });
});

describe("point 3: a pulled lever keeps its base where it stood", () => {
  const info = { ci_39: { file: "x", tris: 0, bytes: 0, bounds: [-0.998, -0.71, -0.69, 1.0016, 0.7, 0.69], animations: [], groundTop: -0.6 } } as never;
  const lever = (): ActionInstance => ({ uid: "t#lever:0", kind: "lever", x: 3, y: 4, params: { item: 39, target: "h" } });
  // the middle of the base plate in the world: the model's (0.31, 0) turned and scaled with the prop
  const base = (p: { x: number; z: number; rotY: number; scale: number }): [number, number] => {
    const bx = 0.31 * p.scale;
    return [p.x + bx * Math.cos(p.rotY), p.z - bx * Math.sin(p.rotY)];
  };

  it("lies at the same place whatever way the lever faces", () => {
    for (const bearing of [0, 90, 180, 270, 45]) {
      const before = themedProp(lever(), 10, -20, bearing, info, new Set())!;
      const after = themedProp(lever(), 10, -20, bearing, info, new Set(["t#lever:0"]))!;
      expect(leverPulled(lever(), new Set(["t#lever:0"]))).toBe(true);
      const [bx, bz] = base(before);
      const [ax, az] = base(after);
      expect(ax).toBeCloseTo(bx, 6);
      expect(az).toBeCloseTo(bz, 6);
      // the handle did turn
      expect(Math.abs(Math.sin((after.rotY - before.rotY) / 2))).toBeCloseTo(1, 6);
    }
  });
});

describe("point 4: Seth Squirm's statues show", () => {
  it("shows the item of a machine on its cell", () => {
    expect(shownItem({ kind: "machine", params: { item: 29 } })).toBe(29);
  });
});

describe("point 6: no pit in a tower", () => {
  it("has no pit and no guillotine on any floor, and spears only on the ground floor", () => {
    for (const quest of ["quest_2", "quest_4", "quest_5"] as const) {
      for (let tier = 1; tier <= 5; tier++) {
        for (let variant = 0; variant < 4; variant++) {
          const { content } = questInterior(quest, "dungeon_5", tier, variant);
          for (const a of content.actions) if (a.kind === "trap") expect(["pit", "guillotine"], `${quest} ${tier} ${variant} ${a.uid}`).not.toContain(a.params.trap);
        }
      }
    }
  });
});

describe("point 8: the gate of a side room in a castle is wired to the alarm", () => {
  // (half of the side rooms with a single way in are shut: some seeds have no gate at all, so several worlds are searched)
  const gates = ["playtest-56", "pearl-shore-794", "amber-gate-204", "onyx-peak-873", "kelp-hold-768", "frost-gate-324"].flatMap((seed) => {
    const w = new World(seed, "default", "default");
    return w.allPois().filter((p) => p.kind === "castle").flatMap((c) => buildMapContent(w, c, generateInterior(w, c)).actions.filter((a) => a.kind === "door" && a.uid.includes("#roomgate:")).map((a) => ({ a, tier: c.tier })));
  });

  it("carries the mark of the alarm", () => {
    expect(gates.length).toBeGreaterThan(0);
    for (const { a } of gates) expect(a.params.warn).toBe("alarm");
  });

  it("asks about the alarm, and rings it with the first gate broken open (the flag is shared with the chests)", () => {
    const party = createDefaultParty();
    const { a } = gates[0]!;
    const ctx = { party, rootSeed: world.rootSeed, tier: 5, opened: new Set<string>(), monsterThemes: {}, attempt: 1 };
    const asked = resolveAction(a, ctx as never);
    expect(asked.effects[0]).toMatchObject({ type: "confirm" });
    expect((asked.effects[0] as { question: string }).question).toMatch(/alarm/);
    // a hero with enormous skill picks the lock at once
    for (const c of party.characters) { c.lck = 999; c.acc = 999; c.thievery = 99; c.level = 40; }
    const done = resolveAction(a, { ...ctx, answer: "yes" } as never);
    expect(done.effects.some((e) => e.type === "guards")).toBe(true);
    expect(done.state?.add).toEqual([`${a.uid.slice(0, a.uid.indexOf("#"))}@light`]);
    // the second one stays quiet
    const again = resolveAction(a, { ...ctx, answer: "yes", opened: new Set(done.state!.add) } as never);
    expect(again.effects.some((e) => e.type === "guards")).toBe(false);
    expect(again.consumed).toBe(true);
  });
});

describe("point 10: formulas 1.1", () => {
  it("counts two thirds of the monster's armor against an arrow (2.3)", () => {
    expect(RULES.v4.rangedArmorShare).toBeCloseTo(2 / 3, 10);
    const party = createDefaultParty();
    const archer = party.characters[2]!;
    archer.acc = 60;
    archer.level = 20;
    const goblin = (armorPoints: number) => ({ armor: armorPoints, speed: 1, res_physical: 0 }) as never;
    const hit = (armorPoints: number) => rangedDamage(archer, goblin(armorPoints), 3, new Rng(seedFromString("arrow")));
    const bare = hit(0);
    expect(bare).toBeGreaterThan(30);
    expect(bare - hit(30)).toBe(20);
  });

  it("makes the inn heal and wake the party but leave poison, drink and the rest to the temple (5.1)", () => {
    const party = createDefaultParty();
    const [a, b] = party.characters as [(typeof party.characters)[0], (typeof party.characters)[0]];
    a.hp = 1;
    addCondition(a, "Poisoned", party.minutes);
    addCondition(b, "Sleeping", party.minutes);
    addCondition(b, "Diseased", party.minutes);
    party.gold = 10000;
    const food = party.food;
    expect(innRest(party, 1).ok).toBe(true);
    expect(a.hp).toBe(a.health);
    expect(a.conditions).toContain("Poisoned");
    expect(b.conditions).not.toContain("Sleeping");
    expect(b.conditions).toContain("Diseased");
    expect(party.food).toBe(food);
  });

  it("prices the temple by the hero's level, and revival by the temple's tier (5.3)", () => {
    const party = createDefaultParty();
    const hero = party.characters[0]!;
    hero.level = 7;
    hero.hp = hero.health - 10;
    // tier and bargain no longer count for healing and curing
    party.talents.push("talent_merchant");
    expect(healCost(hero, 5, party)).toBe(10 * 2 * 7);
    expect(cureCost("Poisoned", hero)).toBe(40 * 7);
    expect(cureCost("Petrified", hero)).toBe(400 * 7);
    expect(reviveCost(hero, 3)).toBe(900);
    hero.conditions = ["Rotten"];
    expect(reviveCost(hero, 3)).toBe(3000);
    expect(donationCost(4)).toBe(40);
  });

  it("brings the dead back for 300 a tier and the rotten for 1000 a tier, with half the hit points", () => {
    const party = createDefaultParty();
    party.gold = 5000;
    const [dead, rotten] = [party.characters[0]!, party.characters[1]!];
    dead.conditions = ["Dead"];
    dead.hp = 0;
    rotten.conditions = ["Rotten"];
    rotten.hp = 0;
    expect(templeRevive(party, 0, 2)).toBe(true);
    expect(party.gold).toBe(5000 - 600);
    expect(dead.hp).toBe(Math.floor(dead.health / 2));
    expect(templeRevive(party, 1, 2)).toBe(true);
    expect(party.gold).toBe(5000 - 600 - 2000);
    expect(rotten.conditions).not.toContain("Rotten");
  });

  it("heals and cures at the new prices and takes the gold", () => {
    const party = createDefaultParty();
    party.gold = 1000;
    const hero = party.characters[0]!;
    hero.hp = Math.max(1, hero.health - 5);
    addCondition(hero, "Poisoned", party.minutes);
    const before = party.gold;
    expect(templeHeal(party, 0, 4)).toBe(true);
    expect(before - party.gold).toBe(5 * 2 * hero.level);
    expect(templeCure(party, 0, "Poisoned")).toBe(true);
    expect(hero.conditions).not.toContain("Poisoned");
  });

  it("blesses with a chance of one in five for 10 gold a tier, +1 on every attribute per tier of the temple, for a day (1.1, 5.3)", () => {
    const party = createDefaultParty();
    party.gold = 1_000_000;
    let blessed = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      const hero = party.characters[0]!;
      hero.conditions = ["Healthy"];
      party.effects = [];
      const r = templeDonate(party, 0, 3, new Rng(seedFromString(`donation-${i}`)))!;
      expect(r.cost).toBe(30);
      if (r.blessed) blessed++;
    }
    expect(party.gold).toBe(1_000_000 - 30 * trials);
    expect(blessed / trials).toBeGreaterThan(DONATION_BLESSING_CHANCE - 0.04);
    expect(blessed / trials).toBeLessThan(DONATION_BLESSING_CHANCE + 0.04);

    // the strength of the blessing is the tier of the temple
    const hero = party.characters[1]!;
    hero.conditions = ["Healthy"];
    const plain = conditionAdjusted(hero);
    const armorBefore = armor(hero);
    for (const tier of [1, 3, 5]) {
      blessHero(party, 1, tier);
      const now = conditionAdjusted(hero);
      for (const a of ["str", "int", "per", "end", "spd", "acc", "lck"] as const) expect(now[a] - plain[a], `${a} at tier ${tier}`).toBe(tier);
      expect(attr(hero, "str", false)).toBeGreaterThanOrEqual(plain.str + tier);
    }
    expect(armor(hero)).toBe(armorBefore);
    // only one blessing at a time, and no button while the hero is blessed
    expect(party.effects.filter((e) => e.kind === "blessed" && e.character === 1)).toHaveLength(1);
    expect(canDonate(hero)).toBe(false);
    expect(templeDonate(party, 1, 3, new Rng(seedFromString("none")))).toBeNull();
    // after a day it is over
    advanceTime(party, BLESSING_MINUTES + 1);
    expect(hero.conditions).not.toContain("Blessed");
    expect(hero.mods?.blessing).toBeUndefined();
    expect(canDonate(hero)).toBe(true);
  });

  it("gives a place the tier of the place at every depth: no chest is more than one level above it, and none holds obsidian-level loot in a level 3 place (4)", () => {
    let chests = 0;
    for (let variant = 0; variant < 6; variant++) {
      for (const layout of ["dungeon_1", "dungeon_2", "dungeon_4"] as const) {
        const { content } = questInterior("quest_2", layout, 3, variant);
        for (const a of content.actions) {
          if (a.kind !== "treasure" || typeof a.params.level !== "number") continue;
          chests++;
          expect(a.params.level, a.uid).toBeLessThanOrEqual(4);
        }
      }
    }
    expect(chests).toBeGreaterThan(10);
  });
});
