import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { GEN_VERSION } from "../../src/core/version";
import { planDungeon } from "../../src/interiors";
import { CHUNK_SIZE, GROUND, WORLD_SIZES, WORLD_SIZE_NAMES, isTileWalkable, poiBounds, type WorldSize } from "../../src/world/types";
import { World, chunkHash } from "../../src/world/world";
import { GOLDEN_CHUNKS, GOLDEN_SEEDS, goldenSize, worldGoldenHashes } from "../helpers/golden";
import { buildWalkGrid, flood } from "../helpers/reach";

describe("world determinism", () => {
  it("builds identical chunks for the same seed and different ones for another seed", () => {
    const a = new World("alpha");
    const b = new World("alpha");
    const c = new World("beta");
    let different = 0;
    for (let cx = 0; cx < 10; cx++) {
      for (let cy = 0; cy < 10; cy++) {
        expect(chunkHash(a.chunk(cx, cy))).toBe(chunkHash(b.chunk(cx, cy)));
        if (chunkHash(a.chunk(cx, cy)) !== chunkHash(c.chunk(cx, cy))) different++;
      }
    }
    expect(different).toBeGreaterThan(20);
  });

  it("does not depend on generation order or caches (chunk alone equals chunk in a crowd)", () => {
    const coords: [number, number][] = [];
    for (let cx = -12; cx <= 12; cx += 3) for (let cy = -12; cy <= 12; cy += 3) coords.push([cx, cy]);
    const order = new Rng(seedFromString("order")).shuffle([...coords]);
    const crowded = new World("independence", "small");
    const crowdHashes = new Map<string, number>();
    for (const [cx, cy] of order) crowdHashes.set(`${cx},${cy}`, chunkHash(crowded.chunk(cx, cy)));
    for (const [cx, cy] of coords) {
      const alone = new World("independence", "small"); // fresh world, empty caches
      expect(chunkHash(alone.chunk(cx, cy))).toBe(crowdHashes.get(`${cx},${cy}`));
    }
  });

  it("chunk() agrees with tile() for every tile", () => {
    const world = new World("tiles");
    for (const [cx, cy] of [
      [0, 0],
      [-5, 7],
      [9, -9],
      [3, 4],
    ] as const) {
      const chunk = world.chunk(cx, cy);
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const t = world.tile(cx * CHUNK_SIZE + lx, cy * CHUNK_SIZE + ly);
          const i = ly * CHUNK_SIZE + lx;
          expect([chunk.biome[i], chunk.ground[i], chunk.deco[i], chunk.elevation[i]]).toEqual([t.biome, t.ground, t.deco, t.elevation]);
        }
      }
    }
  });

  it("matches the golden hashes of 100 seeds (bump GEN_VERSION and run golden:update on purpose only)", { timeout: 120_000 }, () => {
    const file = join(import.meta.dirname, "..", "golden", "world-hashes.json");
    expect(existsSync(file), "run `npm run golden:update` once to create the golden file").toBe(true);
    const golden = JSON.parse(readFileSync(file, "utf-8")) as { genVersion: number; chunks: [number, number][]; hashes: Record<string, number[]> };
    expect(golden.genVersion, "generator version changed: run `npm run golden:update`").toBe(GEN_VERSION);
    expect(golden.chunks).toEqual(GOLDEN_CHUNKS);
    for (const seed of GOLDEN_SEEDS) expect(worldGoldenHashes(seed), `seed ${seed} (${goldenSize(seed)})`).toEqual(golden.hashes[seed]);
  });
});

describe("the globe (the world wraps round)", () => {
  for (const size of WORLD_SIZE_NAMES) {
    const { width, height } = WORLD_SIZES[size];
    it(`${size}: a tile and its copies one world away are the same tile, a chunk too`, () => {
      const world = new World("globe", size);
      for (let i = 0; i < 60; i++) {
        const x = (i * 37) % width;
        const y = (i * 53) % height;
        const t = world.tile(x, y);
        expect(world.tile(x + width, y), `${x},${y} east`).toEqual(t);
        expect(world.tile(x, y - height), `${x},${y} north`).toEqual(t);
        expect(world.tile(x - 3 * width, y + 2 * height), `${x},${y} far`).toEqual(t);
      }
      // a chunk across the seam has the tiles of the chunk it is a copy of
      for (const [cx, cy] of [[0, 0], [2, 3], [-1, 4]] as const) {
        expect(chunkHash(world.chunk(cx + width / CHUNK_SIZE, cy - height / CHUNK_SIZE))).toBe(chunkHash(world.chunk(cx, cy)));
      }
    });

    it(`${size}: keeps at least three tiles of deep water at every edge, so that swimming across the seam is six tiles of open sea`, () => {
      const world = new World("seam-" + size, size);
      for (let i = 0; i < Math.max(width, height); i++) {
        for (let d = 0; d < 3; d++) {
          for (const [x, y] of [[d, i % height], [width - 1 - d, i % height], [i % width, d], [i % width, height - 1 - d]] as const) {
            expect(world.tile(x, y).ground, `${x},${y}`).toBe(GROUND.WATER);
          }
        }
      }
    });
  }

  it("lets the party sail off one edge and come in at the other: the tiles in a line across the seam are all sea", () => {
    const world = new World("sail", "small");
    const { width, height } = WORLD_SIZES.small;
    for (let y = 0; y < height; y++) for (let x = width - 4; x < width + 4; x++) expect(world.tile(x, y).ground, `${x},${y}`).toBe(GROUND.WATER);
  });
});

