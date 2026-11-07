import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { CHALICE_ITEM, heapGone } from "../../src/actions/registry";
import { DECO_MODELS, WALL_DECO_ITEMS, WALL_DECO_SPACING, wallDecoChoices } from "../../src/data/wall-deco";
import { MONSTERS, monsterGroup } from "../../src/data/tables";
import { generateInterior, planDungeon } from "../../src/interiors";
import { describeInteriorCell } from "../../src/game/minimap";
import { worldQuestLog } from "../../src/game/questLog";
import { BANK_SLIDER_STEPS, bankSliderAmount } from "../../src/sim/economy";
import { createDefaultParty, advanceTime } from "../../src/sim/party";
import { PANDORA_PER_DAY, castSpell } from "../../src/sim/spells";
import { earlyMissChance } from "../../src/sim/balance";
import { createCharacter } from "../../src/sim/character";
import { monsterDamage } from "../../src/sim/combat";
import { makeItem } from "../../src/sim/items";
import { Rng } from "../../src/core/rng";
import { World } from "../../src/world/world";

const rng = () => new Rng([1, 2, 3, 4]);

describe("45th playtest, point 4: the wall decorations of the dungeons", () => {
  it("lists the moose king and the six reliefs, each with a model, and gives every kind of monster the lion and the moose", () => {
    expect(WALL_DECO_ITEMS).toEqual([125, 304, 305, 306, 307, 308, 309]);
    expect(Object.keys(DECO_MODELS)).toHaveLength(6);
    for (const group of ["humanoid", "monster_humanoid", "beast", "undead", "plant", "robot", "magical_construct"] as const) {
      expect(wallDecoChoices(group)).toContain(309);
      expect(wallDecoChoices(group)).toContain(125);
    }
    // the wizard, the witch and the barbarian go with humanoids, the demons with beasts, and not the other way round
    expect(wallDecoChoices("humanoid")).toEqual(expect.arrayContaining([304, 305, 306]));
    expect(wallDecoChoices("humanoid")).not.toContain(307);
    expect(wallDecoChoices("beast")).toEqual(expect.arrayContaining([307, 308]));
    expect(wallDecoChoices("beast")).not.toContain(304);
    expect(wallDecoChoices("undead")).toEqual([309, 125]);
  });

  it("hangs exactly one kind in a dungeon, the one that fits its monsters, with room between the reliefs", { timeout: 240_000 }, () => {
    const world = new World("deco-45", "default");
    const kinds = new Set<number>();
    let hungDungeons = 0;
    for (const poi of world.allPois().filter((p) => p.kind === "dungeon" && planDungeon(world, p)?.klass !== "C")) {
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      const hung = content.actions.filter((a) => a.kind === "decor" && WALL_DECO_ITEMS.includes(Number(a.params.item)));
      const items = new Set(hung.map((a) => Number(a.params.item)));
      expect(items.size, `${poi.id}: one kind only`).toBeLessThanOrEqual(1);
      if (hung.length === 0) continue;
      hungDungeons++;
      const item = [...items][0]!;
      kinds.add(item);
      const look = map.dungeon!.look;
      expect(wallDecoChoices(monsterGroup(look.monsters[0]!) as never), `${poi.id}: ${item} goes with ${MONSTERS[look.monsters[0]!]!.name}`).toContain(item);
      for (const a of hung) for (const b of hung) {
        if (a === b) continue;
        expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)), `${poi.id}: ${a.uid} and ${b.uid}`).toBeGreaterThanOrEqual(WALL_DECO_SPACING / 2);
      }
    }
    expect(hungDungeons).toBeGreaterThan(5);
    // over a whole world more than one kind turns up
    expect(kinds.size).toBeGreaterThan(1);
  });

  it("hangs nothing in a cave (the caves keep their short list of props)", { timeout: 120_000 }, () => {
    const world = new World("deco-45", "default");
    for (const poi of world.allPois().filter((p) => p.kind === "cave").slice(0, 6)) {
      const content = buildMapContent(world, poi, generateInterior(world, poi));
      expect(content.actions.filter((a) => a.kind === "decor" && WALL_DECO_ITEMS.includes(Number(a.params.item)))).toEqual([]);
    }
  });
});

describe("45th playtest, point 10: the sliders of the bank", () => {
  it("run from nothing to everything, in fine steps at the bottom, and never above the sum", () => {
    for (const max of [1, 7, 350, 12_345, 5_000_000, 987_654_321]) {
      expect(bankSliderAmount(max, 0)).toBe(0);
      expect(bankSliderAmount(max, BANK_SLIDER_STEPS)).toBe(max);
      let last = 0;
      for (let p = 1; p <= BANK_SLIDER_STEPS; p++) {
        const v = bankSliderAmount(max, p);
        expect(v).toBeGreaterThanOrEqual(last);
        expect(v).toBeLessThanOrEqual(max);
        last = v;
      }
    }
    expect(bankSliderAmount(0, 500)).toBe(0);
    // with millions in the vault the hundreds are still within reach of the first steps
    expect(bankSliderAmount(5_000_000, 50)).toBeLessThan(1_000);
    expect(bankSliderAmount(5_000_000, 500)).toBeGreaterThan(100_000);
  });
});

