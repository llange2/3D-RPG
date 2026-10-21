import { describe, expect, it } from "vitest";
import { attributeRecipient, resistanceRecipient, resolveAction, type ActionContext } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { Rng, seedFromString } from "../../src/core/rng";
import { buildMapContent, isLastingTrap, isReloadingTrap, isSpent, isTrapAction } from "../../src/actions";
import { TRAP_ELEMENTS, TRAP_RELOAD_STEPS, trapElement } from "../../src/actions/registry";
import { generateInterior } from "../../src/interiors";
import { describeInteriorCell, interiorLegend } from "../../src/game/minimap";
import { Explored } from "../../src/game/state";
import { CELL } from "../../src/interiors/types";
import { doorLook, doorSound } from "../../src/render/interiorDoors";
import { cellCenterX, cellCenterZ } from "../../src/render/interiorMesher";
import { ITEM_MODELS } from "../../src/render/itemProps";
import { TRAP_OBJECT, elementOf, elementalProp, hasTrapModel, trapKindOf, trapModelKeys, trapRotationAt } from "../../src/render/interiorTraps";
import { createCharacter, equipTarget, replacedItems } from "../../src/sim/character";
import { bonusDescription, bonusLines, combineItems, makeItem, weaponHands } from "../../src/sim/items";
import { createDefaultParty } from "../../src/sim/party";
import type { Attribute, Item, Party } from "../../src/sim/types";
import type { Poi } from "../../src/world/types";
import { World } from "../../src/world/world";
import { themedInterior } from "../helpers/themes";

const rootSeed = seedFromString("playtest10");

/**
 * The Catacombs of Zanvaa of the tenth playtest (world "kelp-mere-931"), kept as a fixture: the places of a world move whenever the
 * generator changes how many it sets, the map of this dungeon only depends on its position and key.
 */
const CATACOMBS: Poi = { id: "p:0:0:44", kind: "dungeon", name: "Catacombs of Zanvaa", x: -5, y: 21, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier: 1, biome: 0 };

/** A party of the given classes, all with the same middling attributes so that only the class decides. */
function partyOf(...classes: ("Knight" | "Thief" | "Wizard" | "Cleric" | "Barbarian" | "Archer" | "Ninja" | "Druid")[]): Party {
  const party = createDefaultParty();
  party.characters = classes.map((classType, i) =>
    createCharacter({ name: `${classType}${i}`, classType, raceType: "Human", avatar: "character01", attrs: { str: 12, int: 12, per: 12, end: 12, spd: 12, acc: 12, lck: 12 } }),
  );
  return party;
}

