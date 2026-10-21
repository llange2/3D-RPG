import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { CARD_COLORS, DUNGEON_THEMES, FORBIDDEN_PROPS, KEY_COLORS, THEMES_BY_ID, cardType, keyType } from "../../src/data/dungeon-themes";
import { MAP_ITEMS, MONSTERS, QUEST_ITEMS } from "../../src/data/tables";
import { generateInterior, interiorHash } from "../../src/interiors";
import { checkKeyChain, planRegion } from "../../src/interiors/dungeonPlan";
import { ITEM_MODELS } from "../../src/render/itemProps";
import { World } from "../../src/world/world";
import { themedInterior } from "../helpers/themes";

describe("dungeon theme catalog", () => {
  it("has unique ids and monsters that exist", () => {
    expect(new Set(DUNGEON_THEMES.map((t) => t.id)).size).toBe(DUNGEON_THEMES.length);
    for (const t of DUNGEON_THEMES) {
      for (const id of [...t.monsters, t.boss]) expect(MONSTERS[id], `${t.id} monster ${id}`).toBeDefined();
      const types = new Set([...t.monsters, t.boss]);
      expect(types.size, `${t.id}: two to four monster types, the boss counting as one`).toBeGreaterThanOrEqual(2);
      expect(types.size, t.id).toBeLessThanOrEqual(4);
    }
  });

  it("can always spawn its ordinary monsters without going above the tier it starts at", () => {
    for (const t of DUNGEON_THEMES) {
      const weakest = Math.min(...t.monsters.map((id) => MONSTERS[id]!.treasure_level));
      expect(weakest, `${t.id} starts at tier ${t.tier[0]}`).toBeLessThanOrEqual(t.tier[0]);
    }
  });

  it("keeps to the style matrix: nothing its inhabitants cannot use", () => {
    for (const t of DUNGEON_THEMES) {
      const forbidden = new Set(FORBIDDEN_PROPS[t.inhabitants]);
      for (const item of [...t.props, t.chest, ...(t.shrine === null ? [] : [t.shrine])]) expect(forbidden.has(item), `${t.id} (${t.inhabitants}) has item ${item}`).toBe(false);
    }
  });

  it("only uses props the game can draw", () => {
    for (const t of DUNGEON_THEMES) {
      for (const item of [...t.props, t.chest, ...(t.shrine === null ? [] : [t.shrine])]) {
        expect(MAP_ITEMS[item], `${t.id} item ${item}`).toBeDefined();
        expect(ITEM_MODELS[String(item)]?.source, `${t.id} item ${item} has a model`).toBeTruthy();
      }
    }
  });

  it("names the element of a generic trap", () => {
    for (const t of DUNGEON_THEMES) if (t.trap === "generic") expect(t.trapElement, t.id).toBeDefined();
  });

  it("follows the key classes of chapter 1.2", () => {
    const types = new Set(QUEST_ITEMS.map((q) => q.type));
    for (const t of DUNGEON_THEMES) {
      if (t.klass === "A") {
        expect(t.needsKey, t.id).toBeUndefined();
        expect(t.givesCard, t.id).toBeUndefined();
        expect(t.givesKeys.length).toBeLessThanOrEqual(2);
      } else if (t.klass === "B") {
        expect(t.needsKey, t.id).toBeDefined();
        expect(t.givesKeys, t.id).toEqual([]);
      } else {
        expect(t.needsKey).toBeUndefined();
        expect(t.givesKeys).toEqual([]);
        expect(t.givesCard).toBeUndefined();
      }
      // rule 7: the type a finder hands out exists, and it is the very one the door asks for
      for (const k of t.givesKeys) expect(types.has(keyType(k)), keyType(k)).toBe(true);
      if (t.needsKey) expect(types.has(keyType(t.needsKey)), keyType(t.needsKey)).toBe(true);
      if (t.givesCard) expect(types.has(cardType(t.givesCard)), cardType(t.givesCard)).toBe(true);
    }
  });

  it("opens every key colour with exactly one key dungeon and finds it in a free one (rules 4 and 6)", () => {
    for (const color of KEY_COLORS) {
      expect(DUNGEON_THEMES.filter((t) => t.needsKey === color).length, `${color} opens`).toBe(1);
      expect(DUNGEON_THEMES.filter((t) => t.givesKeys.includes(color)).length, `${color} found in`).toBeGreaterThanOrEqual(1);
    }
    for (const color of CARD_COLORS) expect(DUNGEON_THEMES.filter((t) => t.givesCard === color).length, `${color} card`).toBeLessThanOrEqual(1);
  });

  it("has one pyramid, and the free spider cavern holds the blue and the orange key", () => {
    expect(DUNGEON_THEMES.filter((t) => t.klass === "C").length).toBe(1);
    expect(THEMES_BY_ID.arachnoid_cavern!.givesKeys).toEqual(["blue", "orange"]);
  });
});

