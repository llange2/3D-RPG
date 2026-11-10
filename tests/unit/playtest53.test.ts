/** The 53rd playtest (bug_fix_50, 10. 11. 2026): spells, targets, costs, texts and the numbers of one monster. */
import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, SPELLS } from "../../src/data/tables";
import { addCondition, gainAttribute, recalcValues } from "../../src/sim/character";
import { castSpell, spellCost, validTarget } from "../../src/sim/spells";
import { questInterior } from "../helpers/quests";
import { SUPPORT_BEAM } from "../../src/actions/registry";
import { isBookshelf } from "../../src/data/spell-loot";
import { CELL, FACING_DELTA } from "../../src/interiors/types";
import { clueFlag, reachedFlag, worldQuestLog } from "../../src/game/questLog";
import { World } from "../../src/world/world";
import { letterHints } from "../../src/data/letter-hints";
import { carriedItems, createDefaultParty, normalizeParty } from "../../src/sim/party";
import { buyBackItem, sellItem, sellPrice } from "../../src/sim/economy";
import { averageDamageLines, averageHit, meleeDamage, rangedDamage } from "../../src/sim/combat";
import { makeItem } from "../../src/sim/items";
import { createEncounter, createMonster, lineOfSight, monsterTurn, wayToPlayer, type GridView } from "../../src/sim/encounter";
import { EQUIPMENT_SLOTS } from "../../src/sim/types";

const SCALING = [8, 10, 17, 20, 25, 28, 37, 39, 44, 50, 63];

describe("spell costs grow with the level of the caster (point 16)", () => {
  it("flags exactly the spells of column H", () => {
    const flagged = Object.values(SPELLS).filter((s) => s.scales_with_level).map((s) => s.id);
    expect(flagged.sort((a, b) => a - b)).toEqual(SCALING);
  });

  it("multiplies the cost by the level for those and for no other", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    c.level = 7;
    // half the rate since the 54th playtest, rounded up
    expect(spellCost(SPELLS[8]!, c)).toBe(Math.ceil((SPELLS[8]!.mana * 7) / 2));
    expect(spellCost(SPELLS[4]!, c)).toBe(SPELLS[4]!.mana);
    expect(spellCost(SPELLS[30]!, c)).toBe(SPELLS[30]!.mana);
  });

  it("pays what the window shows, and refuses a caster who cannot afford it", () => {
    const party = createDefaultParty();
    const i = party.characters.findIndex((c) => c.classType === "Cleric" || c.classType === "Druid" || c.classType === "Wizard");
    const c = party.characters[i]!;
    c.level = 5;
    c.spells.push(28); // Power Cure, 5 mana per caster level
    const price = spellCost(SPELLS[28]!, c);
    expect(price).toBe(Math.ceil((SPELLS[28]!.mana * 5) / 2));
    c.sp = price - 1;
    const rng = new Rng(seedFromString("cost"));
    expect(castSpell(party, i, 28, rng, { target: 0 })).toEqual({ kind: "fizzle", reason: "mana" });
    expect(c.sp).toBe(price - 1);
    c.sp = 40;
    expect(castSpell(party, i, 28, rng, { target: 0 }).kind).toBe("heal");
    expect(c.sp).toBe(40 - price);
  });

  it("says so in the text", () => {
    expect(SPELLS[44]!.text).toContain("per caster level");
    expect(SPELLS[4]!.text).not.toContain("per caster level");
  });
});

describe("no spell on the dead or the rotten except the ones that raise them (point 22)", () => {
  it("knows who can be picked", () => {
    const party = createDefaultParty();
    const live = party.characters[0]!;
    const dead = party.characters[1]!;
    const rotten = party.characters[2]!;
    addCondition(dead, "Dead", party.minutes);
    addCondition(rotten, "Dead", party.minutes);
    addCondition(rotten, "Rotten", party.minutes);
    for (const id of [4, 7, 35, 11, 20, 46, 56]) {
      expect(validTarget(id, live)).toBe(true);
      expect(validTarget(id, dead)).toBe(false);
      expect(validTarget(id, rotten)).toBe(false);
    }
    expect(validTarget(65, dead)).toBe(true);
    expect(validTarget(65, live)).toBe(false);
    expect(validTarget(65, rotten)).toBe(false);
    expect(validTarget(70, rotten)).toBe(true);
    expect(validTarget(70, dead)).toBe(false);
  });

  it("refuses a heal on the dead without taking spell points", () => {
    const party = createDefaultParty();
    const i = party.characters.findIndex((c) => c.classType === "Cleric");
    const healer = party.characters[i >= 0 ? i : 3]!;
    healer.spells.push(4);
    healer.sp = 20;
    const dead = party.characters[0] === healer ? party.characters[1]! : party.characters[0]!;
    addCondition(dead, "Dead", party.minutes);
    const at = party.characters.indexOf(dead);
    const hpBefore = dead.hp;
    const rng = new Rng(seedFromString("dead"));
    expect(castSpell(party, party.characters.indexOf(healer), 4, rng, { target: at })).toEqual({ kind: "fizzle", reason: "no_effect" });
    expect(healer.sp).toBe(20);
    expect(dead.hp).toBe(hpBefore);
  });
});

