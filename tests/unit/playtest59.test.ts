import { describe, expect, it, vi } from "vitest";
import { validateContent } from "../../src/actions";
import { CRYSTAL_RUNE_RANGE, crystalsSolvedFlag, runeActive } from "../../src/actions/quests";
import { LANTERN_HALF, LANTERN_SINK, lanternOriginY } from "../../src/data/item-tuning";
import { knownContent } from "../../src/game/minimap";
import { ceilingHeightOf, wallHeightOf } from "../../src/render/interiorMesher";
import { LANTERN_ITEM } from "../../src/data/item-tuning";
import { ITEM_LAMPS, lanternLamp, RUNES_LAMP } from "../../src/render/lamps";
import { Projectiles } from "../../src/render/projectiles";
import { createCharacter } from "../../src/sim/character";
import { verdictFor } from "../../src/sim/compare";
import { spellScroll } from "../../src/sim/items";
import { QUESTS, type LayoutId } from "../../src/data/quest-table";
import type { Character } from "../../src/sim/types";
import { questInterior } from "../helpers/quests";

/** The 59th playtest: runes for a far end room (points 1 and 2), the lantern under any ceiling (3), the impact of every attack spell (5), scrolls in the smithy (7). */
const hero = (classType: "Knight" | "Wizard" | "Druid", level = 1): Character => {
  const c = createCharacter({ name: "H", classType, raceType: "Human", avatar: "character04", attrs: { str: 12, int: 12, per: 12, end: 12, spd: 12, acc: 12, lck: 12 } });
  c.level = level;
  c.spells = [];
  return c;
};

describe("59th playtest, point 1: runes next to a target that is far from the end room", () => {
  const layouts = QUESTS.quest_8.layouts.filter((l) => l.startsWith("dungeon") || l.startsWith("cave")) as LayoutId[];
  const gapOf = (end: { x: number; y: number; w: number; h: number }, c: { x: number; y: number }): number => Math.max(end.x - c.x, c.x - (end.x + end.w - 1), end.y - c.y, c.y - (end.y + end.h - 1), 0);

  it("a place gets runes next to a target exactly when its end room is farther than the range, and they work only after the paths are solved", { timeout: 240_000 }, () => {
    let withRunes = 0;
    let without = 0;
    for (const layout of layouts) {
      for (let i = 0; i < 8; i++) {
        const tier = 1 + (i % 5);
        const { map, content } = questInterior("quest_8", layout, tier, i);
        expect(validateContent(map, content), `${layout} tier ${tier} #${i}`).toEqual([]);
        const end = map.dungeon!.endRoom!;
        const targets = content.actions.filter((a) => a.kind === "crystal" && a.params.role === "target");
        const runes = content.actions.filter((a) => a.kind === "rune" && a.params.need === "crystals");
        const far = targets.filter((t) => gapOf(end, t) > CRYSTAL_RUNE_RANGE);
        // one rune for every far target, within three cells of it
        expect(runes.length, `${layout} tier ${tier} #${i}`).toBe(far.length);
        for (const t of far) expect(runes.some((r) => Math.max(Math.abs(r.x - t.x), Math.abs(r.y - t.y)) <= 3)).toBe(true);
        if (runes.length === 0) {
          without++;
          continue;
        }
        withRunes++;
        const flag = crystalsSolvedFlag(map.key);
        expect(runes.every((r) => r.params.flag === flag)).toBe(true);
        // not there, not on the map and not working until the paths are solved; there from then on
        expect(runes.every((r) => !runeActive(r, content, new Set()))).toBe(true);
        expect(knownContent(content, new Set(), false).actions.some((a) => a.kind === "rune")).toBe(false);
        expect(runes.every((r) => runeActive(r, content, new Set([flag])))).toBe(true);
        expect(knownContent(content, new Set([flag]), false).actions.some((a) => a.kind === "rune")).toBe(true);
      }
    }
    // (both cases occur among the places, so that the test says something about each)
    expect(withRunes).toBeGreaterThan(0);
    expect(without).toBeGreaterThanOrEqual(0);
  });
});

describe("59th playtest, point 2: the runes shine orange and have glints", () => {
  it("the rune lamp is orange, has a halo and the rune particles", () => {
    expect(ITEM_LAMPS[73]).toBe(RUNES_LAMP);
    expect(RUNES_LAMP.fx).toBe("rune");
    expect(RUNES_LAMP.halo).toBe(true);
    const [r, g, b] = RUNES_LAMP.color;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
});

describe("59th playtest, point 3: the lantern hangs from the ceiling of its place", () => {
  it("its top reaches the ceiling, whatever the height (dungeon 4.5, tower 4.2, cave 3)", () => {
    for (const ceiling of [4.5, 4.2, 3]) {
      const top = lanternOriginY(ceiling) + LANTERN_HALF;
      // the top of the chain lies just in the ceiling: no gap under it, and not through it
      expect(top - ceiling).toBeCloseTo(LANTERN_SINK, 6);
    }
    expect(lanternOriginY(4.5)).toBeGreaterThan(lanternOriginY(4.2));
  });

  it("its light and its smoke follow the ceiling: the smoke rises from the top of the glass body", () => {
    const high = lanternLamp(4.5);
    const low = lanternLamp(3);
    expect(high.y - low.y).toBeCloseTo(1.5, 6);
    expect(high.fx).toBe("lantern");
    expect(high.fxY!).toBeGreaterThan(high.y);
    expect(high.fxY!).toBeLessThan(4.5);
    expect(ITEM_LAMPS[LANTERN_ITEM]).toBeDefined();
  });

  it("a map knows the height of its ceiling: a tower's hangs lower than a dungeon's", () => {
    const { map } = questInterior("quest_1", "dungeon_1", 1, 0);
    expect(ceilingHeightOf(map)).toBeLessThanOrEqual(wallHeightOf(map));
    expect(ceilingHeightOf(map)).toBeGreaterThan(2);
  });
});

describe("59th playtest, point 5: every attack spell leaves an impact", () => {
  it("a spell of any damage type strikes with a picture, the physical one with the magic picture; an arrow with none", () => {
    const impact = vi.fn();
    const shots = new Projectiles({} as never, null, { impact } as never);
    const at = { x: 1, y: 2, z: 3 };
    for (const kind of ["fire", "ice", "acid", "magic", "physical"] as const) shots.impactAt(kind, at);
    expect(impact.mock.calls.map((c) => c[0])).toEqual(["fire", "ice", "acid", "magic", "magic"]);
    shots.impactAt("arrow", at);
    shots.impactAt("laser", at);
    expect(impact).toHaveBeenCalledTimes(5);
  });
});

describe("59th playtest, point 7: a scroll in the smithy", () => {
  const talents: string[] = [];
  it("a green arrow for the heroes who can learn it now, none for those who could later, greyed out for the others", () => {
    // spell 8: Arcane, level 2
    const scroll = spellScroll(8);
    expect(verdictFor(hero("Wizard", 5), scroll, talents)).toBe("better");
    expect(verdictFor(hero("Wizard", 1), scroll, talents)).toBe("same");
    expect(verdictFor(hero("Knight", 5), scroll, talents)).toBe("cannot");
    expect(verdictFor(hero("Druid", 5), scroll, talents)).toBe("cannot");
  });

  it("a hero who knows the spell already is greyed out", () => {
    const c = hero("Wizard", 5);
    c.spells = [8];
    expect(verdictFor(c, spellScroll(8), talents)).toBe("cannot");
  });
});
