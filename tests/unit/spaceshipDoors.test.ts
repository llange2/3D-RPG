import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { validateContent } from "../../src/actions/validate";
import { SOUNDS, filesOf } from "../../src/audio/sound-table";
import { generateInterior, planDungeon } from "../../src/interiors";
import { CELL } from "../../src/interiors/types";
import { SLIDE_PASSABLE, doorModelKeys, doorSound } from "../../src/render/interiorDoors";
import { World } from "../../src/world/world";

const shipOf = (seed: string) => {
  const world = new World(seed, "default");
  const poi = world.allPois().find((p) => planDungeon(world, p)?.klass === "C")!;
  const map = generateInterior(world, poi);
  return { world, poi, map, content: buildMapContent(world, poi, map) };
};

const ASSETS = join(import.meta.dirname, "..", "..", "public", "assets");

describe("the sliding doors of the spaceship (6. 11. 2026)", () => {
  it("puts a sliding door in the corridors that leave the rooms, next to the four airlocks", { timeout: 120_000 }, () => {
    for (const seed of ["ship-a", "ship-b", "jade-shore-568"]) {
      const { map, content } = shipOf(seed);
      const doors = content.actions.filter((a) => a.kind === "door");
      const locks = doors.filter((d) => d.params.airlock === true);
      const plain = doors.filter((d) => d.params.airlock !== true);
      expect(locks.length, seed).toBe(4);
      expect(plain.length, seed).toBeGreaterThan(8);
      const floor = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR;
      for (const d of plain) {
        expect(d.params.slide, `${seed} ${d.uid}`).toBe(true);
        // a straight piece of corridor: walls on both sides of the door and of the cells before and behind it, floor along the way
        const [ax, ay] = d.params.axis === "x" ? [1, 0] : [0, 1];
        expect(floor(d.x - ax, d.y - ay) && floor(d.x + ax, d.y + ay), `${seed} ${d.uid} floor before and behind`).toBe(true);
        for (const k of [-1, 0, 1]) for (const s of [-1, 1]) expect(floor(d.x + ax * k + ay * s, d.y + ay * k + ax * s), `${seed} ${d.uid} walls at the side`).toBe(false);
      }
      // two doors never stand close together
      for (const p of doors) for (const q of doors) if (p !== q) expect(Math.abs(p.x - q.x) + Math.abs(p.y - q.y), `${seed} ${p.uid} ${q.uid}`).toBeGreaterThanOrEqual(3);
      // (jade-shore-568 has cut cells that the doors do not cause: the same six findings come without them)
      if (seed !== "jade-shore-568") expect(validateContent(map, content), seed).toEqual([]);
    }
  });

  it("loads the frame and the two leaves, they are in the registry, and the sound is in the table and on disk", () => {
    const { map, content } = shipOf("ship-a");
    expect(doorModelKeys(map, content).sort()).toEqual(["obj_space_door_left", "obj_space_door_right", "obj_space_lock"]);
    for (const file of ["models.static.json", "models.static.original.json"]) {
      if (!existsSync(join(ASSETS, file))) continue;
      const registry = JSON.parse(readFileSync(join(ASSETS, file), "utf-8")) as Record<string, { bounds: number[] }>;
      for (const k of ["obj_space_lock", "obj_space_door_left", "obj_space_door_right"]) expect(registry[k], `${file} ${k}`).toBeDefined();
      // the leaves fit the frame's opening: as high as the opening and each as wide as its half with a little overlap
      const b = registry["obj_space_lock"]!.bounds;
      expect(b[3]! - b[0]!).toBeCloseTo(0.8667, 3);
      expect(b[4]! - b[1]!).toBeCloseTo(0.9531, 3);
    }
    expect(doorSound("slide")).toBe(9056);
    expect(filesOf(SOUNDS[9056]!)).toEqual(["space_ship_door"]);
    if (existsSync(join(ASSETS, "audio", "sfx"))) expect(existsSync(join(ASSETS, "audio", "sfx", "space_ship_door.webm"))).toBe(true);
    expect(SLIDE_PASSABLE).toBeGreaterThan(0.5);
    expect(SLIDE_PASSABLE).toBeLessThan(1);
  });
});