describe("region plans", () => {
  it("keep the key chain: every key and key card a place asks for is held by a place of the same region, and opens one place", { timeout: 120_000 }, () => {
    let keyed = 0;
    let pyramids = 0;
    for (const seed of ["alpha", "beta", "gamma", "delta", "plans-1", "plans-2", "plans-3", "plans-4"]) {
      const world = new World(seed, "large");
      for (const ry of [0]) {
        for (const rx of world.islands.map((i) => i.index)) {
          const plan = planRegion(world, rx, ry);
          const issues = checkKeyChain([...plan].map(([id, ref]) => ({ id, ref })));
          expect(issues, `${seed} region ${rx}/${ry}`).toEqual([]);
          for (const ref of plan.values()) {
            if (ref.klass === "B") keyed++;
            if (ref.klass === "C") pyramids++;
          }
        }
      }
    }
    // the chain is used: a world has key dungeons and pyramids
    expect(keyed).toBeGreaterThan(20);
    expect(pyramids).toBeGreaterThan(3);
  });

  it("are deterministic", () => {
    const a = planRegion(new World("plans"), 1, 0);
    const b = planRegion(new World("plans"), 1, 0);
    expect(JSON.stringify([...a])).toBe(JSON.stringify([...b]));
  });

  it("put a theme that fits the kind of place on every cave and dungeon", () => {
    const world = new World("fit", "large");
    for (const ry of [0]) {
      for (const rx of world.islands.map((i) => i.index)) {
        const plan = planRegion(world, rx, ry);
        for (const poi of world.region(rx, ry).pois) {
          if (poi.kind !== "cave" && poi.kind !== "dungeon") continue;
          expect(THEMES_BY_ID[plan.get(poi.id)!.id]!.kinds, poi.id).toContain(poi.kind);
        }
      }
    }
  });

  it("make the interiors of a world with the look and content of their theme", { timeout: 120_000 }, () => {
    const world = new World("alpha", "default");
    for (const ry of [0]) {
      for (const rx of world.islands.map((i) => i.index)) {
        for (const poi of world.region(rx, ry).pois) {
          if (poi.kind !== "cave" && poi.kind !== "dungeon") continue;
          const map = generateInterior(world, poi);
          expect(map.dungeon, poi.id).toBeDefined();
          expect(map.theme.id === "cyber", `${poi.id}: only a pyramid is cyber`).toBe(map.dungeon!.klass === "C");
          expect(validateContent(map, buildMapContent(world, poi, map)), poi.id).toEqual([]);
          expect(interiorHash(generateInterior(world, poi))).toBe(interiorHash(map));
        }
      }
    }
  });
});

describe("themed content", () => {
  for (const t of DUNGEON_THEMES) {
    it(`${t.id}: valid, playable content with its own monsters, trap, props and keys`, { timeout: 60_000 }, () => {
      for (let i = 0; i < 8; i++) {
        const tier = t.tier[0] + (i % (t.tier[1] - t.tier[0] + 1));
        const { map, content } = themedInterior(t.id, tier, i);
        expect(validateContent(map, content), `${t.id} #${i} tier ${tier}`).toEqual([]);
        expect(content.spawns.some((s) => s.boss), `${t.id} #${i} has a boss`).toBe(true);
        // the keys and the card are all there, once
        const found = content.actions.filter((a) => typeof a.params.quest === "string").map((a) => a.params.quest);
        expect(found.sort()).toEqual([...map.dungeon!.gives].sort());
        const traps = content.actions.filter((a) => a.kind === "trap");
        if (t.trap === "none") expect(traps.length, `${t.id} has no trap`).toBe(0);
        else expect(traps.length, `${t.id} #${i} has traps`).toBeGreaterThan(0);
        if (t.shrine === null) expect(content.actions.some((a) => a.kind === "shrine" && a.params.effect !== "xp"), `${t.id} has no shrine`).toBe(false);
        // the style: props of the theme stand in the place
        expect(content.actions.filter((a) => a.kind === "decor").length, `${t.id} #${i} has props`).toBeGreaterThan(3);
      }
    });
  }

  it("a pyramid pays out millions of experience in its chalices", () => {
    let chalices = 0;
    for (let i = 0; i < 5; i++) {
      const { content } = themedInterior("pyramid", 4, i);
      chalices += content.actions.filter((a) => a.kind === "shrine" && a.params.effect === "xp" && Number(a.params.amount) >= 1_000_000).length;
    }
    expect(chalices).toBeGreaterThanOrEqual(10);
  });
});