describe("shrines pick the hero who profits (tenth playtest, point 4)", () => {
  it("gives a resistance to the hero who has the least of it, the gear counted", () => {
    const party = partyOf("Knight", "Wizard", "Cleric", "Thief");
    party.characters[0]!.resFire = 30;
    party.characters[1]!.resFire = 20;
    party.characters[2]!.resFire = 25;
    party.characters[3]!.resFire = 5;
    const rng = new Rng(seedFromString("res"));
    for (let i = 0; i < 20; i++) expect(resistanceRecipient(party, "fire", rng)).toBe(3);
    // a ring that adds 40 fire resistance moves the lowest value to the wizard
    party.characters[3]!.inventory.left_ring = { id: "r", name: "ring", type: "ring", material: 1, texture: "item_ring_1", value: 1, quest: false, spellId: 0, bonus: { res_fire: 40 } };
    for (let i = 0; i < 20; i++) expect(resistanceRecipient(party, "fire", rng)).toBe(1);
  });

  it("picks at random among heroes who are level", () => {
    const party = partyOf("Knight", "Wizard", "Cleric", "Thief");
    const rng = new Rng(seedFromString("tie"));
    const seen = new Set<number | null>();
    for (let i = 0; i < 200; i++) seen.add(resistanceRecipient(party, "ice", rng));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it("skips heroes who cannot act", () => {
    const party = partyOf("Knight", "Wizard");
    party.characters[0]!.resMagic = 0;
    party.characters[1]!.resMagic = 50;
    party.characters[0]!.conditions = ["Dead"];
    expect(resistanceRecipient(party, "magic", new Rng(seedFromString("one")))).toBe(1);
    party.characters[1]!.conditions = ["Dead"];
    expect(resistanceRecipient(party, "magic", new Rng(seedFromString("one")))).toBeNull();
  });

  it("gives an attribute to the class that lives off it", () => {
    const party = partyOf("Knight", "Wizard", "Cleric", "Thief");
    const rng = new Rng(seedFromString("attr"));
    const who: Record<string, Attribute> = { Knight: "str", Wizard: "int", Cleric: "per", Thief: "acc" };
    for (const [cls, attribute] of Object.entries(who)) {
      const index = party.characters.findIndex((c) => c.classType === cls);
      for (let i = 0; i < 20; i++) expect(attributeRecipient(party, attribute, rng), `${attribute} to the ${cls}`).toBe(index);
    }
  });

  it("chooses at random when several classes live off the attribute", () => {
    // accuracy is asked for by archers, thieves and ninjas
    const party = partyOf("Archer", "Thief", "Ninja", "Wizard");
    const rng = new Rng(seedFromString("several"));
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 600; i++) counts[attributeRecipient(party, "acc", rng)!]!++;
    expect(counts[3]).toBe(0);
    for (const n of counts.slice(0, 3)) expect(n).toBeGreaterThan(150);
  });

  it("gives luck to anybody, the thief twice as often (40 against 3 x 20 percent)", () => {
    const party = partyOf("Knight", "Wizard", "Thief", "Cleric");
    const rng = new Rng(seedFromString("luck"));
    const counts = [0, 0, 0, 0];
    const draws = 8000;
    for (let i = 0; i < draws; i++) counts[attributeRecipient(party, "lck", rng)!]!++;
    expect(counts[2]! / draws).toBeGreaterThan(0.37);
    expect(counts[2]! / draws).toBeLessThan(0.43);
    for (const i of [0, 1, 3]) {
      expect(counts[i]! / draws).toBeGreaterThan(0.17);
      expect(counts[i]! / draws).toBeLessThan(0.23);
    }
  });

  it("falls back to the hero with the most of it when no class lives off the attribute", () => {
    // nobody here asks for endurance
    const party = partyOf("Knight", "Wizard", "Cleric", "Thief");
    party.characters[1]!.end = 19;
    const rng = new Rng(seedFromString("fallback"));
    for (let i = 0; i < 20; i++) expect(attributeRecipient(party, "end", rng)).toBe(1);
  });

  it("applies the plus to the chosen hero when the shrine is used", () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const party = partyOf("Knight", "Wizard", "Cleric", "Thief");
      const before = party.characters.map((c) => ({ ...c }));
      const act: ActionInstance = { uid: "m#shrine:0", kind: "shrine", x: 1, y: 1, params: { effect: "resist", amount: 3 } };
      const out = resolveAction(act, { party, rootSeed, attempt, monsterThemes: { beast: 1 }, tier: 2 });
      const e = out.effects.find((x) => x.type === "resistance");
      expect(e).toBeTruthy();
      if (e?.type !== "resistance") continue;
      const field = ({ fire: "resFire", ice: "resIce", acid: "resAcid", magic: "resMagic" } as const)[e.element];
      // everybody had the same value before, so the recipient is the only one who changed
      expect(party.characters.filter((c, i) => c[field] !== before[i]![field])).toHaveLength(1);
      expect(party.characters[e.character]![field]).toBe(before[e.character]![field] + 3);
    }
  });
});

