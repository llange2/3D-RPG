import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildMapContent, portalStart, validateContent } from "../../src/actions";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import { blocksCell } from "../../src/actions/registry";
import { seedFromString } from "../../src/core/rng";
import { MINIMAP_CELLS } from "../../src/game/minimap";
import { CELL, FACING_DELTA, generateInterior } from "../../src/interiors";
import { createDefaultParty } from "../../src/sim/party";
import { overworldMascotSpots } from "../../src/world/mascots";
import { BIOME, CHUNK_SIZE, DECO, GROUND, isTileWalkable, poiBounds, poiEntrances, type Poi, type TileInfo } from "../../src/world/types";
import { World } from "../../src/world/world";
import { buildWalkGrid, flood } from "../helpers/reach";

const ASSETS = join(import.meta.dirname, "..", "..", "public", "assets");
const isRoad = (g: number) => g === GROUND.ROAD || g === GROUND.BRIDGE || g === GROUND.PASS;
const poiFor = (kind: Poi["kind"], i: number, tier: number): Poi => ({ id: `p:t:${kind}:${i}`, kind, name: `${kind} ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: kind === "town" || kind === "castle" ? 2 : 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome: BIOME.MEADOW });

describe("nineteenth playtest: the island of the start town and the mascots (points 1 and 3)", () => {
  const world = new World("glade-gate-573");
  const town = world.anchorOf(0, 0);
  const b = poiBounds(town);

  it("clears two tiles of land all round a place, so Starthaven here is an island the party can walk round", () => {
    for (let y = b.y0 - 2; y <= b.y1 + 2; y++) {
      for (let x = b.x0 - 2; x <= b.x1 + 2; x++) {
        if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) continue;
        expect([GROUND.LAND, GROUND.ROAD], `${x}/${y}`).toContain(world.tile(x, y).ground);
      }
    }
  });

  it("puts the mascots where they close no way: the whole ring round the town stays walkable from the start", () => {
    const spots = overworldMascotSpots(world);
    expect(spots.length).toBe(4);
    for (const s of spots) expect(world.leavesPassage(s.x, s.y), `${s.mascot} at ${s.x}/${s.y}`).toBe(true);
    const x0 = b.x0 - 12;
    const y0 = b.y0 - 12;
    const grid = buildWalkGrid(world, x0, y0, 40, 40);
    for (const s of spots) grid.walkable[(s.y - y0) * 40 + (s.x - x0)] = 0;
    const start = world.startPosition();
    const seen = flood(grid, start.x, start.y);
    for (let y = b.y0 - 2; y <= b.y1 + 2; y++) {
      for (let x = b.x0 - 2; x <= b.x1 + 2; x++) {
        const i = (y - y0) * 40 + (x - x0);
        if (!grid.walkable[i]) continue;
        expect(seen[i], `${x}/${y} is cut off`).toBe(1);
      }
    }
  });

  it("never lets a mascot or a wagon close a way, in 40 worlds", () => {
    for (let n = 0; n < 40; n++) {
      const w = new World(`mascots-${n}`);
      for (const s of overworldMascotSpots(w)) {
        expect(w.leavesPassage(s.x, s.y), `mascots-${n} ${s.mascot}`).toBe(true);
        expect(w.poiAtEntrance(s.x, s.y), `mascots-${n} ${s.mascot} stands in a doorway`).toBeNull();
      }
    }
  });

  it("makes a tile an obstacle may not stand on: a corridor of one tile, a bend, a strip of land", () => {
    // the middle of a pass through the mountains cannot hold an obstacle, the middle of a meadow can
    let corridor = 0;
    let meadow = 0;
    for (const seed of ["ember-shore-348", "alpha", "beta", "gamma", "delta"]) {
      const w = new World(seed, "large");
      for (let y = 0; y < 200; y++) {
        for (let x = 0; x < 200; x++) {
          const t = w.tile(x, y);
          if (!isTileWalkable(t)) continue;
          const around = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].every(([dx, dy]) => isTileWalkable(w.tile(x + dx!, y + dy!)));
          if (around) {
            if (meadow < 3000) expect(w.leavesPassage(x, y)).toBe(true);
            meadow++;
          } else if (t.ground === GROUND.PASS && !w.leavesPassage(x, y)) corridor++;
        }
      }
    }
    expect(meadow).toBeGreaterThan(0);
    expect(corridor).toBeGreaterThan(0);
  });
});

describe("nineteenth playtest: the shore is shallow (point 3)", () => {
  it("turns every water tile beside land, a road or a bridge into shallow water, even at a corner", () => {
    let shallow = 0;
    let deep = 0;
    for (const seed of ["glade-gate-573", "kelp-mere-931", "dune-keep-451", "alpha", "pearl-wood-564"]) {
      const world = new World(seed);
      const start = world.startPosition();
      for (let y = start.y - 36; y <= start.y + 36; y++) {
        for (let x = start.x - 36; x <= start.x + 36; x++) {
          const t = world.tile(x, y);
          if (t.ground === GROUND.SHALLOW) shallow++;
          if (t.ground !== GROUND.WATER) continue;
          deep++;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            const g = world.tile(x + dx!, y + dy!).ground;
            expect([GROUND.LAND, GROUND.ROAD, GROUND.PASS, GROUND.BRIDGE, GROUND.POI_BLOCK], `${seed}: deep water at ${x}/${y} touches ${g}`).not.toContain(g);
          }
        }
      }
    }
    expect(shallow).toBeGreaterThan(200);
    expect(deep).toBeGreaterThan(3000);
  });

  it("builds a chunk the same way tile by tile and as a whole, shore included", () => {
    const world = new World("glade-gate-573");
    const chunk = world.chunk(3, 5);
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const t = world.tile(3 * CHUNK_SIZE + lx, 5 * CHUNK_SIZE + ly);
        expect([chunk.ground[ly * CHUNK_SIZE + lx], chunk.deco[ly * CHUNK_SIZE + lx]]).toEqual([t.ground, t.deco]);
      }
    }
  });
});

describe("nineteenth playtest: roads end at the entrance (points 6 and 11)", () => {
  it("lets every road of a place end at its door, and a place two tiles wide has two doors", () => {
    let places = 0;
    let deadEnds = 0;
    for (const seed of ["ember-shore-348", "alpha", "beta"]) {
      const world = new World(seed, "large");
      for (const ry of [0]) {
        for (const rx of world.islands.map((i) => i.index)) {
          for (const p of world.region(rx, ry).pois) {
            places++;
            const entrances = poiEntrances(p);
            expect(entrances.length, `${p.id}`).toBe(p.size % 2 === 0 ? 2 : 1);
            const bb = poiBounds(p);
            for (const e of entrances) {
              expect(isTileWalkable(world.tile(e.x, e.y)), `${p.id} entrance ${e.x}/${e.y}`).toBe(true);
              expect(world.poiAtEntrance(e.x, e.y)?.id, `${p.id} entrance ${e.x}/${e.y}`).toBe(p.id);
              // the entrance tiles lie in a row along the side that has the door
              expect(world.frontOf(p).side).toBe(p.side);
              const touches = e.x >= bb.x0 && e.x <= bb.x1 ? (p.side === "N" ? e.y === bb.y0 - 1 : e.y === bb.y1 + 1) : p.side === "W" ? e.x === bb.x0 - 1 : e.x === bb.x1 + 1;
              expect(touches, `${p.id} entrance ${e.x}/${e.y} is next to the ${p.side} side`).toBe(true);
            }
            // the road the place hangs on arrives at the middle of the door
            const front = entrances[0]!;
            // (a place alone on its island has no road to walk)
            if (world.region(rx, ry).pois.length > 1) expect(isRoad(world.tile(front.x, front.y).ground), `${p.id} has no road at its door`).toBe(true);
            // a road that stops at a wall of the place (not at its door) is a fault, a rare one when a road has to pass another place
            const { dx, dy } = { N: { dx: 0, dy: -1 }, E: { dx: 1, dy: 0 }, S: { dx: 0, dy: 1 }, W: { dx: -1, dy: 0 } }[p.side];
            for (let y = bb.y0 - 1; y <= bb.y1 + 1; y++) {
              for (let x = bb.x0 - 1; x <= bb.x1 + 1; x++) {
                const inside = x >= bb.x0 && x <= bb.x1 && y >= bb.y0 && y <= bb.y1;
                const corner = (x < bb.x0 || x > bb.x1) && (y < bb.y0 || y > bb.y1);
                if (inside || corner || entrances.some((e) => e.x === x && e.y === y) || !isRoad(world.tile(x, y).ground)) continue;
                const roadNeighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ox, oy]) => isRoad(world.tile(x + ox!, y + oy!).ground)).length;
                if (roadNeighbours <= 1) deadEnds++;
              }
            }
            void dx;
            void dy;
          }
        }
      }
    }
    expect(places).toBeGreaterThan(250);
    expect(deadEnds / places).toBeLessThan(0.005);
  });

  it("faces a place towards the place its road hangs on, whichever way that lies", () => {
    const world = new World("alpha", "large");
    const sides = new Set<string>();
    for (const p of world.allPois()) sides.add(p.side);
    expect([...sides].sort()).toEqual(["E", "N", "S", "W"]);
  });

  it("lays roads as straight pieces with right-angle bends and no staircase of single steps", () => {
    for (const seed of ["alpha", "ember-shore-348", "beta"]) {
      const world = new World(seed, "large");
      let pieces = 0;
      let short = 0;
      for (const ry of [0]) {
        for (const rx of world.islands.map((i) => i.index)) {
          for (const seg of world.region(rx, ry).roads) {
            expect(seg.x0 === seg.x1 || seg.y0 === seg.y1, "straight").toBe(true);
            pieces++;
            if (seg.to - seg.from < 2) short++;
          }
        }
      }
      // a piece of one or two tiles is a jog at a bend, not the rule
      expect(short / pieces, `${seed}: ${short} of ${pieces} pieces are shorter than three tiles`).toBeLessThan(0.25);
    }
  });

  it("keeps the roads connected from the first place of every island to all its places, with shallow shores and landmarks in the way", () => {
    for (const seed of ["ember-shore-348", "glade-gate-573"]) {
      const world = new World(seed);
      const grid = buildWalkGrid(world, 0, 0, world.width, world.height);
      let unreachable = 0;
      let total = 0;
      for (const isl of world.islands) {
        const { pois } = world.region(isl.index, 0);
        if (pois.length === 0) continue;
        const first = world.frontOf(pois[0]!);
        const seen = flood(grid, first.x, first.y);
        for (const p of pois) {
          total++;
          const front = poiEntrances(p)[0]!;
          if (!seen[front.y * world.width + front.x]) unreachable++;
        }
      }
      expect(total).toBeGreaterThan(10);
      expect(unreachable, `${seed}: ${unreachable} of ${total} entrances cannot be reached`).toBe(0);
    }
  });
});

describe("nineteenth playtest: landmarks are always reachable (point 12)", () => {
  it("builds no landmark that trees, rock or water close in", () => {
    let landmarks = 0;
    for (const seed of ["ember-shore-348", "glade-gate-573", "alpha", "beta", "iron-vale-164", "kelp-mere-931"]) {
      const world = new World(seed, "default");
      const { width, height } = world;
      const grid = buildWalkGrid(world, 0, 0, width, height);
      // what the party reaches from the first place of any island
      const seen = new Uint8Array(width * height);
      for (const isl of world.islands) {
        const { pois } = world.region(isl.index, 0);
        if (pois.length === 0) continue;
        const front = world.frontOf(pois[0]!);
        flood(grid, front.x, front.y).forEach((v, i) => {
          if (v) seen[i] = 1;
        });
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (world.tile(x, y).deco !== DECO.LANDMARK) continue;
          landmarks++;
          const reachable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen[((y + dy! + height) % height) * width + ((x + dx! + width) % width)] === 1);
          expect(reachable, `${seed}: landmark at ${x}/${y} cannot be reached`).toBe(true);
        }
      }
    }
    expect(landmarks).toBeGreaterThan(30);
  });
});

describe("nineteenth playtest: the woods are lighter near the ways (point 13)", () => {
  it("leaves at least two free tiles between the trees near a road or a place", () => {
    let near = 0;
    for (const seed of ["ember-shore-348", "alpha", "beta", "delta"]) {
      const world = new World(seed);
      const start = world.startPosition();
      const R = 60;
      const size = 2 * R + 1;
      const tiles: TileInfo[] = [];
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) tiles.push(world.tile(start.x + x, start.y + y));
      const at = (x: number, y: number) => tiles[(y + R) * size + x + R]!;
      // a tree with a road or a place within two tiles
      const closeToWay = (x: number, y: number) => {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(x + dx) <= R && Math.abs(y + dy) <= R && (isRoad(at(x + dx, y + dy).ground) || at(x + dx, y + dy).poiId !== null)) return true;
        return false;
      };
      for (let y = -R + 3; y <= R - 3; y++) {
        for (let x = -R + 3; x <= R - 3; x++) {
          if (at(x, y).deco !== DECO.TREE || !closeToWay(x, y)) continue;
          near++;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if ((dx === 0 && dy === 0) || at(x + dx, y + dy).deco !== DECO.TREE || !closeToWay(x + dx, y + dy)) continue;
              throw new Error(`${seed}: trees at ${start.x + x}/${start.y + y} and ${start.x + x + dx}/${start.y + y + dy} stand next to a way with less than two tiles between`);
            }
          }
        }
      }
    }
    expect(near).toBeGreaterThan(10);
  });

  it("gives every start enough open ground to walk about", () => {
    let worst = 1;
    for (let n = 0; n < 30; n++) {
      const world = new World(`open-${n}`);
      const start = world.startPosition();
      let ground = 0;
      let walkable = 0;
      for (let y = -12; y <= 12; y++) {
        for (let x = -12; x <= 12; x++) {
          const t = world.tile(start.x + x, start.y + y);
          if (t.ground === GROUND.WATER) continue;
          ground++;
          if (isTileWalkable(t)) walkable++;
        }
      }
      worst = Math.min(worst, walkable / ground);
    }
    // measured before the change: the start of ember-shore-348 had hardly any free ground
    expect(worst).toBeGreaterThan(0.55);
  });
});

describe("nineteenth playtest: the towns vary, have a portal, and the first tier a job master (points 7, 8, 9)", () => {
  const world = new World("playtest19");

  it("gives every town a portal near the way in that blocks no street", () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (let i = 0; i < 40; i++) {
        const poi = poiFor("town", i * 5 + tier, tier);
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        const portals = content.actions.filter((a) => a.kind === "portal");
        expect(portals.length, `tier ${tier} town #${i}`).toBe(1);
        expect(portals[0]!.params.item).toBe(3);
        expect(blocksCell(portals[0]!)).toBe(true);
        // within twenty steps of the way in (it is near, not at the far end)
        expect(Math.abs(portals[0]!.x - map.spawn.x) + Math.abs(portals[0]!.y - map.spawn.y), `tier ${tier} town #${i}`).toBeLessThanOrEqual(20);
        // the party arrives on a free street cell next to it, looking at it
        const arrival = portalStart(map, content);
        expect(map.cells[arrival.y * map.width + arrival.x]).toBe(CELL.FLOOR);
        const d = FACING_DELTA[arrival.facing];
        expect([arrival.x + d.dx, arrival.y + d.dy]).toEqual([portals[0]!.x, portals[0]!.y]);
        expect(validateContent(map, content), `tier ${tier} town #${i}`).toEqual([]);
      }
    }
  });

  it("puts the job master of the old Fountain Head in every town of the first tier, and only there", () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (let i = 0; i < 30; i++) {
        const poi = poiFor("town", 200 + i * 5 + tier, tier);
        const content = buildMapContent(world, poi, generateInterior(world, poi));
        const jobs = content.actions.filter((a) => a.kind === "work");
        expect(jobs.length, `tier ${tier} town #${i}`).toBe(tier === 1 ? 1 : 0);
        if (tier === 1) expect(jobs[0]!.params.persona).toBe(49);
      }
    }
  });

  it("pays 100 gold and lets ten days pass for a week of work, after asking", () => {
    const party = createDefaultParty();
    const ctx: ActionContext = { party, rootSeed: seedFromString("work"), monsterThemes: { beast: 1 }, tier: 1 };
    const job = { uid: "t#job", kind: "work" as const, x: 1, y: 1, params: { persona: 49 } };
    const asked = resolveAction(job, ctx);
    expect(asked.effects[0]!.type).toBe("confirm");
    expect(asked.effects[0]).toMatchObject({ question: expect.stringContaining("work a week") });
    const gold = party.gold;
    expect(resolveAction(job, { ...ctx, answer: null }).effects).toEqual([]);
    expect(party.gold).toBe(gold);
    const done = resolveAction(job, { ...ctx, answer: "yes" });
    expect(party.gold).toBe(gold + 100);
    expect(done.effects).toEqual([{ type: "work", gold: 100, days: 10 }]);
    expect(done.consumed).toBe(false); // the job master stays
    // a portal only reports that it was touched; the game offers the destinations
    expect(resolveAction({ uid: "t#portal", kind: "portal", x: 2, y: 2, params: { item: 3 } }, ctx).effects).toEqual([{ type: "portal" }]);
  });

  it("makes the towns of one tier differ in their streets, though they share the old ground plan", () => {
    const counts = new Set<number>();
    const signatures = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const poi = poiFor("town", 400 + i, 1);
      const map = generateInterior(world, poi);
      counts.add(map.cells.reduce((n, c) => n + (c === CELL.FLOOR ? 1 : 0), 0));
      signatures.add(`${map.width}x${map.height}:${map.pillars?.length ?? 0}:${(map.sites ?? []).filter((s) => s.kind === "decor").length}`);
    }
    expect(counts.size).toBeGreaterThanOrEqual(4);
    expect(signatures.size).toBeGreaterThanOrEqual(6);
    // pillars and scenery come on top of the plan's own
    let pillars = 0;
    for (let i = 0; i < 40; i++) pillars += generateInterior(world, poiFor("town", 500 + i, 1 + (i % 5))).pillars?.length ?? 0;
    // (a column needs a 3 x 3 square without a wall since the 21st playtest: the narrow streets of the old plans have few of those)
    expect(pillars).toBeGreaterThan(20);
  });
});

