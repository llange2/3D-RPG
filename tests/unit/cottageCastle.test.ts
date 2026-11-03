import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateInterior, type InteriorMap } from "../../src/interiors";
import { FACING_DELTA, CELL } from "../../src/interiors/types";
import { COTTAGE_MODEL } from "../../src/data/item-tuning";
import { ceilingModelOfTexture, floorModelOfTexture } from "../../src/render/environment";
import { cottageProp } from "../../src/render/itemProps";
import { floorModelAt, meshInterior } from "../../src/render/interiorMesher";
import { PIRATE_SHIP_MODEL, PirateShip } from "../../src/render/pirateShip";
import { COTTAGE_EVERY, CARAVAN_TALENTS, caravansOf } from "../../src/world/caravans";
import { BIOME, poiEntrances, type PoiSide } from "../../src/world/types";
import { World } from "../../src/world/world";

const ROOT = join(import.meta.dirname, "..", "..");
const PUBLIC = join(ROOT, "public", "assets");

describe("the user's models live in the repository", () => {
  it("has every file the model pipeline names with `new:` under tools/assets/sources/models", () => {
    const text = readFileSync(join(ROOT, "tools", "assets", "build-models.ts"), "utf-8");
    const files = [...text.matchAll(/"new:([^"]+\.glb)"/g)].map((m) => m[1]!);
    expect(new Set(files).size).toBeGreaterThanOrEqual(11);
    for (const f of files) expect(existsSync(join(ROOT, "tools", "assets", "sources", "models", f)), f).toBe(true);
    // the `.ignore` folder was a hand-over folder: nothing reads it any more
    expect(text).toContain(`join(ROOT, "tools", "assets", "sources", "models")`);
    expect(text).not.toContain(`join(ROOT, ".ignore"`);
  });

  it("has the cottage, the pirate ship, the castle's floor and the spaceship's ceiling in both model sets", () => {
    for (const file of ["models.static.json", "models.static.original.json"]) {
      if (!existsSync(join(PUBLIC, file))) continue;
      const r = JSON.parse(readFileSync(join(PUBLIC, file), "utf-8")) as Record<string, { file: string; bounds: number[] }>;
      for (const key of [COTTAGE_MODEL, PIRATE_SHIP_MODEL, "blk_fortress_floor", "blk_cyber_ceiling"]) {
        expect(r[key], `${file} ${key}`).toBeDefined();
        expect(existsSync(join(PUBLIC, r[key]!.file)), `${file} ${key} file`).toBe(true);
      }
    }
  });
});

describe("the cottage in the place of every third caravan", () => {
  it("is one of the three wagons of a tier-1 town, and about a third of all wagons", () => {
    let wagons = 0;
    let cottages = 0;
    for (const seed of ["test", "alpha", "hollow-mere-793", "cedar-peak-198"]) {
      const world = new World(seed, "large");
      for (const town of world.allPois().filter((p) => p.kind === "town")) {
        const list = caravansOf(world, town);
        if (CARAVAN_TALENTS[town.tier]?.length === 3 && list.length === 3) expect(list.filter((c) => c.cottage), `${seed} ${town.id}`).toHaveLength(1);
        wagons += list.length;
        cottages += list.filter((c) => c.cottage).length;
        // the same town always has the same houses
        expect(caravansOf(new World(seed, "large"), town).map((c) => c.cottage)).toEqual(list.map((c) => c.cottage));
      }
    }
    expect(wagons).toBeGreaterThan(20);
    expect(cottages / wagons).toBeGreaterThan(1 / COTTAGE_EVERY - 0.15);
    expect(cottages / wagons).toBeLessThan(1 / COTTAGE_EVERY + 0.15);
  });

  it("stands on the ground, turned the way the wagon would face", () => {
    const prop = cottageProp(90, 12, -7);
    expect(prop).toMatchObject({ model: COTTAGE_MODEL, x: 12, y: 0, z: -7 });
    expect(prop.scale).toBeGreaterThan(2);
  });
});

describe("the road of a town ends at its door, which the village model has on the right", () => {
  // seen from outside: the visitor looks at the town, so the right hand is west for a town on whose north side the road ends (the visitor faces south) and so on
  const RIGHT: Record<PoiSide, { dx: number; dy: number }> = { N: { dx: -1, dy: 0 }, S: { dx: 1, dy: 0 }, E: { dx: 0, dy: -1 }, W: { dx: 0, dy: 1 } };

  it("puts the first entrance tile of a town on the right, whichever side the road comes to", () => {
    for (const side of ["N", "E", "S", "W"] as const) {
      const [first, second] = poiEntrances({ x: 20, y: 30, size: 2, side, kind: "town" });
      const r = RIGHT[side];
      expect({ dx: first!.x - second!.x, dy: first!.y - second!.y }, side).toEqual(r);
    }
  });

  it("leaves the other places as they were: the first tile of a castle is still the one with the larger coordinate", () => {
    for (const side of ["N", "E", "S", "W"] as const) {
      const [first, second] = poiEntrances({ x: 20, y: 30, size: 2, side, kind: "castle" });
      expect(first!.x + first!.y, side).toBeGreaterThan(second!.x + second!.y);
    }
    // one tile and three tiles wide have one entrance, as ever
    expect(poiEntrances({ x: 20, y: 30, size: 3, side: "N", kind: "dungeon" })).toHaveLength(1);
    expect(poiEntrances({ x: 20, y: 30, size: 1, side: "N", kind: "cave" })).toHaveLength(1);
  });

  it("is what every town of a world does (`frontOf`, the tile the road and the start use)", () => {
    const world = new World("cedar-peak-198", "default");
    for (const town of world.allPois().filter((p) => p.kind === "town")) {
      const [first, second] = poiEntrances(town);
      expect(world.frontOf(town)).toMatchObject({ x: first!.x, y: first!.y });
      expect({ dx: first!.x - second!.x, dy: first!.y - second!.y }, town.id).toEqual(RIGHT[town.side]);
    }
  });
});

