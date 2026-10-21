import { describe, expect, it } from "vitest";
import { analyzeTopology, generateInterior, interiorHash, CELL, FACING_DELTA, type InteriorMap } from "../../src/interiors";
import { blueprintFor } from "../../src/interiors/town";
import { BIOME, type Biome, type Poi, type PoiKind } from "../../src/world/types";
import { World } from "../../src/world/world";

const world = new World("interiors");

function poiFor(kind: PoiKind, i: number, biome: Biome = BIOME.MEADOW, tier = 1 + (i % 5)): Poi {
  return { id: `p:t:${kind}:${i}`, kind, name: `${kind} ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome };
}

function check(map: InteriorMap, label: string): void {
  const topo = analyzeTopology(map);
  const at = (x: number, y: number) => map.cells[y * map.width + x];
  expect(at(map.exit.x, map.exit.y), `${label}: exit is floor`).toBe(CELL.FLOOR);
  expect(at(map.spawn.x, map.spawn.y), `${label}: spawn is floor`).toBe(CELL.FLOOR);
  // the party appears one step in from the way out, looking away from it; the wall with the door is behind the exit cell (towns turn, so it
  // is not always the south wall)
  const into = FACING_DELTA[map.spawn.facing];
  expect(map.spawn, label).toMatchObject({ x: map.exit.x + into.dx, y: map.exit.y + into.dy });
  expect(at(map.exit.x - into.dx, map.exit.y - into.dy) ?? CELL.SOLID, `${label}: exit has a wall behind it`).not.toBe(CELL.FLOOR);
  expect(topo.reachableFloor, `${label}: every floor cell is reachable`).toBe(topo.totalFloor);
  for (const room of map.rooms) expect(at(room.cx, room.cy), `${label}: room ${room.id} centre is floor`).toBe(CELL.FLOOR);
  // nothing may touch the map border
  for (let x = 0; x < map.width; x++) {
    expect(at(x, 0)).not.toBe(CELL.FLOOR);
    expect(at(x, map.height - 1)).not.toBe(CELL.FLOOR);
  }
  for (let y = 0; y < map.height; y++) {
    expect(at(0, y)).not.toBe(CELL.FLOOR);
    expect(at(map.width - 1, y)).not.toBe(CELL.FLOOR);
  }
}

const KINDS: PoiKind[] = ["dungeon", "cave", "castle", "town"];
const SEEDS = 500;

describe("interior generators", () => {
  for (const kind of KINDS) {
    it(`${kind}: ${SEEDS} seeds are connected, bounded and well-formed`, { timeout: 120_000 }, () => {
      for (let i = 0; i < SEEDS; i++) {
        const map = generateInterior(world, poiFor(kind, i));
        check(map, `${kind} #${i}`);
        if (kind === "dungeon") {
          expect(map.rooms.length).toBeGreaterThanOrEqual(8);
          expect(map.rooms.length).toBeLessThanOrEqual(25);
        }
        if (kind === "castle") expect(map.rooms.length).toBeGreaterThanOrEqual(4);
        if (kind === "cave") expect(analyzeTopology(map).totalFloor).toBeGreaterThan(200); // 40 x 40 since the sixteenth playtest
        if (kind === "town") {
          // the ground plan of the tier (Fountain Head for tier 1 up to Blistering Heights), turned by chance: not square, 16 to 18 cells a side
          const plan = blueprintFor(map.tier);
          const planW = Math.max(...plan.rows.map((r) => r.length));
          expect([map.width, map.height].sort(), `town #${i} size`).toEqual([planW, plan.rows.length].sort());
          // one shop for each of the seven services, a street cell with the house wall behind it that carries the door
          expect(map.lots.length, `town #${i} shops`).toBeGreaterThanOrEqual(7);
          expect(map.lots.length).toBeLessThanOrEqual(10);
          // a town may have a few walkable cells with the "4 pillars" model (nineteenth playtest, point 7), never on a shop's door
          expect(map.pillars?.length ?? 0, `town #${i} pillars`).toBeLessThanOrEqual(5);
          for (const q of map.pillars ?? []) {
            expect(map.cells[q.y * map.width + q.x], `town #${i} pillar on floor`).toBe(CELL.FLOOR);
            expect(map.lots.some((l) => l.door.x === q.x && l.door.y === q.y), `town #${i} pillar on a door`).toBe(false);
          }
          for (const lot of map.lots) {
            const { x, y, facing } = lot.door;
            const d = FACING_DELTA[facing];
            expect(map.cells[y * map.width + x], `town #${i} door`).toBe(CELL.FLOOR);
            expect(map.cells[(y - d.dy) * map.width + (x - d.dx)], `town #${i} wall behind the door`).toBe(CELL.BUILDING);
            expect(lot.inline).toBe(true);
          }
        }
      }
    });

    it(`${kind}: same POI gives the identical map, different POIs differ`, { timeout: 120_000 }, () => {
      const hashes = new Set<number>();
      for (let i = 0; i < 40; i++) {
        const a = interiorHash(generateInterior(world, poiFor(kind, i)));
        const b = interiorHash(generateInterior(new World("interiors"), poiFor(kind, i)));
        expect(a).toBe(b);
        hashes.add(a);
      }
      // a town is one of five ground plans, turned eight ways, with its shops on different cells: far fewer than 40, but not one
      expect(hashes.size).toBeGreaterThanOrEqual(kind === "town" ? 10 : 40);
    });

    it(`${kind}: generates quickly (median under 50 ms)`, () => {
      const times: number[] = [];
      for (let i = 0; i < 25; i++) {
        const t0 = performance.now();
        generateInterior(world, poiFor(kind, 1000 + i));
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      expect(times[12]!).toBeLessThan(50);
    });
  }

  it("uses different themes for different biomes, and the cyber look is the pyramid's alone", () => {
    const themes = new Set<string>();
    for (const biome of [BIOME.MEADOW, BIOME.LAVA, BIOME.SNOW, BIOME.SWAMP, BIOME.DESERT]) {
      for (const kind of KINDS) themes.add(generateInterior(world, poiFor(kind, 3, biome, 2)).theme.id);
    }
    expect(themes.size).toBeGreaterThanOrEqual(12);
    // places that belong to no region plan are free places; only a pyramid (see dungeonThemes.test.ts) is a spaceship
    for (let i = 0; i < 200; i++) expect(generateInterior(world, poiFor("dungeon", i, BIOME.MEADOW, 5)).theme.id).not.toBe("cyber");
  });
});