describe("nineteenth playtest: the map and the water (points 2, 4, 10)", () => {
  it("shows 11 x 11 cells in the small map and has the portal's symbol on the sheet", () => {
    expect(MINIMAP_CELLS).toBe(11);
    const sheet = JSON.parse(readFileSync(join(ASSETS, "ui", "minimap.json"), "utf-8")) as { icons: Record<string, { x: number; y: number }>; height: number; cell: number };
    expect(sheet.icons.teleporter_city).toBeDefined();
    expect(sheet.icons.teleporter_city!.y + sheet.cell).toBeLessThanOrEqual(sheet.height);
  });

  it("draws the water in two quiet blues: little contrast in the picture, none of the old clouds", async () => {
    const spread = async (file: string): Promise<{ sd: number; mean: number[] }> => {
      const { data } = await sharp(join(ASSETS, "terrain", "flat", file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let n = 0;
      let sum = 0;
      let sq = 0;
      const mean = [0, 0, 0];
      for (let i = 0; i < data.length; i += 3) {
        n++;
        sum += data[i]!;
        sq += data[i]! * data[i]!;
        for (let c = 0; c < 3; c++) mean[c] = mean[c]! + data[i + c]!;
      }
      return { sd: Math.sqrt(sq / n - (sum / n) ** 2), mean: mean.map((m) => m / n) };
    };
    // the painted clouds had a standard deviation of red of about 20
    const water = await spread("water_full.webp");
    expect(water.sd).toBeLessThan(5);
    // still blue, and the lighter and the darker blue are both there
    expect(water.mean[2]!).toBeGreaterThan(water.mean[0]! + 80);
    // the water of a shore tile is as quiet as the sea, the land beside it as it was
    const shore = await sharp(join(ASSETS, "terrain", "flat", "grass_water_edge-left.webp")).removeAlpha().extract({ left: 20, top: 100, width: 100, height: 300 }).raw().toBuffer();
    let sumR = 0;
    let sumSq = 0;
    for (let i = 0; i < shore.length; i += 3) {
      sumR += shore[i]!;
      sumSq += shore[i]! * shore[i]!;
    }
    const nShore = shore.length / 3;
    expect(Math.sqrt(sumSq / nShore - (sumR / nShore) ** 2)).toBeLessThan(8);
  });
});
