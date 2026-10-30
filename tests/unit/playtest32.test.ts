import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { QUESTS } from "../../src/data/quest-table";
import { MONSTERS } from "../../src/data/tables";
import { generateInterior } from "../../src/interiors";
import { CELL } from "../../src/interiors/types";
import { EYES_AT } from "../../src/render/monsters";
import { COMPUTER_LAMP, GOLD_LAMP, ITEM_LAMPS, LOOT_LAMP, MONSTER_LAMPS, ORB_LAMP } from "../../src/render/lamps";
import { BIOME, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";

const world = new World("playtest-32", "default");

const monsterId = (name: string): number => Object.values(MONSTERS).find((m) => m.name === name)!.id;

/** 32nd playtest: the monster sheet's new XP and levels, glowing quest objects and loot, a steadier lamp pool, two banners behind the king. */
describe("32nd playtest", () => {
  describe("the monster sheet (point 1)", () => {
    it("has the new treasure levels of the Dragon Worm and the Black Knight", () => {
      expect(MONSTERS[monsterId("Dragon Worm")]!.treasure_level).toBe(4);
      expect(MONSTERS[monsterId("Black Knight")]!.treasure_level).toBe(5);
    });
  });

  describe("light (points 2, 3, 4 and 6 to 10, 14)", () => {
    const gold = (c: readonly [number, number, number]) => c[0] > 0.9 && c[1] > 0.6 && c[1] < 0.9 && c[2] < 0.5;

    it("lets the orb, the keys, the key cards, the heap of treasure and the loot glow gold", () => {
      for (const item of [109, 4, 17, 18, 19, 20, 21, 22, 23, 24, 25, 64, 65, 66, 122, 123, 124]) {
        const lamp = ITEM_LAMPS[item];
        expect(lamp, `item ${item}`).toBeDefined();
        expect(gold(lamp!.color), `item ${item}`).toBe(true);
      }
      expect(ORB_LAMP.color).toEqual(GOLD_LAMP.color);
      expect(gold(LOOT_LAMP.color)).toBe(true);
    });

    it("lets the computer terminal glow blue", () => {
      const [r, , b] = ITEM_LAMPS[68]!.color;
      expect(ITEM_LAMPS[68]).toBe(COMPUTER_LAMP);
      expect(b).toBeGreaterThan(r * 2);
    });

    it("gives the magicians their colours: blue, fire orange, blue-green, grey and green", () => {
      for (const name of ["Carnage Hand", "Guardian", "Jouster", "Sorcerer"]) {
        const [r, , b] = MONSTER_LAMPS[name]!.color;
        expect(b, name).toBeGreaterThan(r * 2);
      }
      const [or, og, ob] = MONSTER_LAMPS["Top Jouster"]!.color;
      expect(or).toBeGreaterThan(0.9);
      expect(og).toBeLessThan(or);
      expect(ob).toBeLessThan(og);
      const [sr, sg, sb] = MONSTER_LAMPS["Sprite"]!.color;
      expect(sg).toBeGreaterThan(sr);
      expect(sb).toBeGreaterThan(sr);
      const [wr, wg, wb] = MONSTER_LAMPS["Wicked Witch"]!.color;
      expect(wg).toBeGreaterThan(wr * 1.5);
      expect(wg).toBeGreaterThan(wb * 1.5);
      const [gr, gg, gb] = MONSTER_LAMPS["Wizard"]!.color;
      expect(Math.max(gr, gg, gb) - Math.min(gr, gg, gb)).toBeLessThan(0.1);
      for (const name of Object.keys(MONSTER_LAMPS)) expect(() => monsterId(name), name).not.toThrow();
    });

    it("hangs the Wizard at the height of the party's eyes like the other monsters without feet", () => {
      expect(EYES_AT[monsterId("Wizard")]).toBeGreaterThan(0.5);
    });
  });

  describe("castle (point 11)", () => {
    it("always has two banners beside the king, one on each side of him, hung on a wall", () => {
      for (let i = 0; i < 60; i++) {
        const poi: Poi = { id: `p:t:castle:${i}`, kind: "castle", name: `castle ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier: 2 + (i % 3), biome: BIOME.MEADOW };
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        const { king, throne } = map.castle!;
        const fx = Math.sign(king.x - throne.x);
        const fy = Math.sign(king.y - throne.y);
        const floor = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR;
        const near = content.actions.filter((a) => a.kind === "decor" && typeof a.params.bearing === "number" && Math.abs(a.x - king.x) + Math.abs(a.y - king.y) <= 4);
        // the side of the line from the throne through the king a banner hangs on
        const across = (a: { x: number; y: number }) => (a.x - king.x) * -fy + (a.y - king.y) * fx;
        expect(near.some((a) => across(a) >= 0), `castle ${i}, left`).toBe(true);
        expect(near.some((a) => across(a) <= 0), `castle ${i}, right`).toBe(true);
        expect(near.length, `castle ${i}`).toBeGreaterThanOrEqual(2);
        for (const a of near) {
          // it hangs on a wall of its cell and looks away from it
          const look = { 0: { dx: 0, dy: -1 }, 90: { dx: 1, dy: 0 }, 180: { dx: 0, dy: 1 }, 270: { dx: -1, dy: 0 } }[a.params.bearing as number]!;
          expect(floor(a.x - look.dx, a.y - look.dy), `castle ${i} ${a.uid}`).toBe(false);
        }
      }
    });
  });

  describe("quest names (point 13)", () => {
    it("has the names of the quest document", () => {
      expect(QUESTS.quest_1.name).toBe("The Moaning Statues");
      expect(QUESTS.quest_2.name).toBe("Direction of Faces");
      expect(QUESTS.quest_4.name).toBe("Calculations");
    });
  });
});