describe("the castle in Full 3D: gate, corners, floor", () => {
  const world = new World("environment");
  const poi = { id: "p:e:castle", kind: "castle" as const, name: "castle", x: 3, y: 4, size: 2, side: "S" as const, region: { rx: 0, ry: 0 }, anchor: false, tier: 2, biome: BIOME.MEADOW };
  const castle: InteriorMap = generateInterior(world, poi);
  const models = new Set(["blk_fortress_wall", "blk_fortress_floor"]);
  const geo = meshInterior(castle, new Set(), { models });
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= castle.width || y >= castle.height ? CELL.SOLID : castle.cells[y * castle.width + x]);

  it("has a castle with a gate that is a model of its own", () => {
    expect(castle.castle).toBeTruthy();
  });

  it("puts no wall piece in front of the gate: the wooden door was hidden behind it", () => {
    const dx = castle.exit.x - castle.spawn.x;
    const dy = castle.exit.y - castle.spawn.y;
    // the wall behind the exit cell is the one the gate stands in
    const behind = (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N") as keyof typeof FACING_DELTA;
    expect(geo.panels.some((p) => p.x === castle.exit.x && p.y === castle.exit.y && p.dir === behind)).toBe(false);
    // every other wall face has its piece
    expect(geo.panels.length).toBeGreaterThan(100);
  });

  it("reaches the piece of a wall that runs east to west over the notch at a corner that sticks out, and only there", () => {
    const has = (x: number, y: number, dir: string) => geo.panels.some((q) => q.x === x && q.y === y && q.dir === dir);
    const opposite = { N: "S", S: "N", E: "W", W: "E" } as const;
    let grown = 0;
    for (const p of geo.panels) {
      if (p.dir === "E" || p.dir === "W") expect(p.grow, `${p.x},${p.y} ${p.dir}`).toEqual([]);
      const d = FACING_DELTA[p.dir];
      for (const side of ["E", "W"] as const) {
        const e = FACING_DELTA[side];
        const sticksOut = (p.dir === "N" || p.dir === "S") && at(p.x + e.dx, p.y + e.dy) === CELL.FLOOR && has(p.x + d.dx + e.dx, p.y + d.dy + e.dy, opposite[side]);
        expect(p.grow.includes(side), `${p.x},${p.y} ${p.dir} ${side}`).toBe(sticksOut);
        if (sticksOut) grown++;
      }
    }
    expect(grown).toBeGreaterThan(5);
  });

  it("has a 3D floor model on its floor cells (the castle's floor texture), and a ceiling for the spaceship's cyber texture", () => {
    expect(floorModelOfTexture("tex_fortress_floor")).toEqual({ model: "blk_fortress_floor", replacesQuad: false });
    expect(floorModelAt(castle, castle.spawn.x, castle.spawn.y)).toBe("blk_fortress_floor");
    expect(ceilingModelOfTexture("tex/tex_cyber_ceiling")).toBe("blk_cyber_ceiling");
  });
});

describe("the pirate ship is the user's model", () => {
  /** Stands in for the prop renderer: what the ship asks of it. */
  function fakeProps() {
    const calls: { instances: Record<string, { model: string; rotY: number; y: number; scale: number }[]>; visibility: number[]; removed: string[] } = { instances: {}, visibility: [], removed: [] };
    const props = {
      setInstances: (owner: string, list: { model: string; rotY: number; y: number; scale: number }[]) => void (calls.instances[owner] = list),
      removeOwner: (owner: string) => void (delete calls.instances[owner], calls.removed.push(owner)),
      setVisibility: (_key: string, a: number) => void calls.visibility.push(a),
      flush: () => undefined,
    };
    return { props: props as unknown as ConstructorParameters<typeof PirateShip>[0], calls };
  }

  it("stands in the water as one instance of the model, bow along its heading, and rocks", () => {
    const { props, calls } = fakeProps();
    const ship = new PirateShip(props);
    ship.place(10, 20, 0);
    const first = calls.instances["pirate-ship"]![0]!;
    expect(first.model).toBe(PIRATE_SHIP_MODEL);
    // the file has its bow towards +x, the game's heading 0 is +z: a quarter circle back
    expect(first.rotY).toBeCloseTo(-Math.PI / 2, 6);
    expect(first.y).toBeLessThan(0);
    ship.place(10, 20, Math.PI);
    expect(calls.instances["pirate-ship"]![0]!.rotY).toBeCloseTo(Math.PI / 2, 6);
    expect(ship.shown).toBe(true);
  });

  it("fades out through the visibility of the model and is gone afterwards", async () => {
    const { props, calls } = fakeProps();
    const ship = new PirateShip(props);
    ship.place(0, 0, 0);
    const gone = ship.fadeOut(0.5);
    for (let i = 0; i < 8; i++) ship.update(0.1);
    await gone;
    expect(ship.shown).toBe(false);
    // it went transparent while it faded, and the model is solid again afterwards (the showcase draws it too)
    expect(Math.min(...calls.visibility)).toBe(0);
    expect(calls.visibility.at(-1)).toBe(1);
    expect(calls.instances["pirate-ship"]).toBeUndefined();
    // hidden at once inside a place
    ship.place(0, 0, 0);
    ship.hide();
    expect(ship.shown).toBe(false);
  });
});
