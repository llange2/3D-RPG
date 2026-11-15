/** bug_fix_62 (15. 11. 2026): the Evil Paladin and Evil Wizard, attributes of at least 1, ring comparison, ticks on the pyramids, the exits of the spaceship, diagonal shots. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { USER_MONSTER_MODELS } from "../../src/data/monster-models";
import { MONSTERS } from "../../src/data/tables";
import { equipmentModel } from "../../src/data/equipment";
import { attr, equipSlots, offHandRingSlot, replacedItems } from "../../src/sim/character";
import { averageDamageLines } from "../../src/sim/combat";
import { lineOfSight, type GridView } from "../../src/sim/encounter";
import { makeItem } from "../../src/sim/items";
import { createDefaultParty } from "../../src/sim/party";
import { EQUIPMENT_SLOTS } from "../../src/sim/types";
import { BRIDGE, CONSOLE_SEEN_FLAG, CONTROL_ROOM, ENGINES_FLAG, ENGINE_CRYSTAL_FLAG, ENGINE_ROOM, LIFE_FLAG, LIFE_SUPPORT, STORAGE_BAY } from "../../src/data/quest-table";
import { shipSectionDone } from "../../src/game/questLog";
import { drawInteriorMap } from "../../src/game/minimap";

const PALADIN = 54;
const WIZARD = 79;

describe("the Evil Paladin and the Evil Wizard (points 1 and 2)", () => {
  it("the Paladin holds Draconi's sword and the Castle Guard's shield", () => {
    const paladin = MONSTERS[PALADIN]!;
    expect(equipmentModel(paladin.anim_weapon)).toBe(equipmentModel(MONSTERS[20]!.anim_weapon));
    expect(equipmentModel(paladin.anim_shield)).toBe(equipmentModel(MONSTERS[8]!.anim_shield));
    expect(equipmentModel(paladin.anim_weapon)).toBe("wpn_sword3");
    expect(equipmentModel(paladin.anim_shield)).toBe("wpn_shield2");
  });

  it("both models are the user's files, built into both registries as animated models", () => {
    expect(Object.keys(USER_MONSTER_MODELS).map(Number).sort((a, b) => a - b)).toEqual([PALADIN, WIZARD]);
    for (const file of ["models.monsters.json", "models.monsters.original.json"]) {
      const registry = JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "assets", file), "utf-8")) as Record<string, { animated: boolean; file: string; animations: string[]; scale: number }>;
      for (const id of [PALADIN, WIZARD]) {
        const info = registry[String(id)]!;
        expect(info.animated).toBe(true);
        expect(existsSync(join(__dirname, "..", "..", "public", "assets", info.file))).toBe(true);
        expect(info.scale).toBe(USER_MONSTER_MODELS[id]!.scale);
      }
      expect(registry[String(PALADIN)]!.animations).toContain("Left_Slash");
      expect(registry[String(WIZARD)]!.animations).toContain("mage_soell_cast_2");
    }
  });
});

describe("no attribute is below 1 (point 3)", () => {
  it("holds against rings, conditions and the sum of both", () => {
    const c = createDefaultParty().characters[0]!;
    for (const slot of EQUIPMENT_SLOTS) c.inventory[slot] = null;
    c.int = 3;
    c.inventory.left_ring = makeItem({ name: "Cursed ring", type: "ring", bonus: { int: -10, str: -999 } });
    expect(attr(c, "int")).toBe(1);
    expect(attr(c, "str")).toBe(1);
    expect(attr(c, "int", false)).toBe(1);
    c.conditions = ["Weak"];
    expect(attr(c, "str", false)).toBe(1);
  });
});

describe("a ring is compared with what it replaces, whichever of the two has the attribute (point 5)", () => {
  const hero = () => {
    const c = createDefaultParty().characters[0]!;
    for (const slot of EQUIPMENT_SLOTS) c.inventory[slot] = null;
    c.level = 20;
    c.inventory.left_hand = makeItem({ name: "Katana", type: "katana", bonus: { dam_min: 20, dam_max: 30 } });
    c.inventory.ranged_weapon = makeItem({ name: "Crossbow", type: "crossbow", bonus: { ranged_dam_min: 10, ranged_dam_max: 20 } });
    return c;
  };
  const strength = makeItem({ name: "Cooling Ring", type: "ring", bonus: { str: 50 } });
  const accuracy = makeItem({ name: "Healthy Ring", type: "ring", bonus: { acc: 15 } });

  it("shows the blow and the shot when a ring of Accuracy replaces a ring of Strength, and the other way round", () => {
    const c = hero();
    const asLabels = (item: typeof strength, replaced: typeof strength) => averageDamageLines(c, item, replaced, false).map((l) => l.label);
    expect(asLabels(accuracy, strength)).toEqual(["Average melee damage per hit", "Average ranged damage per hit"]);
    expect(asLabels(strength, accuracy)).toEqual(["Average melee damage per hit", "Average ranged damage per hit"]);
    // the line of the blow loses what the Strength gave (the ring that is worn is in the hero's values)
    c.inventory.left_ring = strength;
    const lines = averageDamageLines(c, accuracy, strength, false);
    expect(lines.find((l) => l.label.includes("melee"))!.change).toBeLessThan(0);
    expect(lines.find((l) => l.label.includes("ranged"))!.change).toBeGreaterThan(0);
  });

  it("an item without an effect on damage on either side shows nothing", () => {
    const c = hero();
    const plain = makeItem({ name: "Ring of Luck", type: "ring", bonus: { lck: 5 } });
    expect(averageDamageLines(c, plain, makeItem({ name: "Ring of Stealth", type: "ring", bonus: { per: 3 } }), false)).toEqual([]);
  });

  it("Ctrl compares with the off-hand ring: the right one, only when both ring slots are taken", () => {
    const c = hero();
    const spare = makeItem({ name: "Spare", type: "ring", bonus: { lck: 1 } });
    c.inventory.slot1 = spare;
    // a free ring slot takes the ring without replacing anything: no off-hand
    expect(offHandRingSlot(c.inventory, spare)).toBeNull();
    c.inventory.left_ring = strength;
    expect(offHandRingSlot(c.inventory, spare)).toBeNull();
    c.inventory.right_ring = accuracy;
    expect(offHandRingSlot(c.inventory, spare)).toBe("right_ring");
    expect(replacedItems(c.inventory, spare)).toEqual([strength]);
    expect(replacedItems(c.inventory, spare, true)).toEqual([accuracy]);
    expect(offHandRingSlot(c.inventory, makeItem({ name: "Helmet", type: "helmet", bonus: { arm: 1 } }))).toBeNull();
    expect(equipSlots(c.inventory, "slot1", "right_ring")).toBe("ok");
  });
});

describe("a pyramid is ticked off when its section is done (point 4)", () => {
  const crates = ["spaceship:0#crate:2", "spaceship:0#crate:7"];
  it("asks for the right thing in every section", () => {
    expect(shipSectionDone(BRIDGE, new Set(), crates)).toBe(false);
    expect(shipSectionDone(BRIDGE, new Set([CONSOLE_SEEN_FLAG]), crates)).toBe(true);
    expect(shipSectionDone(CONTROL_ROOM, new Set([LIFE_FLAG]), crates)).toBe(false);
    expect(shipSectionDone(CONTROL_ROOM, new Set([ENGINES_FLAG]), crates)).toBe(true);
    expect(shipSectionDone(LIFE_SUPPORT, new Set([LIFE_FLAG]), crates)).toBe(true);
    expect(shipSectionDone(ENGINE_ROOM, new Set([LIFE_FLAG]), crates)).toBe(false);
    expect(shipSectionDone(ENGINE_ROOM, new Set([ENGINE_CRYSTAL_FLAG]), crates)).toBe(true);
  });

  it("the storage bay needs both crates with a crystal", () => {
    expect(shipSectionDone(STORAGE_BAY, new Set([crates[0]!]), crates)).toBe(false);
    expect(shipSectionDone(STORAGE_BAY, new Set(crates), crates)).toBe(true);
    expect(shipSectionDone(STORAGE_BAY, new Set(crates), [])).toBe(false);
  });
});

describe("every transporter tube of the spaceship is drawn as a way out (point 6)", () => {
  it("the map draws an exit symbol for a tube that is not the party's own", () => {
    const drawn: { symbol: string; left: number; top: number }[] = [];
    const icons = {
      gridMin: 0,
      drawSymbol: (_ctx: unknown, symbol: string, left: number, top: number) => drawn.push({ symbol, left, top }),
      drawGround: () => undefined,
    };
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    const canvas = { width: 110, height: 110, getContext: () => ctx } as unknown as HTMLCanvasElement;
    const width = 12;
    const cells = new Uint8Array(width * 3).fill(1);
    const map = { key: "t", width, height: 3, cells, exit: { x: 1, y: 1 } } as never;
    const content = { actions: [{ uid: "t#tube:0", kind: "tube", x: 1, y: 1, params: {} }, { uid: "t#tube:1", kind: "tube", x: 4, y: 1, params: {} }], spawns: [] } as never;
    const explored = { has: () => true } as never;
    drawInteriorMap(canvas, map, content, explored, new Set(), 2, 1, "N" as never, [], 11, new Set(), undefined, icons as never);
    // the tube at 4/1 lies in the window and is drawn as "exit"; so is the own exit
    expect(drawn.filter((d) => d.symbol === "exit").length).toBeGreaterThanOrEqual(2);
  });
});

describe("a diagonal shot does not fly round the corner of a wall (point 7)", () => {
  const grid = (rows: string[], round = false): GridView => {
    const at = (x: number, y: number) => rows[y]?.[x] ?? "#";
    return { walkable: (x, y) => at(x, y) === ".", water: () => false, opaque: (x, y) => at(x, y) === "#", roundCorners: round };
  };
  // the party stands on 1/2, the wall in front of it on 1/1, the monster beside the wall on 0/1 or 2/1
  const rows = ["...", ".#.", "..."];
  it("is stopped when one of the two tiles beside the diagonal is a wall", () => {
    // shooter 0/1 to party 1/2 passes between the wall on 1/1 and the open tile 0/2; and mirrored: 2/1 to 1/2
    expect(lineOfSight(grid(rows), null, 0, 1, 1, 2)).toBe(false);
    expect(lineOfSight(grid(rows), null, 2, 1, 1, 2)).toBe(false);
    expect(lineOfSight(grid(rows), null, 1, 2, 0, 1)).toBe(false);
    // a wall that is not beside the diagonal does not matter
    expect(lineOfSight(grid(["...", "...", "..#"]), null, 0, 1, 1, 2)).toBe(true);
    // the same on a longer diagonal: a wall beside any of its corners stops it
    expect(lineOfSight(grid([".#..", "....", "....", "...."]), null, 0, 0, 3, 3)).toBe(false);
    expect(lineOfSight(grid(["....", ".#..", "....", "...."]), null, 0, 3, 3, 0)).toBe(false);
    expect(lineOfSight(grid(["....", "....", "....", "...."]), null, 0, 3, 3, 0)).toBe(true);
  });

  it("passes on round corners (the spaceship), where only one of the two is a wall", () => {
    expect(lineOfSight(grid(rows, true), null, 0, 1, 1, 2)).toBe(true);
    // both of them walls: closed even there
    expect(lineOfSight(grid(["...", ".#.", "#.."], true), null, 0, 1, 1, 2)).toBe(false);
    expect(lineOfSight(grid(["#.", ".#", ".."], true), null, 1, 0, 0, 1)).toBe(false);
  });

  it("an open diagonal and a straight shot are untouched", () => {
    expect(lineOfSight(grid(["...", "...", "..."]), null, 0, 0, 2, 2)).toBe(true);
    expect(lineOfSight(grid(["...", ".#.", "..."]), null, 0, 0, 2, 0)).toBe(true);
  });
});