describe("45th playtest, point 8: Pandora's box three times a day", () => {
  it("fizzles on the fourth cast of a game day, without paying, and starts again at midnight", () => {
    const party = createDefaultParty();
    const caster = party.characters.find((c) => c.spells.includes(2));
    // the box is no starting spell: give it to the first hero (any school has it as a spell of the sheet)
    const hero = caster ?? party.characters[0]!;
    if (!hero.spells.includes(2)) hero.spells.push(2);
    hero.mana = hero.sp = 500;
    const cast = () => castSpell(party, party.characters.indexOf(hero), 2, rng(), {});
    const before = party.minutes;
    for (let i = 0; i < PANDORA_PER_DAY; i++) expect(cast().kind, `cast ${i + 1}`).toBe("pandora");
    const sp = hero.sp;
    const fourth = cast();
    expect(fourth).toEqual({ kind: "fizzle", reason: "pandora_spent" });
    expect(hero.sp).toBe(sp);
    // up to midnight it stays shut
    advanceTime(party, 1440 - (before % 1440) - 1);
    expect(cast().kind).toBe("fizzle");
    advanceTime(party, 1);
    expect(cast().kind).toBe("pandora");
  });
});

describe("45th playtest, points 1 and 7: what has been taken or drunk leaves the map", () => {
  const chalice = { uid: "m#c", kind: "chalice" as const, x: 3, y: 4, params: { item: CHALICE_ITEM, bonus: "level", amount: 1 } };
  const well = { uid: "m#w", kind: "chalice" as const, x: 5, y: 4, params: { item: 37, bonus: "attr", attr: "str", amount: 5 } };
  const orb = { uid: "m#o", kind: "treasure" as const, x: 6, y: 4, params: { chest: 109, quest: "quest_orb", level: 1, gold: 0, items: 0 } };

  it("a drunk chalice and a taken orb are gone, a well with points stays", () => {
    expect(heapGone(chalice, new Set())).toBe(false);
    expect(heapGone(chalice, new Set(["m#c"]))).toBe(true);
    expect(heapGone(well, new Set(["m#w"]))).toBe(false);
    expect(heapGone(orb, new Set())).toBe(false);
    expect(heapGone(orb, new Set(["m#o"]))).toBe(true);
  });

  it("the map no longer names them", () => {
    const world = new World("gone-45", "small");
    const poi = world.allPois().find((p) => p.kind === "dungeon")!;
    const map = generateInterior(world, poi);
    const content = { ...buildMapContent(world, poi, map), actions: [chalice, orb] };
    const explored = { has: () => true, add: () => undefined } as never;
    expect(describeInteriorCell(map, content, explored, new Set(), 3, 4, [], new Set(), false, true)).toBe("Chalice");
    expect(describeInteriorCell(map, content, explored, new Set(), 6, 4, [], new Set(), false, true)).toBe("Chest");
    const opened = new Set(["m#c", "m#o"]);
    expect(describeInteriorCell(map, content, explored, opened, 3, 4, [], new Set(), false, true)).not.toMatch(/Chalice/);
    expect(describeInteriorCell(map, content, explored, opened, 6, 4, [], new Set(), false, true)).not.toMatch(/Chest/);
  });
});

describe("45th playtest, point 7: the quest log on the stone heads", () => {
  it("says to solve the mystery of the stone heads", () => {
    const world = new World("log-45", "default");
    const place = world.allPois().find((p) => planDungeon(world, p)?.quest === "quest_2");
    expect(place).toBeDefined();
    const view = worldQuestLog({ world, opened: new Set(), visited: new Set(world.allPois().map((p) => p.id)), carried: () => 0 });
    const lines = [...view.open, ...view.done].filter((l) => /stone heads/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(/mystery of the stone heads in /);
      expect(line).not.toMatch(/face the right/);
    }
  });
});

describe("45th playtest, the trial of the user: armor as a share, and an extra miss on levels 1 to 3", () => {
  const knight = (level: number, arm: number) => {
    const hero = createCharacter({ name: "T", classType: "Knight", raceType: "Human", avatar: "character05", attrs: { str: 10, int: 10, per: 10, end: 10, spd: 20, acc: 10, lck: 10 } });
    hero.inventory.body_armor = makeItem({ name: "Mail", type: "chain_mail", bonus: { arm } });
    hero.level = level;
    return hero;
  };
  const blow = { ...Object.values(MONSTERS).find((m) => m.attack_type === "Physical")!, damage_min: 30, damage_max: 30 };
  const party = createDefaultParty();
  const missRate = (level: number): number => {
    let missed = 0;
    for (let i = 0; i < 4000; i++) if (monsterDamage(party, blow, knight(level, 0), false, 1, new Rng([i, 7, 7, 7])) === 0) missed++;
    return missed / 4000;
  };

  it("misses a hero of level 1, 2 and 3 on 50, 30 and 15 percent more of the attacks, none from level 4 on", () => {
    expect(missRate(1)).toBeGreaterThan(0.46);
    expect(missRate(1)).toBeLessThan(0.54);
    expect(missRate(2)).toBeGreaterThan(0.26);
    expect(missRate(2)).toBeLessThan(0.34);
    expect(missRate(3)).toBeGreaterThan(0.12);
    expect(missRate(3)).toBeLessThan(0.18);
    expect(missRate(4)).toBe(0);
    expect(earlyMissChance(1)).toBe(0.5);
    expect(earlyMissChance(40)).toBe(0);
  });

  it("takes a hit down to 30 / (30 + armor) of the roll", () => {
    const hit = (arm: number) => monsterDamage(party, blow, knight(4, arm), false, 1, new Rng([1, 2, 3, 4]));
    expect([0, 10, 30, 60, 120].map(hit)).toEqual([30, 22, 15, 10, 6]);
  });
});
