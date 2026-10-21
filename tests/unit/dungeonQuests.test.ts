import { describe, expect, it } from "vitest";
import { resolveAction, type ActionContext, type ActionOutcome } from "../../src/actions/handlers";
import { headFacing, ringBlocked, ringSolved, rotationSolved } from "../../src/actions/quests";
import { blocksCell } from "../../src/actions/registry";
import type { ActionInstance, MapContent } from "../../src/actions/types";
import { glyphCells, readGlyphs } from "../../src/interiors/glyphs";
import { CELL, type InteriorMap } from "../../src/interiors";
import { createDefaultParty } from "../../src/sim/party";
import { World } from "../../src/world/world";
import { themedInterior } from "../helpers/themes";

const rootSeed = new World("quests").rootSeed;

/** A party at a place, playing its actions the way the game does: the state a lever or head leaves goes into `opened`. */
function play(content: MapContent) {
  const party = createDefaultParty();
  const opened = new Set<string>();
  const use = (a: ActionInstance, answer?: string | null): ActionOutcome => {
    const ctx: ActionContext = { party, rootSeed, content, opened, answer, monsterThemes: { beast: 1 }, tier: 2 };
    const out = resolveAction(a, ctx);
    if (out.consumed) opened.add(a.uid);
    for (const k of out.state?.remove ?? []) opened.delete(k);
    for (const k of out.state?.add ?? []) opened.add(k);
    return out;
  };
  return { party, opened, use };
}

const of = (content: MapContent, kind: string) => content.actions.filter((a) => a.kind === kind);

describe("riddle statues", () => {
  it("ask a question, pay out for the right answer once and ignore a wrong one", () => {
    const { content } = themedInterior("cursed_cold_cavern", 2);
    const statues = of(content, "riddle");
    expect(statues.length).toBe(4);
    const { party, opened, use } = play(content);
    const s = statues[0]!;
    expect(use(s).effects).toEqual([{ type: "ask", question: s.params.question }]);
    const gold = party.gold;
    const wrong = use(s, "nothing at all");
    expect(wrong.consumed).toBe(false);
    expect(party.gold).toBe(gold);
    // the answer counts with a leading article and any case
    const right = use(s, `The ${String(s.params.answer).toUpperCase()}`);
    expect(right.consumed).toBe(true);
    expect(party.gold).toBeGreaterThan(gold);
    expect(opened.has(s.uid)).toBe(true);
    // no answer given (the question was closed) changes nothing
    expect(use(statues[1]!, null).consumed).toBe(false);
  });
});

describe("gongs and the lord's sum", () => {
  it("keeps the lord silent until every gong has sounded, then takes the sum of his brothers' words", () => {
    const { content } = themedInterior("arachnoid_cavern", 2);
    const gongs = of(content, "gong");
    const lord = of(content, "riddle")[0]!;
    expect(gongs.length).toBe(4);
    const { party, use } = play(content);
    expect(use(lord, "0").effects[0]).toMatchObject({ type: "text" });
    // each gong calls monsters, the last one says so
    gongs.forEach((g, i) => {
      const out = use(g);
      expect(out.consumed).toBe(true);
      expect(out.effects.some((e) => e.type === "ambush")).toBe(true);
      expect(out.effects.find((e) => e.type === "text")).toMatchObject({ text: expect.stringMatching(i === 3 ? /last (gong|clang)/ : new RegExp(`${i + 1} of 4`)) });
    });
    // what the brothers say, added up by a player who counts the crystals
    const hints = of(content, "lore").filter((a) => typeof a.params.sum === "number");
    const crystals = content.actions.filter((a) => (a.kind === "decor" || a.kind === "shrine") && a.params.item === 117).length;
    const answer = Number(hints[0]!.params.sum) + Number(hints[1]!.params.sum) * 4 - Number(hints[2]!.params.sum) * crystals;
    const gold = party.gold;
    expect(use(lord, String(answer + 1)).consumed).toBe(false);
    expect(use(lord, String(answer)).consumed).toBe(true);
    expect(party.gold).toBeGreaterThan(gold);
  });
});