describe("texts and numbers of the sheets (points 2 and 3)", () => {
  it("calls the damage of Energy Blast, Star Burst and Implosion magical", () => {
    for (const id of [8, 76, 77]) {
      expect(SPELLS[id]!.text).toContain("magical damage");
      expect(SPELLS[id]!.text.toLowerCase()).not.toContain("energy damage");
      expect(SPELLS[id]!.dam_type).toEqual(["magic"]);
    }
  });

  it("gives the Terminator 80 % physical resistance, the value of docs/RPG_0.1.xlsx", () => {
    const terminator = Object.values(MONSTERS).find((m) => m.name === "Terminator");
    expect(terminator).toBeDefined();
    expect(terminator!.res_physical).toBe(0.8);
  });
});

describe("health follows the attributes a hero gains (point 27)", () => {
  it("gives a Wizard of level 10 the health of Endurance 25", () => {
    const party = createDefaultParty();
    const wizard = party.characters[0]!;
    wizard.classType = "Wizard";
    wizard.level = 10;
    wizard.end = 15;
    recalcValues(wizard, party.talents, true, party.mascot);
    const before = wizard.health;
    gainAttribute(wizard, "end", 10, party.talents, party.mascot);
    // END / 2 per level: five more points of health on each of the ten levels
    expect(wizard.health).toBe(before + 50);
    expect(wizard.hp).toBe(wizard.health);
  });

  it("repairs a save in which the attribute was raised but the health was not", () => {
    const party = createDefaultParty();
    const wizard = party.characters[0]!;
    wizard.classType = "Wizard";
    wizard.level = 10;
    wizard.end = 15;
    recalcValues(wizard, party.talents, true, party.mascot);
    const old = wizard.health;
    wizard.end = 25; // what the chalice did before the fix
    normalizeParty(party);
    expect(wizard.health).toBe(old + 50);
    expect(wizard.hp).toBe(old + 50);
    const again = wizard.health;
    normalizeParty(party);
    expect(wizard.health).toBe(again); // a second run changes nothing
  });
});

/** A map from rows of text ('#' wall, '.' floor); `edges` are wall pieces or beams on the border of two cells. */
function gridOf(rows: string[], edges: [number, number, number, number][] = []): GridView {
  const at = (x: number, y: number) => rows[y]?.[x] ?? "#";
  return {
    walkable: (x, y) => at(x, y) === ".",
    water: () => false,
    opaque: (x, y) => at(x, y) === "#",
    wallBetween: (x0, y0, x1, y1) => edges.some(([a, b, c, d]) => (a === x0 && b === y0 && c === x1 && d === y1) || (a === x1 && b === y1 && c === x0 && d === y0)),
  };
}

