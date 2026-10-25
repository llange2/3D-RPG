/**
 * 28th playtest, point 1: the lava islands (rock and lava, streams one or two tiles wide as the ways, 25 points of fire damage per step) and the bare earth
 * in the grass of the meadow and forest islands.
 */
import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { recalcValues } from "../../src/sim/character";
import { elementalDamage } from "../../src/sim/combat";
import { LAVA_DAMAGE, walkOnLava } from "../../src/sim/lava";
import { createDefaultParty } from "../../src/sim/party";
import type { Party } from "../../src/sim/types";
import { BIOME, DECO, GROUND, isTileWalkable, poiBounds, poiEntrances, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const rng = (s: string) => new Rng(seedFromString(s));
const SEEDS = ["alpha", "beta", "gamma", "delta", "birch-hold-759", "onyx-peak-786"];
const SIZES: WorldSize[] = ["small", "default", "large", "huge"];
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const;

/** The default party without gear: the 25 points are what resistances do not touch. */
function bareParty(): Party {
  const p = createDefaultParty();
  for (const c of p.characters) for (const slot of Object.keys(c.inventory)) c.inventory[slot] = null;
  for (const c of p.characters) recalcValues(c, p.talents, true);
  return p;
}

describe("28th playtest, point 1: the lava islands", () => {
  it("has one lava island on a small or default world and two on a large or huge one, and the towns of level 5 stand on them", () => {
    for (const size of SIZES) {
      for (const seed of SEEDS) {
        const world = new World(seed, size);
        const lava = world.islands.filter((i) => i.biome === BIOME.LAVA);
        expect(lava.length, `${seed} ${size}`).toBe(size === "small" || size === "default" ? 1 : 2);
        const fives = world.allPois().filter((q) => q.kind === "town" && q.tier === 5);
        expect(fives.length, `${seed} ${size}: towns of level 5`).toBeGreaterThan(0);
        for (const p of fives) expect(world.islands[p.region.rx]!.biome, `${seed} ${size}: ${p.name}`).toBe(BIOME.LAVA);
        // a lava island is medium sized: a big island, smaller than the start island
        for (const isl of lava) {
          expect(isl.big).toBe(true);
          expect(isl.r).toBeLessThan(world.islands[0]!.r);
        }
      }
    }
  });

  it("is rock and lava all over, with bare ground only where a place clears it or a stream meets the sea", () => {
    for (const seed of SEEDS) {
      const world = new World(seed, "default");
      for (const isl of world.islands.filter((i) => i.biome === BIOME.LAVA)) {
        const pois = world.region(isl.index, 0).pois;
        const nearPlace = (x: number, y: number): boolean =>
          pois.some((p) => {
            const b = poiBounds(p);
            return x >= b.x0 - 3 && x <= b.x1 + 3 && y >= b.y0 - 3 && y <= b.y1 + 3;
          });
        let rock = 0;
        let lava = 0;
        let bare = 0;
        for (let dy = isl.box.y0; dy <= isl.box.y1; dy++) {
          for (let dx = isl.box.x0; dx <= isl.box.x1; dx++) {
            const x = isl.x + dx;
            const y = isl.y + dy;
            if (world.islandAt(x, y)?.index !== isl.index) continue;
            const t = world.tile(x, y);
            if (t.ground === GROUND.MOUNTAIN) rock++;
            else if (t.ground === GROUND.LAVA_POOL) lava++;
            else if (t.ground === GROUND.LAND && !t.poiId) {
              // (a stream that runs along the coast, two tiles wide, lies bare for the whole stretch)
              const shore = [...AROUND, [2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [2, -2], [-2, 2]].some(([ax, ay]) => {
                const g = world.tile(x + ax!, y + ay!).ground;
                // a pool of lava or water beside lava is made land (`rawTile`: no painted tile for three grounds at a corner)
                return g === GROUND.WATER || g === GROUND.SHALLOW || g === GROUND.LAVA_POOL;
              });
              expect(nearPlace(x, y) || shore, `${seed} island ${isl.index}: ${x},${y} is bare`).toBe(true);
              bare++;
            }
            expect(t.ground, `${seed}: no road on a lava island`).not.toBe(GROUND.ROAD);
            expect(t.deco, `${seed}: nothing grows on a lava island`).not.toBe(DECO.TREE);
          }
        }
        expect(rock, `${seed} island ${isl.index}: mountains`).toBeGreaterThan(lava);
        expect(lava, `${seed} island ${isl.index}: lava`).toBeGreaterThan(isl.area / 20);
        expect(bare, `${seed} island ${isl.index}: bare ground`).toBeLessThan(isl.area / 2);
      }
    }
  });

  it("has a way in from the sea that reaches every place, and walls of mountains elsewhere", () => {
    for (const size of SIZES) {
      for (const seed of SEEDS.slice(0, 3)) {
        const world = new World(seed, size);
        for (const isl of world.islands.filter((i) => i.biome === BIOME.LAVA)) {
          const pois = world.region(isl.index, 0).pois;
          // the landings: walkable tiles of the island with shallow water beside them
          const landings: [number, number][] = [];
          for (let dy = isl.box.y0; dy <= isl.box.y1; dy++) {
            for (let dx = isl.box.x0; dx <= isl.box.x1; dx++) {
              // (the ground of the shore may be sea made land: no test for the island's own raster)
              const x = world.wrapX(isl.x + dx);
              const y = world.wrapY(isl.y + dy);
              const t = world.tile(x, y);
              if (!isTileWalkable(t) || t.poiId !== null) continue;
              if (NEIGHBOURS.some(([ax, ay]) => world.tile(x + ax, y + ay).ground === GROUND.SHALLOW)) landings.push([x, y]);
            }
          }
          expect(landings.length, `${seed} ${size} island ${isl.index}: a landing`).toBeGreaterThan(0);
          const seen = new Set<number>();
          const key = (x: number, y: number) => world.wrapY(y) * world.width + world.wrapX(x);
          const stack: [number, number][] = [];
          for (const [x, y] of landings) {
            seen.add(key(x, y));
            stack.push([x, y]);
          }
          while (stack.length > 0) {
            const [x, y] = stack.pop()!;
            for (const [ax, ay] of NEIGHBOURS) {
              const t = world.tile(x + ax, y + ay);
              if (seen.has(key(x + ax, y + ay)) || !isTileWalkable(t) || t.poiId !== null) continue;
              // shallow water is the sea round the island, walkable only for swimmers
              if (t.ground === GROUND.SHALLOW) continue;
              seen.add(key(x + ax, y + ay));
              stack.push([x + ax, y + ay]);
            }
          }
          for (const p of pois) {
            const door = poiEntrances(p)[0]!;
            expect(seen.has(key(door.x, door.y)), `${seed} ${size} island ${isl.index}: ${p.name} is reached`).toBe(true);
          }
        }
      }
    }
  });

  it("burns every hero for 25 points of fire on each step, less by Protection from Elementals and the Fairy, never when hovering", () => {
    const open = createDefaultParty();
    expect(walkOnLava(open, rng("lava")).hits.length).toBeGreaterThan(0);
    const bare = bareParty();
    const before = bare.characters.map((c) => c.hp);
    // the 25 points are cut by each hero's own fire resistance, like every other hit of fire
    const wanted = bare.characters.map((c) => elementalDamage(bare, c, "fire", LAVA_DAMAGE));
    for (const w of wanted) expect(w).toBeGreaterThan(15);
    expect(LAVA_DAMAGE).toBe(25);
    expect(walkOnLava(bare, rng("lava")).hits.map((h) => h.damage)).toEqual(wanted);
    expect(bare.characters.map((c, i) => before[i]! - c.hp)).toEqual(wanted);
    // Protection from Elementals (fire) takes as many points as the caster has levels: 25 levels take all of it, 10 take part
    const shielded = bareParty();
    shielded.effects.push({ kind: "protection", until: shielded.minutes + 480, element: "fire", amount: 25 });
    expect(walkOnLava(shielded, rng("lava")).hits).toEqual([]);
    const weak = bareParty();
    weak.effects.push({ kind: "protection", until: weak.minutes + 480, element: "fire", amount: 10 });
    expect(walkOnLava(weak, rng("lava")).hits.map((h) => h.damage)).toEqual(wanted.map((w) => w - 10));
    // the Fairy takes 30 off every elemental hit
    const fairy = bareParty();
    fairy.mascot = "Fairy";
    expect(walkOnLava(fairy, rng("lava")).hits).toEqual([]);
    // a hovering party does not touch the lava
    const hover = bareParty();
    hover.effects.push({ kind: "levitate", until: hover.minutes + 480 });
    expect(walkOnLava(hover, rng("lava")).hits).toEqual([]);
    // the dead are not burnt again
    const dead = bareParty();
    dead.characters[0]!.conditions = ["Dead"];
    expect(walkOnLava(dead, rng("lava")).hits.map((h) => h.character)).not.toContain(0);
  });
});

describe("28th playtest, point 1g: bare earth in the grass", () => {
  it("lays patches of dirt on meadow and forest islands, away from water, roads and places, and nowhere else", () => {
    let grass = 0;
    let dirt = 0;
    for (const seed of SEEDS) {
      const world = new World(seed, "default");
      for (const isl of world.islands) {
        const green = isl.biome === BIOME.MEADOW || isl.biome === BIOME.FOREST;
        for (let dy = isl.box.y0; dy <= isl.box.y1; dy++) {
          for (let dx = isl.box.x0; dx <= isl.box.x1; dx++) {
            const x = isl.x + dx;
            const y = isl.y + dy;
            if (world.islandAt(x, y)?.index !== isl.index) continue;
            const t = world.tile(x, y);
            if (green && t.ground === GROUND.LAND) grass++;
            if (!t.dirt) continue;
            dirt++;
            expect(green, `${seed}: dirt on an island of climate ${isl.biome}`).toBe(true);
            expect(t.ground).toBe(GROUND.LAND);
            for (const [ax, ay] of AROUND) {
              const g = world.tile(x + ax, y + ay).ground;
              expect(g === GROUND.LAND || g === GROUND.MOUNTAIN, `${seed}: dirt at ${x},${y} beside ground ${g}`).toBe(true);
            }
          }
        }
      }
    }
    expect(dirt / grass, "share of dirt").toBeGreaterThan(0.03);
    expect(dirt / grass, "share of dirt").toBeLessThan(0.25);
  });
});