describe("comparing a backpack item with what it would replace (tenth playtest, point 5)", () => {
  const ring = (bonus: Item["bonus"], id = "r") => makeItem({ id, name: "ring", type: "ring", bonus });

  it("shows each value with its change, and a stat only the worn item has as 0 with the loss", () => {
    const worn = ring({ end: 5, lck: 3 });
    const found = ring({ str: 2, lck: 5 });
    expect(bonusLines(found, worn)).toEqual([
      { label: "Strength", value: 2, change: 2 },
      { label: "Endurance", value: 0, change: -5 },
      { label: "Luck", value: 5, change: 2 },
    ]);
  });

  it("shows plain values without a comparison", () => {
    expect(bonusLines(ring({ str: 2, lck: 5 }))).toEqual([
      { label: "Strength", value: 2, change: null },
      { label: "Luck", value: 5, change: null },
    ]);
    expect(bonusDescription(ring({ str: 2, lck: 5 }))).toBe("Strength: 2\nLuck: 5");
  });

  it("measures damage and armor like the other values", () => {
    const old = makeItem({ name: "sword", type: "long sword", bonus: { dam_min: 9, dam_max: 15 } });
    const better = makeItem({ name: "sword", type: "long sword", bonus: { dam_min: 11, dam_max: 14 } });
    expect(bonusLines(better, old)).toEqual([
      { label: "Min. Damage", value: 11, change: 2 },
      { label: "Max. Damage", value: 14, change: -1 },
    ]);
    // the same value is no change
    expect(bonusLines(old, old).every((l) => l.change === 0)).toBe(true);
  });

  it("replaces the item a double click would replace, and nothing while a fitting slot is free", () => {
    const hero = createCharacter({ name: "H", classType: "Knight", raceType: "Human", avatar: "character01", attrs: { str: 12, int: 12, per: 12, end: 12, spd: 12, acc: 12, lck: 12 } });
    const a = ring({ end: 5 }, "a");
    const b = ring({ lck: 5 }, "b");
    const found = ring({ str: 1 }, "f");
    hero.inventory.left_ring = a;
    expect(replacedItems(hero.inventory, found)).toEqual([]); // the right ring finger is free
    hero.inventory.right_ring = b;
    expect(replacedItems(hero.inventory, found)).toEqual([a]);
    expect(replacedItems(hero.inventory, makeItem({ name: "boots", type: "boots" }))).toEqual([]);
  });

  it("compares a two-handed weapon with the weapon and the shield it pushes off (eleventh playtest, point 1)", () => {
    const hero = createCharacter({ name: "H", classType: "Knight", raceType: "Human", avatar: "character01", attrs: { str: 12, int: 12, per: 12, end: 12, spd: 12, acc: 12, lck: 12 } });
    const sword = makeItem({ name: "sword", type: "long sword", bonus: { dam_min: 3, dam_max: 9 } });
    const shield = makeItem({ name: "shield", type: "shield", bonus: { arm: 4 } });
    hero.inventory.left_hand = sword;
    hero.inventory.right_hand = shield;
    const axe = makeItem({ name: "axe", type: "great axe", bonus: { dam_min: 20, dam_max: 40 } });
    expect(equipTarget(hero.inventory, axe)).toBe("left_hand");
    expect(replacedItems(hero.inventory, axe)).toEqual([sword, shield]);
    const both = combineItems(replacedItems(hero.inventory, axe))!;
    expect(both.name).toBe("sword and shield");
    // the armour of the shield is lost, the damage gained
    const lines = bonusLines(axe, both);
    expect(lines.find((l) => l.label === "Armor")).toEqual({ label: "Armor", value: 0, change: -4 });
    expect(lines.find((l) => l.label === "Min. Damage")).toEqual({ label: "Min. Damage", value: 20, change: 17 });
    // a one-hander next to the shield takes only the sword's place
    expect(replacedItems(hero.inventory, makeItem({ name: "mace", type: "mace" }))).toEqual([sword]);
    // only a shield worn: it is what comes off
    hero.inventory.left_hand = null;
    expect(replacedItems(hero.inventory, axe)).toEqual([shield]);
  });

  it("names the hands a weapon needs", () => {
    expect(weaponHands(makeItem({ name: "x", type: "long sword" }))).toBe("one");
    expect(weaponHands(makeItem({ name: "x", type: "great axe" }))).toBe("two");
    expect(weaponHands(makeItem({ name: "x", type: "long bow" }))).toBe("ranged");
    expect(weaponHands(makeItem({ name: "x", type: "shield" }))).toBeNull();
    expect(combineItems([])).toBeNull();
  });
});

describe("a door sounds like what is drawn (tenth playtest, point 3)", () => {
  it("squeaks for a wooden door and clanks for a gate", () => {
    expect(doorSound("door")).toBe(9052);
    expect(doorSound("gate")).toBe(9034);
  });

  it("makes the picked wooden door of the Catacombs of Zanvaa (67/30) a wooden door", () => {
    const world = new World("kelp-mere-931");
    const poi: Poi | undefined = CATACOMBS;
    expect(poi).toBeTruthy();
    const map = generateInterior(world, poi!);
    const content = buildMapContent(world, poi!, map);
    const door = content.actions.find((a) => a.kind === "door" && a.x === 67 && a.y === 30)!;
    expect(door.params.locked).toBe(true);
    expect(doorLook(map, door.x, door.y)).toBe("door");
  });
});