describe("a shot never grazes a wall corner on a slanted line (point 26)", () => {
  // Catacombs of Lunzea: party on 17/57, archer on 14/58, wall on 16/58: dx 3, dy -1, the line touches only the corner of the wall
  const rows = ["....", "..#."];
  it("is stopped by the corner in every mirrored and turned position", () => {
    expect(lineOfSight(gridOf(rows), null, 0, 1, 3, 0)).toBe(false);
    expect(lineOfSight(gridOf(rows), null, 3, 0, 0, 1)).toBe(false);
    // mirrored left to right: wall on (1,1), line from (3,1) to (0,0)
    expect(lineOfSight(gridOf(["....", ".#.."]), null, 3, 1, 0, 0)).toBe(false);
    // turned: the same slope along the other axis
    expect(lineOfSight(gridOf(["..", "..", ".#", ".."]), null, 1, 0, 0, 3)).toBe(false);
    expect(lineOfSight(gridOf(["..", ".#", "..", ".."]), null, 0, 3, 1, 0)).toBe(false);
  });

  it("still passes when the wall is not at that corner, and on an exact diagonal along one wall", () => {
    expect(lineOfSight(gridOf(["....", "...."]), null, 0, 1, 3, 0)).toBe(true);
    expect(lineOfSight(gridOf(["....", "#..."]), null, 0, 1, 3, 0)).toBe(true);
    expect(lineOfSight(gridOf([".#.", "...", "..."]), null, 0, 0, 1, 1)).toBe(true);
  });

  it("keeps an archer from shooting past that corner", () => {
    const archer = Object.values(MONSTERS).find((m) => m.terrain === "land" && m.special_abilties?.includes("Ranged Attack"))!;
    const party = createDefaultParty();
    const enc = createEncounter();
    enc.monsters.push(createMonster("shooter", archer.id, 0, 1));
    enc.monsters[0]!.alerted = true;
    enc.monsters[0]!.immobile = 99; // it stays where it is: the shot from there is the question
    const events = monsterTurn(party, gridOf(rows), enc, 3, 0, new Rng(seedFromString("corner")));
    expect(events.some((e) => e.type === "monster_attack")).toBe(false);
  });
});

describe("a support beam shuts the way for monsters too (point 14)", () => {
  const land = Object.values(MONSTERS).find((m) => m.terrain === "land" && !m.special_abilties?.includes("Ranged Attack"))!;
  it("finds no way across the edge of a beam in a corridor, and a way where there is none", () => {
    const corridor = ["........"];
    expect(wayToPlayer(gridOf(corridor), land, 0, 0, 7, 0, 8)).not.toBeNull();
    expect(wayToPlayer(gridOf(corridor, [[3, 0, 4, 0]]), land, 0, 0, 7, 0, 8)).toBeNull();
  });

  it("walks round a beam in a room instead of across it", () => {
    const room = ["........", "........", "........"];
    const way = wayToPlayer(gridOf(room, [[3, 1, 4, 1]]), land, 0, 1, 7, 1, 8)!;
    expect(way).not.toBeNull();
    let at: [number, number] = [0, 1];
    for (const [x, y] of way) {
      expect((at[0] === 3 && at[1] === 1 && x === 4 && y === 1) || (at[0] === 4 && at[1] === 1 && x === 3 && y === 1)).toBe(false);
      at = [x, y];
    }
  });
});