describe("islands", () => {
  for (const size of WORLD_SIZE_NAMES) {
    it(`${size}: levels 1 and 2 share the start island, then one island each for levels 3, 4 and 5, the towns of a level as many as the size says`, () => {
      const world = new World("islands-" + size, size);
      expect(world.islands.length).toBeGreaterThanOrEqual(4);
      expect(world.islands.slice(0, 4).map((i) => [...i.tiers])).toEqual([[1, 2], [3], [4], [5]]);
      // the other islands are small ones of level 4 or 5, never of the first three levels
      for (const isl of world.islands.slice(4)) expect([4, 5], `island ${isl.index}`).toContain(isl.tiers[0]);
      for (let tier = 1; tier <= 5; tier++) {
        const towns = world.allPois().filter((p) => p.kind === "town" && p.tier === tier);
        expect(towns.length, `towns of tier ${tier}`).toBe(WORLD_SIZES[size].towns);
      }
      const start = world.poiById("p:0:0:0")!;
      expect(start.kind).toBe("town");
      expect(start.name).toBe("Starthaven");
      expect(start.tier).toBe(1);
    });
  }

  it("builds the places on the islands: every one on land, anchored by a town where the island has one, of the level of its spot", () => {
    const world = new World("islands-places", "default");
    for (const isl of world.islands) {
      const { pois } = world.region(isl.index, 0);
      for (const p of pois) {
        expect(isl.tiers, p.id).toContain(p.tier);
        expect(world.tierAt(p.x, p.y), p.id).toBe(p.tier);
        expect(p.region).toEqual({ rx: isl.index, ry: 0 });
        expect(Math.hypot(p.x - isl.x, p.y - isl.y), p.id).toBeLessThanOrEqual(isl.reach);
      }
      if (isl.towns > 0) expect(pois[0]!.kind).toBe("town");
    }
  });

  it("starts the party on a free tile in front of Starthaven, facing it, whatever the terrain around the town is", () => {
    for (const seed of ["alpha", "beta", "gamma", "delta", "dune-keep-451", "iron-vale-164", "test", "ember"]) {
      for (const size of ["small", "default"] as const) {
        const world = new World(seed, size);
        const town = world.anchorOf(0, 0);
        const start = world.startPosition();
        expect(isTileWalkable(world.tile(start.x, start.y)), seed).toBe(true);
        expect(world.tile(start.x, start.y).poiId, seed).toBeNull();
        // within a few steps of the town's entrance, looking at it
        const front = world.frontOf(town);
        expect(Math.max(Math.abs(start.x - front.x), Math.abs(start.y - front.y)), seed).toBeLessThanOrEqual(3);
        const ahead = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[start.facing];
        expect(Math.sign(front.x - start.x) === ahead[0] || front.x === start.x, seed).toBe(true);
        expect(Math.sign(front.y - start.y) === ahead[1] || front.y === start.y, seed).toBe(true);
      }
    }
  });

  it("has about one place for every 60 tiles of land, between the density of the whole old outside map and of its finished strip", () => {
    for (const size of ["default", "large"] as const) {
      const world = new World("density", size);
      const { width, height } = WORLD_SIZES[size];
      let land = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (world.tile(x, y).ground !== GROUND.WATER && world.tile(x, y).ground !== GROUND.SHALLOW) land++;
      const perPlace = land / world.allPois().length;
      expect(perPlace, size).toBeGreaterThan(30);
      expect(perPlace, size).toBeLessThan(120);
      // a good quarter of the world is land: the islands of the old outside map are round blobs with a channel of a few tiles between them
      expect(land / (width * height), size).toBeGreaterThan(0.2);
      expect(land / (width * height), size).toBeLessThan(0.5);
    }
  });

  it("draws roads one tile wide, as the old outside map does", () => {
    const world = new World("roads", "large");
    const isRoad = (x: number, y: number) => world.tile(x, y).ground === GROUND.ROAD;
    let road = 0;
    let surrounded = 0;
    for (let y = 0; y < 300; y++) {
      for (let x = 0; x < 210; x++) {
        if (!isRoad(x, y)) continue;
        road++;
        if (isRoad(x - 1, y) && isRoad(x + 1, y) && isRoad(x, y - 1) && isRoad(x, y + 1)) surrounded++;
      }
    }
    expect(road).toBeGreaterThan(300);
    expect(surrounded / road).toBeLessThan(0.15);
  });

  it("blocks exactly the footprint of every POI (one object on plain ground, no wall ring): 2 x 2 tiles for a town and a castle, 3 x 3 for a pyramid, one for the rest", () => {
    const world = new World("poi-tiles", "large");
    for (const p of world.allPois()) {
      const pyramid = p.kind === "dungeon" && planDungeon(world, p)?.klass === "C";
      expect(p.size, `${p.id} ${p.kind}`).toBe(pyramid ? 3 : p.kind === "town" || p.kind === "castle" ? 2 : 1);
      const b = poiBounds(p);
      for (let y = b.y0 - 1; y <= b.y1 + 1; y++) {
        for (let x = b.x0 - 1; x <= b.x1 + 1; x++) {
          const t = world.tile(x, y);
          const dx = x - p.x;
          const dy = y - p.y;
          const inside = x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
          if (inside) {
            expect(t.ground, `${p.id} ${dx},${dy}`).toBe(GROUND.POI_BLOCK);
            expect(t.poiId).toBe(p.id);
            expect(isTileWalkable(t)).toBe(false);
          } else {
            expect(t.ground, `${p.id} ${dx},${dy}`).not.toBe(GROUND.POI_BLOCK);
          }
        }
      }
    }
  });

  it("has an entrance tile in front of every place, so the party never has to walk into it", () => {
    const world = new World("poi-entrance", "large");
    let withRoad = 0;
    for (const p of world.allPois()) {
      const front = world.frontOf(p);
      const b = poiBounds(p);
      // the tile in front of the middle of the side the road arrives from, touching the footprint
      const next = { N: [p.x, b.y0 - 1], E: [b.x1 + 1, p.y], S: [p.x, b.y1 + 1], W: [b.x0 - 1, p.y] }[front.side];
      expect([front.x, front.y], `${p.id} front tile is next to the place`).toEqual(next);
      const t = world.tile(front.x, front.y);
      expect(isTileWalkable(t), `${p.id} entrance ${front.x},${front.y}`).toBe(true);
      expect(world.poiAtEntrance(front.x, front.y)?.id).toBe(p.id);
      // a road that reaches the place arrives at its front
      const neighbours = [[p.x, b.y1 + 1], [b.x1 + 1, p.y], [b.x0 - 1, p.y], [p.x, b.y0 - 1]].map(([x, y]) => world.tile(x!, y!).ground);
      if (neighbours.some((g) => g === GROUND.ROAD || g === GROUND.PASS || g === GROUND.BRIDGE)) {
        withRoad++;
        expect([GROUND.ROAD, GROUND.PASS, GROUND.BRIDGE]).toContain(t.ground);
      }
      // the place itself is not an entrance
      expect(world.poiAtEntrance(p.x, p.y)).toBeNull();
    }
    expect(withRoad).toBeGreaterThan(20);
  });

  it("finds the places of a rectangle across the seam at the position they have beside it", () => {
    const world = new World("rect", "small");
    const p = world.poiById("p:0:0:0")!;
    const w = WORLD_SIZES.small.width;
    expect(world.poisInRect(p.x - 1, p.y - 1, p.x + 1, p.y + 1).map((q) => q.id)).toContain(p.id);
    const copies = world.poisInRect(p.x + w - 1, p.y - 1, p.x + w + 1, p.y + 1).filter((q) => q.id === p.id);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ x: p.x + w, y: p.y });
  });

  it("plans a world fast (the largest one in about a second) and generates chunks fast", () => {
    const t0 = performance.now();
    const huge = new World("speed", "huge");
    huge.allPois();
    expect(performance.now() - t0).toBeLessThan(2500);
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t1 = performance.now();
      huge.chunk(i * 7 - 200, i * 3 - 90);
      times.push(performance.now() - t1);
    }
    times.sort((a, b) => a - b);
    expect(times[30]!).toBeLessThan(25);
  });
});