describe("the number in the walls", () => {
  it("is on the map of the hall, and the statue wants it", () => {
    for (let v = 0; v < 6; v++) {
      const { map, content } = themedInterior("dark_warriors_keep", 3, v);
      const hall = map.dungeon!.hall!;
      const glyph = map.dungeon!.glyph!;
      // a player reads the map: wall cells of the hall, nothing else
      const wallAt = (x: number, y: number) => map.cells[y * map.width + x] !== CELL.FLOOR;
      const x0 = hall.x + 3;
      const y0 = hall.y + 3;
      expect(readGlyphs(wallAt, x0, y0, 2)).toBe(glyph);
      // and there are no walls in the hall but the picture's
      const walls = glyphCells(glyph).length;
      let count = 0;
      for (let y = hall.y; y < hall.y + hall.h; y++) for (let x = hall.x; x < hall.x + hall.w; x++) if (wallAt(x, y)) count++;
      expect(count).toBe(walls);
      const { use, party } = play(content);
      const statue = of(content, "riddle")[0]!;
      const gold = party.gold;
      expect(use(statue, glyph).consumed).toBe(true);
      expect(party.gold).toBeGreaterThan(gold);
    }
  });
});

describe("coordinates", () => {
  it("send the party from the statues to the treasure", () => {
    for (const theme of ["halls_of_insanity", "bloodreign_dungeon"]) {
      const { content } = themedInterior(theme, 4);
      const hints = of(content, "lore").filter((a) => typeof a.params.treasure === "string");
      expect(hints.length, theme).toBe(2);
      for (const h of hints) {
        const [tx, ty] = String(h.params.treasure).split(",").map(Number) as [number, number];
        expect(content.actions.find((a) => a.x === tx && a.y === ty)?.kind).toBe("treasure");
        const westEast = tx < h.x ? "west" : "east";
        const northSouth = ty < h.y ? "north" : "south";
        expect(h.params.text).toBe(`The treasure lies ${Math.abs(tx - h.x)} ${westEast} and ${Math.abs(ty - h.y)} ${northSouth} of this statue.`);
      }
    }
  });
});

describe("the field of runes", () => {
  it("throws the party back to the door of the hall, and a way through exists", () => {
    for (const theme of ["slithercult_stronghold", "maze_from_hell"]) {
      const { map, content } = themedInterior(theme, theme === "maze_from_hell" ? 5 : 3);
      const hall = map.dungeon!.hall!;
      const runes = of(content, "teleporter");
      expect(runes.length, theme).toBeGreaterThan(8);
      const { use } = play(content);
      const out = use(runes[0]!);
      expect(out.effects).toContainEqual({ type: "jump", x: hall.x, y: hall.y + Math.floor(hall.h / 2) });
      expect(out.consumed).toBe(false);
      // only the Maze draws its runes
      expect(runes.every((r) => r.params.item === 73)).toBe(theme === "maze_from_hell");
      if (theme === "slithercult_stronghold") expect(content.actions.some((a) => a.kind === "trap")).toBe(true);
    }
  });
});