describe("the end room of a tower is a pocket reached by teleport, never a sealed room in the rock between the floors (point 6)", () => {
  it("is isolated for the towers of quest 4 and 5 and keeps the hall wall or a pocket for quest 2", () => {
    let checked = 0;
    for (const quest of ["quest_4", "quest_5"] as const) {
      for (let variant = 0; variant < 6; variant++) {
        for (const tier of [1, 2, 3, 4, 5]) {
          const { ref } = questInterior(quest, "dungeon_5", tier, variant);
          expect(ref.endRoom, `${quest} ${tier} ${variant}`).toBeDefined();
          expect(ref.endRoom!.isolated, `${quest} tier ${tier} variant ${variant}`).toBe(true);
          expect(ref.endRoom!.seal).toBeUndefined();
          checked++;
        }
      }
    }
    for (let variant = 0; variant < 6; variant++) {
      const { ref } = questInterior("quest_2", "dungeon_5", 1 + (variant % 5), variant);
      expect(ref.endRoom).toBeDefined();
      expect(ref.hall).toBeDefined();
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("no name is told twice in the hints of one word (point 12)", () => {
  const NAMES_ALL = [...new Set(["Aldric", "Arno", "Alma", "Aveline", "Anselm", "Agnes", "Ben", "Bram", "Brenna", "Bettina", "Benno", "Beatrix", "Conrad", "Cedric", "Clara", "Cora", "Caspar", "Charlotte"])];
  it("gives every statue of CABBAGE, BANANA and ALABAMA its own name", () => {
    for (const word of ["cabbage", "banana", "alabama", "abba"]) {
      for (let seed = 0; seed < 300; seed++) {
        const { hints } = letterHints(new Rng(seedFromString(`${word}-${seed}`)), word);
        const seen = new Map<string, number>();
        hints.forEach((text, i) => {
          for (const name of NAMES_ALL) if (new RegExp(`\\b${name}\\b`).test(text)) seen.set(name, (seen.get(name) ?? 0) + 1 + (i < 0 ? 1 : 0));
        });
        for (const [name, n] of seen) expect(n, `${word} ${seed}: ${name} told ${n} times\n${hints.join("\n")}`).toBe(1);
      }
    }
  });
});

describe("bookshelves stand at a wall and rooms with stone columns have no beams (points 10 and 15)", () => {
  const places = () => {
    const out: ReturnType<typeof questInterior>[] = [];
    for (const quest of ["quest_2", "quest_6", "quest_5"] as const) {
      for (const layout of ["dungeon_1", "dungeon_2", "dungeon_3", "dungeon_4"] as const) {
        for (let variant = 0; variant < 4; variant++) out.push(questInterior(quest, layout, 1 + (variant % 5), variant));
      }
    }
    return out;
  };

  it("never puts a bookshelf on a cell without a wall beside it", () => {
    let shelves = 0;
    for (const { map, content } of places()) {
      for (const a of content.actions) {
        if (a.kind !== "treasure" || !isBookshelf(a.params.chest)) continue;
        shelves++;
        const walls = (Object.keys(FACING_DELTA) as (keyof typeof FACING_DELTA)[]).filter((f) => map.cells[(a.y + FACING_DELTA[f].dy) * map.width + a.x + FACING_DELTA[f].dx] !== CELL.FLOOR);
        expect(walls.length, `${map.key} ${a.x}/${a.y}`).toBeGreaterThan(0);
      }
    }
    expect(shelves).toBeGreaterThan(0);
  });

  it("hangs no wooden beam in a room that has stone columns", () => {
    let withColumns = 0;
    for (const { map, content } of places()) {
      const roomsWithColumns = new Set((map.pillars ?? []).map((p) => map.roomOf[p.y * map.width + p.x]));
      if (roomsWithColumns.size === 0) continue;
      withColumns++;
      for (const a of content.actions) {
        if (a.kind !== "decor" || Number(a.params.item) !== SUPPORT_BEAM) continue;
        expect(roomsWithColumns.has(map.roomOf[a.y * map.width + a.x]), `${map.key}: beam ${a.x}/${a.y} in a room with columns`).toBe(false);
      }
    }
    expect(withColumns).toBeGreaterThan(0);
  });
});

describe("the quest log keeps the clues of a cave for the mouse-over (point 5)", () => {
  it("shows what the party read in a cave, open and done", () => {
    const world = new World("pearl-shore-794", "default");
    const cave = world.allPois().find((p) => p.kind === "cave" && world.dungeonRef(p.id)?.quest === "quest_6");
    expect(cave).toBeDefined();
    const visited = new Set([cave!.id]);
    const text = "The first brother was called Conrad.";
    const opened = new Set([clueFlag(cave!.id, text)]);
    const before = worldQuestLog({ world, opened, visited, carried: () => 0 });
    const line = before.open.find((l) => l.includes(cave!.name));
    expect(line).toBeDefined();
    expect(before.notes?.[line!]).toBe(text);
    opened.add(reachedFlag(cave!.id));
    const after = worldQuestLog({ world, opened, visited, carried: () => 0 });
    const doneLine = after.done.find((l) => l.includes(cave!.name));
    expect(after.notes?.[doneLine!]).toBe(text);
  });
});

describe("the smith lets the party buy back what it sold (point 7)", () => {
  it("returns the item for the gold the smith paid, and refuses without gold or room", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    const item = makeItem({ name: "Old Sword", type: "sword", value: 400, bonus: { dam_min: 2, dam_max: 5 } });
    c.inventory.slot1 = item;
    const gold = party.gold;
    const price = sellPrice(item, party);
    expect(sellItem(party, 0, "slot1")).toBe(true);
    expect(c.inventory.slot1).toBeNull();
    expect(party.gold).toBe(gold + price);
    party.gold = price - 1;
    expect(buyBackItem(party, { item, price })).toEqual({ ok: false, reason: "gold" });
    party.gold = gold + price;
    expect(buyBackItem(party, { item, price })).toEqual({ ok: true });
    expect(party.gold).toBe(gold); // exactly what the sale brought is paid again
    expect(carriedItems(party).some((i) => i.name === "Old Sword")).toBe(true);
  });
});

describe("average damage per hit in the item tooltips (point 18)", () => {
  const hero = () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    c.level = 6;
    for (const slot of EQUIPMENT_SLOTS) c.inventory[slot] = null; // the starter kit would add its own damage
    c.inventory.right_hand = makeItem({ name: "Sword", type: "sword", bonus: { dam_min: 4, dam_max: 8 } });
    return c;
  };

  it("equals the mean of many blows", () => {
    const c = hero();
    const rng = new Rng(seedFromString("average"));
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) sum += meleeDamage(c, null, rng);
    expect(averageHit(c, "melee", 4, 8)).toBeCloseTo(sum / n, 0);
  });

  it("equals the mean of many shots", () => {
    const c = hero();
    c.inventory.ranged_weapon = makeItem({ name: "Bow", type: "bow", bonus: { ranged_dam_min: 3, ranged_dam_max: 9 } });
    const rng = new Rng(seedFromString("average-ranged"));
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) sum += rangedDamage(c, null, 3, rng);
    expect(averageHit(c, "ranged", 3, 9)).toBeCloseTo(sum / n, 0);
  });

  it("writes the line for a weapon and a damage ring, from the hero's values, and for nothing else", () => {
    const c = hero();
    const spear = makeItem({ name: "Spear", type: "spear", bonus: { dam_min: 10, dam_max: 14 } });
    const lines = averageDamageLines(c, spear, c.inventory.right_hand ?? null, false);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.label).toBe("Average melee damage per hit");
    // the weapon replaces the sword: its 12 on average plus the level term of the hero
    expect(lines[0]!.value).toBeCloseTo(averageHit(c, "melee", 10, 14), 1);
    expect(averageDamageLines(c, c.inventory.right_hand!, null, true)[0]!.value).toBeCloseTo(averageHit(c, "melee", 4, 8), 1);
    const ring = makeItem({ name: "Ring", type: "ring", bonus: { dam_min: 2, dam_max: 4 } });
    expect(averageDamageLines(c, ring, null, false)[0]!.value).toBeCloseTo(averageHit(c, "melee", 6, 12), 1);
    const helmet = makeItem({ name: "Helmet", type: "helmet", bonus: { arm: 3 } });
    expect(averageDamageLines(c, helmet, null, false)).toEqual([]);
  });

  it("shows a ring for blows and for shots when the hero has a bow", () => {
    const c = hero();
    c.inventory.ranged_weapon = makeItem({ name: "Bow", type: "bow", bonus: { ranged_dam_min: 3, ranged_dam_max: 9 } });
    const ring = makeItem({ name: "Ring", type: "ring", bonus: { dam_min: 2, dam_max: 4 } });
    const lines = averageDamageLines(c, ring, null, false);
    expect(lines.map((l) => l.label)).toEqual(["Average melee damage per hit", "Average ranged damage per hit"]);
    expect(lines[1]!.value).toBeCloseTo(averageHit(c, "ranged", 5, 13), 1);
  });

  it("shows the change of a ring of Strength for blows and of a ring of Accuracy for shots (54th playtest, point 1)", () => {
    const c = hero();
    const strength = makeItem({ name: "Ring of Strength", type: "ring", bonus: { str: 20 } });
    const meleeLines = averageDamageLines(c, strength, null, false);
    expect(meleeLines.map((l) => l.label)).toEqual(["Average melee damage per hit"]);
    const weapon = c.inventory.right_hand!;
    const bare = averageHit(c, "melee", weapon.bonus.dam_min ?? 0, weapon.bonus.dam_max ?? 0);
    expect(meleeLines[0]!.value).toBeGreaterThan(bare);
    expect(meleeLines[0]!.value).toBeCloseTo(averageHit(c, "melee", weapon.bonus.dam_min ?? 0, weapon.bonus.dam_max ?? 0, { str: 20 }), 1);
    // without a bow, Accuracy changes nothing the hero can use
    const accuracy = makeItem({ name: "Ring of Accuracy", type: "ring", bonus: { acc: 20 } });
    expect(averageDamageLines(c, accuracy, null, false)).toEqual([]);
    c.inventory.ranged_weapon = makeItem({ name: "Bow", type: "bow", bonus: { ranged_dam_min: 3, ranged_dam_max: 9 } });
    const shots = averageDamageLines(c, accuracy, null, false);
    expect(shots.map((l) => l.label)).toEqual(["Average ranged damage per hit"]);
    expect(shots[0]!.value).toBeGreaterThan(averageHit(c, "ranged", 3, 9));
    // worn already: the hero's own values hold the ring, so the line equals the plain average of the hero
    c.inventory.left_ring = strength;
    expect(averageDamageLines(c, strength, null, true)[0]!.value).toBeCloseTo(averageHit(c, "melee", weapon.bonus.dam_min ?? 0, weapon.bonus.dam_max ?? 0), 1);
  });
});