describe("traps of the generated dungeons (tenth playtest, point 2)", () => {
  const trap = (kind: string, uid = `m#trap:${kind}`): ActionInstance => ({ uid, kind: "trap", x: 1, y: 1, params: { trap: kind, damage: 4 } });

  /** The Catacombs of Zanvaa as the player met them: the pit at 58/35, the spring trap at 74/34, the generic one at 81/24. */
  function catacombs() {
    const world = new World("kelp-mere-931");
    const poi: Poi | undefined = CATACOMBS;
    const map = generateInterior(world, poi!);
    return { map, content: buildMapContent(world, poi!, map) };
  }

  it("lets every trap go off again, chests and doors stay used up", () => {
    const opened = new Set(["m#trap:pit", "m#trap:spring", "m#trap:guillotine", "m#trap:generic", "m#trap:steal_gold"]);
    for (const kind of ["pit", "spring", "guillotine", "generic", "steal_gold"]) expect(isSpent(trap(kind), opened), kind).toBe(false);
    expect(isLastingTrap(trap("pit"))).toBe(true);
    expect(isLastingTrap(trap("spring"))).toBe(false);
    // only the blade and the spears have to reload; the pit and the elemental trap strike at every step onto the cell
    expect(["pit", "spring", "guillotine", "generic", "steal_gold"].filter((k) => isReloadingTrap(trap(k)))).toEqual(["spring", "guillotine"]);
    expect(TRAP_RELOAD_STEPS).toBe(8);
    expect(isSpent({ uid: "c", kind: "treasure", params: {} }, new Set(["c"]))).toBe(true);
    expect(isSpent({ uid: "f", kind: "fountain", params: {} }, new Set(["f"]))).toBe(false);
  });

  it("gives every generic trap one of four elements, the same one every time, and all four turn up", () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      const uid = `p:0:0:${i}:0#trap_corridor:${i % 7}`;
      const element = trapElement(uid);
      expect(TRAP_ELEMENTS).toContain(element);
      expect(trapElement(uid)).toBe(element);
      seen.set(element, (seen.get(element) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual(["acid", "fire", "ice", "magic"]);
    for (const n of seen.values()) expect(n).toBeGreaterThan(60);
  });

  it("hurts with the element of the generic trap, cut down by resistance and the Fairy", () => {
    const uid = "m#trap:generic";
    const element = trapElement(uid);
    const field = ({ fire: "resFire", ice: "resIce", acid: "resAcid", magic: "resMagic" } as const)[element];
    const hurtOnce = (setup: (p: Party) => void) => {
      const party = createDefaultParty();
      // a lone hero without the Ninja's dodge, so that the number is exact
      party.characters = [party.characters[0]!];
      party.characters[0]!.resFire = party.characters[0]!.resIce = party.characters[0]!.resAcid = party.characters[0]!.resMagic = 0;
      setup(party);
      const out = resolveAction({ uid, kind: "trap", x: 1, y: 1, params: { trap: "generic", damage: 10 } }, { party, rootSeed, attempt: 0, monsterThemes: { beast: 1 }, tier: 1 });
      return { party, out, e: out.effects.find((x) => x.type === "damage") as Extract<(typeof out.effects)[number], { type: "damage" }> };
    };
    const plain = hurtOnce(() => undefined);
    expect(plain.e.damageType).toBe(element);
    expect(plain.e.amount).toBe(10);
    expect(plain.out.effects.some((x) => x.type === "text" && x.text === `${element[0]!.toUpperCase()}${element.slice(1)} trap!`)).toBe(true);
    expect(plain.party.characters[0]!.health - plain.party.characters[0]!.hp).toBe(10);
    // 50 percent resistance halves it, the Fairy takes 20 off the rest
    expect(hurtOnce((p) => (p.characters[0]![field] = 50)).e.amount).toBe(5);
    expect(hurtOnce((p) => ((p.characters[0]![field] = 0), (p.mascot = "Fairy"))).e.amount).toBe(0);
  });

  it("lets ninjas dodge one elemental trap in ten, and nobody else", () => {
    const strike = (classType: "Ninja" | "Knight", attempt: number) => {
      const party = createDefaultParty();
      party.characters = [createCharacter({ name: "T", classType, raceType: "Human", avatar: "character01", attrs: { str: 12, int: 12, per: 12, end: 12, spd: 12, acc: 12, lck: 12 } })];
      const out = resolveAction({ uid: "m#trap:generic", kind: "trap", x: 1, y: 1, params: { trap: "generic", damage: 3 } }, { party, rootSeed, attempt, monsterThemes: { beast: 1 }, tier: 1 });
      return (out.effects.find((x) => x.type === "damage") as { amount: number }).amount;
    };
    let dodged = 0;
    for (let i = 0; i < 400; i++) {
      if (strike("Ninja", i) === 0) dodged++;
      expect(strike("Knight", i)).toBe(3);
    }
    expect(dodged).toBeGreaterThan(15);
    expect(dodged).toBeLessThan(70);
  });

  it("hurts again every time the party steps into the open pit", () => {
    const party = createDefaultParty();
    const total = () => party.characters.reduce((s, c) => s + (c.health - c.hp), 0);
    const pit = trap("pit");
    const ctx = { party, rootSeed, attempt: 0, monsterThemes: { beast: 1 }, tier: 1 };
    const first = resolveAction(pit, ctx);
    expect(first.effects.some((e) => e.type === "damage")).toBe(true);
    expect(total()).toBe(4);
    const second = resolveAction(pit, { ...ctx, attempt: 1 });
    expect(second.effects.some((e) => e.type === "damage")).toBe(true);
    expect(total()).toBe(8);
  });

  it("lets a levitating party float over a pit, which then stays hidden", () => {
    const party = createDefaultParty();
    party.effects.push({ kind: "levitate", until: party.minutes + 240 });
    const out = resolveAction(trap("pit"), { party, rootSeed, attempt: 0, monsterThemes: { beast: 1 }, tier: 1 });
    expect(out.effects).toEqual([]);
    expect(out.consumed).toBe(false);
    expect(party.characters.every((c) => c.hp === c.health)).toBe(true);
  });

  // A place has one kind of trap, the one of its theme (docs/DUNGEON_THEMES.md): the pit of the Temple of Moo, the spears of the Cyclops
  // Cavern, the blade of the Cursed Cold Cavern and the fire trap of the Blistering Heights.
  it("finds the traps of the themed places and turns them across the corridor", () => {
    const seen = new Set<string>();
    for (const [theme, tier] of [["temple_of_moo", 1], ["cyclops_cavern", 2], ["cursed_cold_cavern", 2], ["blistering_heights_cavern", 3]] as const) {
      const { map, content } = themedInterior(theme, tier);
      const traps = content.actions.filter((x) => x.kind === "trap");
      expect(traps.length, theme).toBeGreaterThan(0);
      for (const a of traps) {
        seen.add(String(a.params.trap));
        expect(hasTrapModel(a), `${theme} ${String(a.params.trap)}`).toBe(true);
        expect(trapKindOf(a)).toBe(a.params.trap === "spring" ? "spear" : a.params.trap === "guillotine" ? "guillotine" : null);
        // the fire trap of the Blistering Heights is a fire trap with the old game's lava puddle, whatever its uid
        if (a.params.trap === "generic") expect(elementOf(a)).toBe("fire");
        const rotation = trapRotationAt(map, a.x, a.y);
        expect([0, 90]).toContain(rotation);
        const open = (dx: number, dy: number) => map.cells[(a.y + dy) * map.width + a.x + dx] === CELL.FLOOR;
        // a corridor that runs north to south has its blade at 0, east to west at 90 (all 40 traps of the old maps)
        if (open(0, -1) && open(0, 1) && !open(1, 0) && !open(-1, 0)) expect(rotation).toBe(0);
        if (open(1, 0) && open(-1, 0) && !open(0, -1) && !open(0, 1)) expect(rotation).toBe(90);
      }
      if (theme === "blistering_heights_cavern") expect(trapModelKeys(content)).toContain("ci_120");
    }
    expect([...seen].sort()).toEqual(["generic", "guillotine", "pit", "spring"]);
  });

  it("every spear, guillotine, pit and elemental trap that the generator sets has something to see", () => {
    const { content } = catacombs();
    for (const a of content.actions) if (a.kind === "trap" && ["spring", "guillotine", "pit", "generic"].includes(String(a.params.trap))) expect(hasTrapModel(a)).toBe(true);
    for (const theme of ["wildabar_cavern", "dragontooth_dungeon", "fountain_head_cavern", "swamp_town_cavern"]) {
      for (const a of themedInterior(theme, 2).content.actions) if (a.kind === "trap") expect(hasTrapModel(a), theme).toBe(true);
    }
    // the taker of a purse has nothing to see
    expect(hasTrapModel({ uid: "x", kind: "trap", x: 1, y: 1, params: { trap: "steal_gold", damage: 0 } })).toBe(false);
  });

  it("lays the old game's object on each elemental trap, the crystals of ice beside the path", () => {
    expect(TRAP_OBJECT).toEqual({ fire: 120, acid: 92, magic: 121, ice: 117 });
    for (const element of TRAP_ELEMENTS) expect(ITEM_MODELS[String(TRAP_OBJECT[element])]!.source, element).toBeTruthy();
    const at = (element: (typeof TRAP_ELEMENTS)[number], rotation: number) => elementalProp(element, 10, 20, rotation, {})!;
    for (const element of ["fire", "acid", "magic"] as const) {
      const p = at(element, 0);
      expect(p.model).toBe(`ci_${TRAP_OBJECT[element]}`);
      // in the middle of the cell, at the scale of the old item table
      expect([p.x, p.z]).toEqual([cellCenterX(10), cellCenterZ(20)]);
      expect(p.scaleXYZ).toEqual(ITEM_MODELS[String(TRAP_OBJECT[element])]!.scale3);
    }
    const north = at("ice", 0);
    const east = at("ice", 90);
    expect(north.model).toBe("ci_117");
    expect(north.scale).toBeLessThan(1);
    // a corridor that runs north to south has its walls east and west, so the crystals stand off to that side
    expect(Math.abs(north.x - cellCenterX(10))).toBeGreaterThan(0.9);
    expect(north.z).toBe(cellCenterZ(20));
    expect(Math.abs(east.z - cellCenterZ(20))).toBeGreaterThan(0.9);
    expect(east.x).toBe(cellCenterX(10));
    // every generated trap of a map has the same look every time
    expect(at("fire", 0)).toEqual(at("fire", 0));
  });
});

describe("the Crow shows the traps in sight on the map (tenth playtest, point 1)", () => {
  it("knows the traps of both worlds, and nothing else", () => {
    expect(isTrapAction({ kind: "trap" })).toBe(true);
    for (const id of [17, 23, 24, 30]) expect(isTrapAction({ kind: "legacy", legacy: { id } })).toBe(true);
    for (const id of [12, 14, 25, 50]) expect(isTrapAction({ kind: "legacy", legacy: { id } })).toBe(false);
    expect(isTrapAction({ kind: "treasure" })).toBe(false);
  });

  it("marks the traps it is given, names them and lists them in the legend only then", () => {
    // one place per trap: the pit of the Temple of Moo, the spears of the Cyclops Cavern, the fire trap of the Blistering Heights
    const named = (theme: string, tier: number): { label: string | null; unseen: string | null; other: string | null; legendOn: boolean; legendOff: boolean } => {
      const { map, content } = themedInterior(theme, tier);
      const traps = content.actions.filter((a) => a.kind === "trap");
      const [first, second] = traps as [ActionInstance, ActionInstance];
      const explored = new Explored();
      for (const a of [first, second]) explored.mark(`in:${map.key}`, a.y * map.width + a.x, map.width * map.height);
      const seenSet = new Set([`${first.x},${first.y}`]);
      return {
        label: describeInteriorCell(map, content, explored, new Set(), first.x, first.y, [], seenSet),
        // the same cell without the Crow tells nothing about a trap
        unseen: describeInteriorCell(map, content, explored, new Set(), first.x, first.y, []),
        // a trap that is not in the set stays unnamed
        other: describeInteriorCell(map, content, explored, new Set(), second.x, second.y, [], seenSet),
        legendOn: interiorLegend(map, content, true).some((e) => e.label.startsWith("Trap")),
        legendOff: interiorLegend(map, content).some((e) => e.label.startsWith("Trap")),
      };
    };
    expect(named("temple_of_moo", 1)).toMatchObject({ label: "Pit", unseen: "Floor", other: "Floor", legendOn: true, legendOff: false });
    expect(named("cyclops_cavern", 2)).toMatchObject({ label: "Spear trap", unseen: "Floor", other: "Floor" });
    // the generic trap of the Blistering Heights is a fire trap (what the game showed: "Fire trap!")
    expect(named("blistering_heights_cavern", 3).label).toBe("Fire trap");
  });
});
