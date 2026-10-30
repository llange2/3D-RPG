import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { DEBUG_LEVELS, debugLevels } from "../../src/game/debug";
import { MAP_OPEN_CELLS } from "../../src/game/minimap";
import { Builder } from "../../src/interiors/builder";
import { generateInterior } from "../../src/interiors";
import { openSquare, splitsRing } from "../../src/interiors/passage";
import { CELL, type InteriorMap } from "../../src/interiors/types";
import { createDefaultParty } from "../../src/sim/party";
import { BIOME, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";
import { ITEM_MODELS, isGlbItem } from "../../src/render/itemProps";
import { OWN_MODELS, WALL_HUNG, themedProp } from "../../src/render/interiorProps";

const poiFor = (kind: Poi["kind"], i: number, tier: number): Poi => ({ id: `p:t:${kind}:${i}`, kind, name: `${kind} ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: kind === "town" || kind === "castle" ? 2 : 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome: BIOME.MEADOW });

describe("the 21st playtest, point 10: no object in a passage of one cell", () => {
  const world = new World("objects-21", "default");
  const OBJECT_KINDS = new Set(["decor", "treasure", "shrine", "fountain", "gong", "lever", "talent", "work", "portal"]);
  const WALL_BANNERS = [103, 104, 105];

  it("puts no decoration, chest, shrine or person on a cell of a straight street, corridor or tunnel that is one cell wide", () => {
    const bad: string[] = [];
    let objects = 0;
    const all: { poi: Poi; map: InteriorMap }[] = [];
    for (let i = 0; i < 40; i++) {
      const poi = poiFor("town", 700 + i, 1 + (i % 5));
      all.push({ poi, map: generateInterior(world, poi) });
    }
    const count: Record<string, number> = {};
    for (const poi of world.allPois()) {
      if (poi.kind === "town" || (count[poi.kind] = (count[poi.kind] ?? 0) + 1) > 12) continue;
      all.push({ poi, map: generateInterior(world, poi) });
    }
    for (const { poi, map } of all) {
      const content = buildMapContent(world, poi, map);
      const objectsHere = content.actions.filter((a) => OBJECT_KINDS.has(a.kind) && !(a.kind === "decor" && WALL_BANNERS.includes(Number(a.params.item))));
      const taken = new Set(objectsHere.map((a) => a.y * map.width + a.x));
      // a way the party can walk: floor without another object (a street that ends at a person is a dead end for the object before it)
      for (const a of objectsHere) {
        const floor = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR && !taken.has(y * map.width + x);
        objects++;
        const ns = floor(a.x, a.y - 1) && floor(a.x, a.y + 1) && !floor(a.x - 1, a.y) && !floor(a.x + 1, a.y);
        const ew = floor(a.x - 1, a.y) && floor(a.x + 1, a.y) && !floor(a.x, a.y - 1) && !floor(a.x, a.y + 1);
        if (ns || ew) bad.push(`${poi.kind} ${poi.id} ${a.kind}${a.params.item !== undefined ? ":" + String(a.params.item) : ""} at ${a.x},${a.y}`);
      }
    }
    expect(objects).toBeGreaterThan(400);
    expect(bad).toEqual([]);
  });

  it("splits the ring of eight cells round a cell only where it is a passage: a wall on both sides of a corridor, not a dead end or a hall", () => {
    const grid = ["#####", "#...#", "##.##", "##.##", "#####"];
    const open = (x: number, y: number) => grid[y]?.[x] === ".";
    expect(splitsRing(open, 2, 2)).toBe(true); // the corridor below the room: a one-cell passage
    expect(splitsRing(open, 2, 3)).toBe(false); // its dead end
    expect(splitsRing(open, 1, 1)).toBe(false); // the corner of the room
    expect(splitsRing(open, 3, 1)).toBe(false);
    const hall = (x: number, y: number) => x >= 0 && y >= 0 && x < 5 && y < 5;
    expect(splitsRing(hall, 2, 2)).toBe(false); // the middle of a hall: walk round it
    // two objects side by side across a corridor of two cells shut it
    const lane = (x: number, y: number) => y >= 0 && y < 2 && x >= 0 && x < 8 && !(x === 3 && y === 0);
    expect(splitsRing(lane, 3, 1)).toBe(true);
  });
});

describe("the 21st playtest, point 11: columns", () => {
  it("stands a column only where no wall is within a cell of it, and never two columns on neighbouring cells", () => {
    const world = new World("objects-21", "default");
    let columns = 0;
    const maps: InteriorMap[] = [];
    for (let i = 0; i < 40; i++) maps.push(generateInterior(world, poiFor("town", 800 + i, 1 + (i % 5))));
    for (let i = 0; i < 25; i++) maps.push(generateInterior(world, poiFor("dungeon", 800 + i, 1 + (i % 5))), generateInterior(world, poiFor("dungeon", 900 + i, 1 + (i % 5))));
    for (const map of maps) {
      const floor = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR;
      const pillars = map.pillars ?? [];
      for (const p of pillars) {
        columns++;
        expect(openSquare(floor, p.x, p.y), `${map.key} ${p.x},${p.y}`).toBe(true);
        for (const q of pillars) if (q !== p) expect(Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)), `${map.key} ${p.x},${p.y} and ${q.x},${q.y}`).toBeGreaterThanOrEqual(2);
      }
    }
    expect(columns).toBeGreaterThan(20);
  });

  it("allows columns one cell apart, which is a colonnade, but not on neighbouring cells or next to a wall", () => {
    const b = new Builder(11, 7);
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 9; x++) b.set(x, y, CELL.FLOOR);
    expect(b.addPillar(1, 3)).toBe(false); // a wall is within a cell of it
    expect(b.addPillar(2, 3)).toBe(true);
    expect(b.addPillar(3, 3)).toBe(false); // next to the first
    expect(b.addPillar(4, 3)).toBe(true); // one cell between: a colonnade
    expect(b.addPillar(6, 3)).toBe(true);
    expect(b.pillars).toHaveLength(3);
  });
});

describe("the 21st playtest: map, debug menu and banners", () => {
  it("opens the big map 25 cells across", () => {
    expect(MAP_OPEN_CELLS).toBe(25);
  });

  it("raises every living hero by ten levels, each with the XP of its new level", () => {
    const party = createDefaultParty();
    party.characters[1]!.conditions = ["Dead"];
    const before = party.characters.map((c) => ({ level: c.level, xp: c.xp }));
    debugLevels(party);
    party.characters.forEach((c, i) => {
      if (i === 1) expect(c.level).toBe(before[i]!.level);
      else {
        expect(c.level).toBe(before[i]!.level + DEBUG_LEVELS);
        expect(c.xp).toBeGreaterThan(before[i]!.xp);
      }
    });
  });

  it("hangs the banners on the wall: they are not turned by the half circle the standing glTF objects get", () => {
    expect([...WALL_HUNG].sort()).toEqual([103, 104, 105, 125]);
    const banner = themedProp({ uid: "u#1", kind: "decor", x: 0, y: 0, params: { item: 103 } }, 0, 0, 90, {});
    expect(banner!.rotY).toBeCloseTo((90 * Math.PI) / 180, 6);
    // any other glTF object (not a banner and with a model of its own in the item table) is turned by 180 degrees
    const other = Object.keys(ITEM_MODELS).map(Number).find((id) => isGlbItem(id) && !OWN_MODELS[id] && !WALL_HUNG.has(id) && ITEM_MODELS[String(id)]!.yaw === 0 && ITEM_MODELS[String(id)]!.rotX === 0)!;
    const turned = themedProp({ uid: "u#2", kind: "decor", x: 0, y: 0, params: { item: other } }, 0, 0, 90, {});
    expect(turned!.rotY).toBeCloseTo(((90 + 180) * Math.PI) / 180 % (2 * Math.PI), 6);
  });
});