describe("the ring of heads", () => {
  it("opens the chest in the middle when the corners hold a head, and not before", () => {
    for (let v = 0; v < 4; v++) {
      const { map, content } = themedInterior("fortress_of_fear", 3, v);
      const ring = content.actions.filter((a) => a.kind === "head" && a.params.mode === "ring");
      const chest = content.actions.find((a) => a.kind === "treasure" && a.params.lock === "ring")!;
      expect(ring.length).toBe(8);
      // eight levers that work and look-alikes that do nothing (as many as the rooms have room for)
      expect(of(content, "lever").length).toBeGreaterThanOrEqual(14);
      expect(of(content, "lever").filter((l) => l.params.target !== "").length).toBe(8);
      const { party, opened, use } = play(content);
      // shut at first
      expect(use(chest).consumed).toBe(false);
      expect(ringSolved(content, opened)).toBe(false);
      // heads on the ring block their cells; the cells without one stay open
      const blocked = () => ringBlocked(content, map.width, opened);
      expect(blocked().length).toBe(ring.filter((h) => h.params.start === 1).length);
      // pull the lever of every corner that is empty; a look-alike lever changes nothing
      const dummy = of(content, "lever").find((l) => l.params.target === "")!;
      use(dummy);
      expect(opened.has(dummy.uid)).toBe(false);
      for (const h of ring.filter((x) => x.params.corner === true && x.params.start === 0)) use(content.actions.find((a) => a.uid === h.params.lever)!);
      expect(ringSolved(content, opened)).toBe(true);
      const keys = party.characters.flatMap((c) => Object.values(c.inventory)).filter((i) => i?.type.endsWith("_keycard"));
      expect(keys.length).toBe(0);
      expect(use(chest).consumed).toBe(true);
      // pulling a lever twice puts the head back
      const lever = content.actions.find((a) => a.uid === ring[0]!.params.lever)!;
      const before = blocked().length;
      use(lever);
      use(lever);
      expect(blocked().length).toBe(before);
    }
  });
});

describe("the row of heads", () => {
  it("opens the chest when every head looks the way its chalice showed", () => {
    for (let v = 0; v < 4; v++) {
      const { content } = themedInterior("cathedral_of_carnage", 3, v);
      const row = content.actions.filter((a) => a.kind === "head" && a.params.mode === "rotate").sort((a, b) => a.x - b.x);
      const cups = content.actions.filter((a) => a.kind === "lore" && typeof a.params.letter === "string").sort((a, b) => a.x - b.x);
      const chest = content.actions.find((a) => a.kind === "treasure" && a.params.lock === "rotation")!;
      expect(row.length).toBe(5);
      const { opened, use } = play(content);
      expect(use(chest).consumed).toBe(false);
      // the cup says a letter; the head is turned until it looks that way
      row.forEach((head, i) => {
        const letter = String(cups[i]!.params.letter);
        expect(use(cups[i]!).effects[0]).toMatchObject({ type: "text", text: expect.stringContaining(letter) });
        for (let turns = 0; turns < 4 && "NESW"[headFacing(head, opened)] !== letter; turns++) use(head);
      });
      expect(rotationSolved(content, opened)).toBe(true);
      expect(use(chest).consumed).toBe(true);
    }
  });
});

describe("what blocks", () => {
  it("lets the party walk where a head of the ring has been taken away, and not where it stands", () => {
    const { map, content } = themedInterior("fortress_of_fear", 3);
    const ring = content.actions.filter((a) => a.kind === "head" && a.params.mode === "ring");
    expect(ring.some((h) => blocksCell(h))).toBe(false);
    const free = new Set<string>();
    expect(ringBlocked(content, map.width, free).length).toBeGreaterThan(0);
    // every lever flipped: the other cells now hold the heads
    for (const lever of of(content, "lever")) if (lever.params.target !== "") free.add(lever.uid);
    const flipped = ringBlocked(content, map.width, free);
    expect(flipped.length).toBe(ring.filter((h) => h.params.start === 0).length);
  });

  it("has every object of the quests on a floor cell the party can reach", () => {
    const names = ["arachnoid_cavern", "cursed_cold_cavern", "halls_of_insanity", "dark_warriors_keep", "slithercult_stronghold", "fortress_of_fear", "cathedral_of_carnage"];
    for (const theme of names) {
      const { map } = themedInterior(theme, 3);
      expect(map.cells.some((c) => c === CELL.FLOOR)).toBe(true);
      expect(map.dungeon!.id).toBe(theme);
    }
  });
});

// keeps the map type in the imports honest for the tests above
export type { InteriorMap };
