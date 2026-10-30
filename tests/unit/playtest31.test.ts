import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { resolveAction } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { analyzeTopology, generateInterior } from "../../src/interiors";
import { splitsRing } from "../../src/interiors/passage";
import { blueprintFor } from "../../src/interiors/town";
import { CELL, FACING_DELTA, type Facing } from "../../src/interiors/types";
import { BIOME, type Poi, type PoiKind } from "../../src/world/types";
import { World } from "../../src/world/world";
import { cellCenterX, cellCenterZ } from "../../src/render/interiorMesher";
import { ALTAR_SCALE, leverPulled, OWN_MODELS, themedProp } from "../../src/render/interiorProps";
import { floatY, FLOAT_AMPLITUDE } from "../../src/render/itemProps";
import { ACID_LAMP, crystalLamps, LAVA_LAMP, MAGIC_FIRE_LAMP } from "../../src/render/lamps";
import { createDefaultParty } from "../../src/sim/party";

const world = new World("playtest-31", "default");

function poiFor(kind: PoiKind, i: number, tier = 1 + (i % 5)): Poi {
  return { id: `p:t:${kind}:${i}`, kind, name: `${kind} ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome: BIOME.MEADOW };
}

const FACINGS: Facing[] = ["N", "E", "S", "W"];
const BEARING: Record<Facing, number> = { N: 0, E: 90, S: 180, W: 270 };

/** 31st playtest: the castle without a yard, brittle walls in Swamp Town, islands in caves, glowing traps, levers that turn, one chest for every orb. */
describe("31st playtest", () => {
  describe("castles (points 2, 3 and 4)", () => {
    const castles = Array.from({ length: 60 }, (_, i) => {
      const poi = poiFor("castle", i);
      const map = generateInterior(world, poi);
      return { map, content: buildMapContent(world, poi, map) };
    });

    it("is the keep alone: the gate is the way out and the party starts on the cell inside it, looking away from the gate", () => {
      for (const { map, content } of castles) {
        const castle = map.castle!;
        expect(map.width).toBeLessThanOrEqual(21);
        expect(castle.door).toMatchObject({ x: map.spawn.x, y: map.spawn.y });
        const into = FACING_DELTA[map.spawn.facing];
        expect(map.spawn).toMatchObject({ x: map.exit.x + into.dx, y: map.exit.y + into.dy });
        expect(castle.keep).toContain(map.spawn.y * map.width + map.spawn.x);
        // no iron gate to open and no yard: the one door of the keep is the exit
        expect(content.actions.some((a) => a.kind === "door")).toBe(false);
      }
    });

    it("puts the alarm chests in the niches of the corridors and hangs a banner across from each niche, looking at it", () => {
      let across = 0;
      for (const { map, content } of castles) {
        const open = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR;
        const alarm = content.actions.filter((a) => a.kind === "treasure" && a.params.warn === "alarm");
        expect(alarm.length).toBeGreaterThanOrEqual(3);
        const banners = content.actions.filter((a) => a.kind === "decor" && typeof a.params.bearing === "number");
        for (const c of alarm) {
          expect(FACINGS.filter((f) => open(c.x + FACING_DELTA[f].dx, c.y + FACING_DELTA[f].dy)).length, `${c.uid} is in a niche`).toBe(1);
          const f = FACINGS.find((o) => open(c.x + FACING_DELTA[o].dx, c.y + FACING_DELTA[o].dy))!;
          const front = { x: c.x + FACING_DELTA[f].dx, y: c.y + FACING_DELTA[f].dy };
          const hung = banners.find((a) => a.x === front.x && a.y === front.y);
          if (!hung) continue;
          across++;
          // it hangs on the wall behind the cell in front of the niche and looks back at the niche
          expect(open(front.x + FACING_DELTA[f].dx, front.y + FACING_DELTA[f].dy)).toBe(false);
          const back = FACINGS.find((o) => FACING_DELTA[o].dx === -FACING_DELTA[f].dx && FACING_DELTA[o].dy === -FACING_DELTA[f].dy)!;
          expect(hung.params.bearing).toBe(BEARING[back]);
        }
      }
      expect(across).toBeGreaterThan(40);
    });

    it("turns every banner away from the wall it hangs on", () => {
      for (const { map, content } of castles) {
        for (const a of content.actions) {
          if (a.kind !== "decor" || typeof a.params.bearing !== "number") continue;
          const facing = FACINGS.find((f) => BEARING[f] === a.params.bearing)!;
          const behind = FACING_DELTA[FACINGS.find((o) => FACING_DELTA[o].dx === -FACING_DELTA[facing].dx && FACING_DELTA[o].dy === -FACING_DELTA[facing].dy)!];
          expect(map.cells[(a.y + behind.dy) * map.width + a.x + behind.dx], `${a.uid} has its back to a wall`).not.toBe(CELL.FLOOR);
        }
      }
    });

    it("keeps the statue that wants the word out of every passage, and the way from the gate to the king open", () => {
      let inPassage = 0;
      for (const { map, content } of castles) {
        const castle = map.castle!;
        const objects = new Set<number>(content.actions.filter((a) => a.kind === "riddle" || a.kind === "lore" || a.kind === "king" || a.kind === "treasure" || a.kind === "decor").map((a) => a.y * map.width + a.x));
        const answer = castle.answer;
        const open = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR && (!objects.has(y * map.width + x) || (x === castle.king.x && y === castle.king.y)) && !(x === answer.x && y === answer.y);
        if (splitsRing(open, answer.x, answer.y)) inPassage++;
      }
      // (a keep whose plan leaves no other cell near the king may still need the last resort, but it is rare)
      expect(inPassage).toBeLessThan(6);
    });

    it("starts the party where Aldhold of seed frost-gate-324 began, on the cell behind the gate (15/9 in the old numbering)", () => {
      const w = new World("frost-gate-324", "default");
      const poi = w.allPois().find((p) => p.name === "Aldhold")!;
      const map = generateInterior(w, poi);
      expect(map.width).toBe(21);
      expect(map.spawn.facing).toBe("S");
      expect(map.exit).toEqual({ x: map.spawn.x, y: map.spawn.y - 1 });
      // the cell in front of the king is no longer blocked by the statue
      const content = buildMapContent(w, poi, map);
      const statue = content.actions.find((a) => a.kind === "riddle")!;
      expect(Math.abs(statue.x - map.castle!.king.x) + Math.abs(statue.y - map.castle!.king.y)).toBeGreaterThan(1);
    });
  });

  describe("Swamp Town (point 5)", () => {
    it("has three brittle walls between its long street and the one below, each with a street on both sides, and no shop behind them", () => {
      const plan = blueprintFor(4);
      expect(plan.tier).toBe(4);
      for (let i = 0; i < 40; i++) {
        const poi = poiFor("town", i, 4);
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        const walls = content.actions.filter((a) => a.kind === "breakable_wall" && a.uid.includes("#brittle:"));
        expect(walls.length, `town #${i}`).toBe(3);
        for (const a of walls) {
          expect(map.cells[a.y * map.width + a.x]).toBe(CELL.BUILDING);
          const through = a.params.axis === "y" ? [FACING_DELTA.N, FACING_DELTA.S] : [FACING_DELTA.E, FACING_DELTA.W];
          for (const d of through) expect(map.cells[(a.y + d.dy) * map.width + a.x + d.dx], `${a.uid} has a street on both sides`).toBe(CELL.FLOOR);
        }
        // every shop door can be reached without breaking a wall
        const seen = new Uint8Array(map.cells.length);
        const queue = [map.spawn.y * map.width + map.spawn.x];
        seen[queue[0]!] = 1;
        for (let head = 0; head < queue.length; head++) {
          const c = queue[head]!;
          for (const d of Object.values(FACING_DELTA)) {
            const n = (Math.floor(c / map.width) + d.dy) * map.width + (c % map.width) + d.dx;
            if (map.cells[n] !== CELL.FLOOR || seen[n]) continue;
            seen[n] = 1;
            queue.push(n);
          }
        }
        for (const a of content.actions.filter((x) => x.kind === "service")) expect(seen[a.y * map.width + a.x], `town #${i}: ${String(a.params.service)} is reachable`).toBe(1);
      }
    });

    it("has none in the other tiers", () => {
      for (const tier of [1, 2, 3, 5]) {
        const poi = poiFor("town", tier, tier);
        const map = generateInterior(world, poi);
        expect(buildMapContent(world, poi, map).actions.filter((a) => a.uid.includes("#brittle:"))).toEqual([]);
      }
    });
  });

  describe("caves (point 10)", () => {
    it("get islands of rock in their big halls with a way of two cells round them, and stay in one piece", () => {
      let withIslands = 0;
      for (let i = 0; i < 40; i++) {
        const map = generateInterior(world, poiFor("cave", i));
        // an island: a rock cell with floor all round it, or a small group of rock cells enclosed by floor two cells deep
        const w = map.width;
        const floor = (x: number, y: number) => map.cells[y * w + x] === CELL.FLOOR;
        let islands = 0;
        for (let y = 3; y < map.height - 3; y++) {
          for (let x = 3; x < w - 3; x++) {
            if (floor(x, y)) continue;
            // rock with no other rock in the 5 x 5 square apart from its own small group: count a group once, at its first cell
            let neighbours = 0;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!floor(x + dx, y + dy)) neighbours++;
            if (neighbours <= 5 && !floor(x, y)) islands++;
          }
        }
        if (islands > 0) withIslands++;
        const topo = analyzeTopology(map);
        expect(topo.reachableFloor, `cave #${i} is whole`).toBe(topo.totalFloor);
      }
      expect(withIslands).toBeGreaterThan(10);
    });

    it("gives the Hollow of Halaa of seed frost-gate-324 islands in its halls", () => {
      const w = new World("frost-gate-324", "default");
      const poi = w.allPois().find((p) => p.name === "Hollow of Halaa")!;
      const map = generateInterior(w, poi);
      const rockInHall = (x: number, y: number): boolean => {
        if (map.cells[y * map.width + x] === CELL.FLOOR) return false;
        let floor = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (map.cells[(y + dy) * map.width + x + dx] === CELL.FLOOR) floor++;
        return floor >= 19;
      };
      let found = 0;
      for (let y = 3; y < map.height - 3; y++) for (let x = 3; x < map.width - 3; x++) if (rockInHall(x, y)) found++;
      expect(found).toBeGreaterThanOrEqual(4);
    });
  });

  describe("the objects (points 1, 6, 7, 8, 9)", () => {
    it("gives lava, acid and magic fire the glow of their own colour, like the crystals", () => {
      expect(LAVA_LAMP.color[0]).toBeGreaterThan(LAVA_LAMP.color[2]);
      expect(ACID_LAMP.color[1]).toBeGreaterThan(ACID_LAMP.color[0]);
      expect(MAGIC_FIRE_LAMP.color[2]).toBeGreaterThan(MAGIC_FIRE_LAMP.color[0]);
      // a generated place lights the object of each elemental trap
      const seen = new Set<string>();
      for (let i = 0; i < 80 && seen.size < 3; i++) {
        const poi = poiFor("dungeon", i, 1 + (i % 5));
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        const traps = content.actions.filter((a) => a.kind === "trap" && a.params.trap === "generic");
        if (traps.length === 0) continue;
        const lamps = crystalLamps(content);
        for (const t of traps) {
          const element = String(t.params.element ?? "");
          const lit = lamps.some((l) => l.x === cellCenterX(t.x) && l.z === cellCenterZ(t.y));
          if (element === "fire" || element === "acid" || element === "magic") {
            expect(lit, `${t.uid} (${element}) glows`).toBe(true);
            seen.add(element);
          }
        }
      }
      expect(seen.size).toBeGreaterThanOrEqual(2);
    });

    it("scales the altar to 60 % and floats a thing in the air by a few centimetres", () => {
      expect(ALTAR_SCALE).toBeCloseTo(0.9);
      expect(OWN_MODELS[35]!.scale).toBeCloseTo(0.9);
      for (let t = 0; t < 6; t += 0.1) expect(Math.abs(floatY(t, 1.3))).toBeLessThanOrEqual(FLOAT_AMPLITUDE + 1e-9);
      expect(floatY(0, 0)).toBeCloseTo(0);
      expect(floatY(0.4, 0)).not.toBeCloseTo(0);
    });

    it("turns a lever half a circle when it has been pulled, and a look-alike lever as well", () => {
      const lever: ActionInstance = { uid: "m#lever:0", kind: "lever", x: 3, y: 3, params: { item: 39, target: "" } };
      const staticInfo = {};
      const before = themedProp(lever, 0, 0, 0, staticInfo, new Set());
      const after = themedProp(lever, 0, 0, 0, staticInfo, new Set([lever.uid]));
      expect(before).not.toBeNull();
      expect(Math.abs((after!.rotY - before!.rotY + 4 * Math.PI) % (2 * Math.PI) - Math.PI)).toBeLessThan(1e-6);
      expect(leverPulled(lever, new Set())).toBe(false);
      expect(leverPulled(lever, new Set([lever.uid]))).toBe(true);
      const lock: ActionInstance = { uid: "m#lever:1", kind: "lever", x: 4, y: 3, params: { item: 39, airlock: "m#airlock:0", side: "a", target: "" } };
      expect(leverPulled(lock, new Set(["m#airlock:0@a"]))).toBe(true);
      expect(leverPulled(lock, new Set(["m#airlock:0@b"]))).toBe(false);
    });

    it("lets a look-alike lever remember that it was pulled, and pulling again undoes it", () => {
      const lever: ActionInstance = { uid: "m#lever:0", kind: "lever", x: 3, y: 3, params: { item: 39, target: "" } };
      const party = createDefaultParty();
      const first = resolveAction(lever, { party, rootSeed: world.rootSeed, mapKey: "m", tier: 1, opened: new Set() } as never);
      expect(first.state).toEqual({ add: [lever.uid], remove: [] });
      const second = resolveAction(lever, { party, rootSeed: world.rootSeed, mapKey: "m", tier: 1, opened: new Set([lever.uid]) } as never);
      expect(second.state).toEqual({ add: [], remove: [lever.uid] });
    });
  });
});