describe("world connectivity", () => {
  // every place of an island must be reachable on foot from the first one (the shallows count as walkable here: the Swimmer talent crosses them,
  // and the roads between the places of an island are bridges and passes where they need to be)
  const SEEDS = ["alpha", "beta", "gamma", "delta", "seed-1", "seed-2", "seed-3", "seed-4"];
  const SIZES: WorldSize[] = ["small", "default"];

  for (const seed of SEEDS) {
    for (const size of SIZES) {
      it(`reaches all places of every island from its first place (seed ${seed}, ${size})`, { timeout: 120_000 }, () => {
        const world = new World(seed, size);
        const { width, height } = WORLD_SIZES[size];
        const grid = buildWalkGrid(world, 0, 0, width, height);
        const unreachable: string[] = [];
        let total = 0;
        for (const isl of world.islands) {
          const { pois } = world.region(isl.index, 0);
          if (pois.length === 0) continue;
          const first = world.frontOf(pois[0]!);
          const visited = flood(grid, first.x, first.y);
          for (const p of pois) {
            total++;
            const front = world.frontOf(p);
            if (!visited[front.y * width + front.x]) unreachable.push(`${p.id} ${p.kind} at ${p.x},${p.y}`);
          }
        }
        expect(total).toBeGreaterThan(8);
        expect(unreachable).toEqual([]);
      });
    }
  }
});
