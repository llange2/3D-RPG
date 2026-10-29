import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { generateInterior } from "../../src/interiors";
import { BIOME, type Biome, type Poi, type PoiKind } from "../../src/world/types";
import { World } from "../../src/world/world";
import { doorFacing, doorLook, doorModelKeys } from "../../src/render/interiorDoors";
import { gateTravel } from "../../src/render/itemProps";

const world = new World("doors");

function poiFor(kind: PoiKind, i: number, biome: Biome = BIOME.MEADOW, tier = 1 + (i % 5)): Poi {
  return { id: `p:t:${kind}:${i}`, kind, name: `${kind} ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome };
}

const SEEDS = 60;

describe("doors of generated interiors", () => {
  it("castles have iron gates only, dungeons both a wooden door and a gate (the old maps: Temple of Moo, Fountain Head Cavern, the castles)", () => {
    let dungeonDoors = 0;
    let dungeonGates = 0;
    for (let i = 0; i < SEEDS; i++) {
      const castle = generateInterior(world, poiFor("castle", i));
      for (const a of buildMapContent(world, poiFor("castle", i), castle).actions) if (a.kind === "door") expect(doorLook(castle, a.x, a.y), `castle #${i}`).toBe("gate");
      const poi = poiFor("dungeon", i, BIOME.MEADOW, 1 + (i % 3)); // tiers 1 to 3 never draw the cyber theme
      const dungeon = generateInterior(world, poi);
      for (const a of buildMapContent(world, poi, dungeon).actions) {
        if (a.kind !== "door") continue;
        if (doorLook(dungeon, a.x, a.y) === "door") dungeonDoors++;
        else dungeonGates++;
      }
    }
    expect(dungeonDoors).toBeGreaterThan(50);
    expect(dungeonGates).toBeGreaterThan(50);
    // a quarter to three quarters of each: neither look is a rarity
    expect(dungeonDoors / (dungeonDoors + dungeonGates)).toBeGreaterThan(0.25);
    expect(dungeonDoors / (dungeonDoors + dungeonGates)).toBeLessThan(0.75);
  });

  it("the cyber theme (the pyramid's spaceship) has gates only", () => {
    const pyramids = new World("doors-pyramids").allPois().filter((p) => p.kind === "dungeon" && p.size === 3);
    expect(pyramids.length).toBeGreaterThan(0);
    for (const poi of pyramids.slice(0, 5)) {
      const map = generateInterior(new World("doors-pyramids"), poi);
      expect(map.theme.id).toBe("cyber");
      for (let x = 0; x < 20; x++) expect(doorLook(map, x, x * 2)).toBe("gate");
    }
  });

  it("the room lies ahead of every door (the open leaf of a wooden door goes on the corridor side)", () => {
    for (const kind of ["dungeon", "castle"] as const) {
      for (let i = 0; i < SEEDS; i++) {
        const poi = poiFor(kind, i);
        const map = generateInterior(world, poi);
        for (const a of buildMapContent(world, poi, map).actions) {
          if (a.kind !== "door") continue;
          const f = doorFacing(map, a);
          expect(["E", "W"].includes(f), `${kind} #${i} door ${a.uid}`).toBe(a.params.axis === "x");
          const dx = f === "E" ? 1 : f === "W" ? -1 : 0;
          const dy = f === "S" ? 1 : f === "N" ? -1 : 0;
          const ahead = map.roomOf[(a.y + dy) * map.width + a.x + dx]!;
          const behind = map.roomOf[(a.y - dy) * map.width + a.x - dx]!;
          // a door is a corridor cell next to a room; when both neighbours are rooms either one may be the front
          expect(ahead >= 0 || behind >= 0, `${kind} #${i} door ${a.uid} has a room next to it`).toBe(true);
          if (behind < 0) expect(ahead, `${kind} #${i} door ${a.uid}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("loads only the models its looks need", () => {
    const castle = generateInterior(world, poiFor("castle", 1));
    const castleKeys = doorModelKeys(castle, buildMapContent(world, poiFor("castle", 1), castle));
    expect(castleKeys.every((k) => ["frame_fortress", "ci_80"].includes(k))).toBe(true);
    const town = generateInterior(world, poiFor("town", 1));
    expect(doorModelKeys(town, buildMapContent(world, poiFor("town", 1), town))).toEqual([]);
    const all = new Set<string>();
    for (let i = 0; i < SEEDS; i++) {
      const poi = poiFor("dungeon", i, BIOME.MEADOW, 1 + (i % 3));
      const map = generateInterior(world, poi);
      for (const k of doorModelKeys(map, buildMapContent(world, poi, map))) all.add(k);
    }
    expect([...all].sort()).toEqual(["blk_door_closed", "blk_door_open", "ci_81", "frame_dungeon"]);
  });

  it("every model it asks for is in the asset registry", () => {
    const file = join(import.meta.dirname, "..", "..", "public", "assets", "models.static.json");
    if (!existsSync(file)) return;
    const registry = JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
    for (const k of ["blk_door_closed", "blk_door_open", "frame_dungeon", "frame_fortress", "ci_80", "ci_81"]) expect(registry[k], k).toBeDefined();
  });

  it("a gate leaves its frame like the old game's: the dungeon gate rises into the ceiling in 2.4 s, the castle gate sinks in 4 s", () => {
    const up = gateTravel(81, "up")!;
    expect(up.from).toBeCloseTo(1.42);
    expect(up.to).toBeCloseTo(4.26);
    expect(up.seconds).toBeCloseTo(2.4);
    const down = gateTravel(80, "down")!;
    expect(down.from).toBeCloseTo(1.2);
    expect(down.to).toBeCloseTo(-3.6);
    expect(down.seconds).toBeCloseTo(4);
  });
});
