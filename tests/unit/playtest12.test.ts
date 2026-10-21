import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { MASCOT_ITEM, isSolidSpotItem, mascotSpotItem } from "../../src/data/mascots";
import { generateInterior } from "../../src/interiors";
import { CELL, FACING_DELTA, type Facing } from "../../src/interiors/types";
import { Rng, seedFromString } from "../../src/core/rng";
import { canAct, createCharacter, healHp } from "../../src/sim/character";
import { addCondition } from "../../src/sim/conditions";
import { battleActor, createEncounter, createMonster, partyAttack, updateBattleMode, type GridView } from "../../src/sim/encounter";
import { MONSTERS } from "../../src/data/tables";
import { createDefaultParty } from "../../src/sim/party";
import { chunkSpawns } from "../../src/world/spawns";
import { overworldMascotSpots, townMascotSpot } from "../../src/world/mascots";
import { BLOCKS } from "../../src/campaign/blocks";
import { meshInterior } from "../../src/render/interiorMesher";
import { DECO, GROUND, isTileWalkable, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";

/** Places of a world, nearest regions first. */
function placesOf(world: World, kind: Poi["kind"], _regions = 2, limit = 12): Poi[] {
  return world.allPois().filter((p) => p.kind === kind).slice(0, limit);
}

describe("generated castles have no guillotine trap (twelfth playtest, point 1)", () => {
  it("sets spear and elemental traps in castles, and never the blade", () => {
    let traps = 0;
    for (const seed of ["ember", "onyx-keep-479", "kelp-mere-931"]) {
      const world = new World(seed);
      for (const poi of placesOf(world, "castle", 3, 10)) {
        const map = generateInterior(world, poi);
        for (const a of buildMapContent(world, poi, map).actions) {
          if (a.kind !== "trap") continue;
          traps++;
          expect(a.params.trap, `${seed} ${poi.id}`).not.toBe("guillotine");
        }
      }
    }
    expect(traps).toBeGreaterThan(5);
  });
});

describe("doors stand between two walls (twelfth playtest, point 3)", () => {
  const wallLike = (map: { width: number; height: number; cells: Uint8Array }, x: number, y: number) => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
    const c = map.cells[y * map.width + x];
    return c === CELL.SOLID || c === CELL.BUILDING;
  };

  it("puts the way out of every kind of map into a wall that goes on to both sides", () => {
    for (const seed of ["onyx-keep-479", "north-reach-499", "alpha"]) {
      const world = new World(seed);
      for (const kind of ["dungeon", "castle", "cave", "town"] as const) {
        for (const poi of placesOf(world, kind, 2, 8)) {
          const map = generateInterior(world, poi);
          const { x, y } = map.exit;
          // the exit cell is a floor cell in front of its door; the door sits in the wall behind it, which goes on to both sides (a town's
          // way out can face any side: the plan is turned)
          const into = FACING_DELTA[map.spawn.facing];
          const [bx, by] = [x - into.dx, y - into.dy];
          const [ax, ay] = into.dx === 0 ? [1, 0] : [0, 1];
          expect(wallLike(map, bx - ax, by - ay) && wallLike(map, bx + ax, by + ay), `${seed} ${poi.id} ${kind} exit ${x}/${y}`).toBe(true);
        }
      }
    }
  });

  it("opens the doors of dungeons and castles only in corridors with a wall on each side", () => {
    for (const seed of ["onyx-keep-479", "alpha"]) {
      const world = new World(seed);
      for (const kind of ["dungeon", "castle"] as const) {
        for (const poi of placesOf(world, kind, 2, 8)) {
          const map = generateInterior(world, poi);
          for (const a of buildMapContent(world, poi, map).actions) {
            if (a.kind !== "door") continue;
            const open = (f: Facing) => !wallLike(map, a.x + FACING_DELTA[f].dx, a.y + FACING_DELTA[f].dy);
            const lengthwise = open("N") && open("S");
            const crosswise = open("E") && open("W");
            expect(lengthwise !== crosswise, `${poi.id} door ${a.x}/${a.y}`).toBe(true);
            const sides: Facing[] = lengthwise ? ["E", "W"] : ["N", "S"];
            for (const f of sides) expect(open(f), `${poi.id} door ${a.x}/${a.y} ${f}`).toBe(false);
          }
        }
      }
    }
  });

  it("gives a town shop its door in a wall of the street: the cell is street, the wall behind it a house wall", () => {
    for (const seed of ["alpha", "ember", "kelp-mere-931", "onyx-keep-479"]) {
      const world = new World(seed);
      for (const poi of placesOf(world, "town", 3, 10)) {
        const map = generateInterior(world, poi);
        for (const lot of map.lots) {
          const { x, y, facing } = lot.door;
          const behind = map.cells[(y - FACING_DELTA[facing].dy) * map.width + x - FACING_DELTA[facing].dx];
          expect(map.cells[y * map.width + x], `${poi.id} lot ${lot.id} door ${x}/${y}`).toBe(CELL.FLOOR);
          expect(behind, `${poi.id} lot ${lot.id} door ${x}/${y} ${facing}`).toBe(CELL.BUILDING);
        }
      }
    }
  });
});

describe("melee rounds (twelfth playtest, point 2)", () => {
  const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };
  /** Heroes who survive the boss's answers, so that a round is always four turns long. */
  const sturdy = () => {
    const party = createDefaultParty();
    for (const c of party.characters) c.hp = c.health = 100000;
    return party;
  };
  const tough = Object.values(MONSTERS).find((m) => m.health >= 400 && m.terrain === "land")!;

  it("names the fastest hero as soon as the fight starts and gives everybody one turn per round", () => {
    const party = sturdy();
    const enc = createEncounter();
    enc.monsters.push(createMonster("boss", tough.id, 6, 2));
    updateBattleMode(enc, 5, 2);
    // speeds: Maximus 16, Elrin 20, Ralvar 13, Lyneth 14 -> Elrin first
    expect(battleActor(party, enc)).toBe(1);
    const order: number[] = [];
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 4; i++) {
        order.push(battleActor(party, enc)!);
        partyAttack(party, open, enc, 5, 2, new Rng(seedFromString(`r${round}${i}`)), { kind: "melee", targetUid: "boss" });
        enc.monsters[0]!.hp = 9999; // the boss stays alive and out of the way
      }
    }
    expect(order.slice(0, 4).sort()).toEqual([0, 1, 2, 3]);
    expect(order.slice(0, 4)).toEqual([1, 0, 3, 2]);
    expect(order.slice(4)).toEqual([1, 0, 3, 2]);
  });

  it("starts the next round with the speed order of whoever can still act", () => {
    const party = sturdy();
    const enc = createEncounter();
    enc.monsters.push(createMonster("boss", tough.id, 6, 2));
    updateBattleMode(enc, 5, 2);
    party.characters[1]!.spd = 5; // the fastest becomes the slowest before the round is over
    for (let i = 0; i < 4; i++) {
      partyAttack(party, open, enc, 5, 2, new Rng(seedFromString(`s${i}`)), { kind: "melee", targetUid: "boss" });
      enc.monsters[0]!.hp = 9999;
    }
    expect(battleActor(party, enc)).toBe(0);
  });
});

describe("hit points bring a knocked out hero round (twelfth playtest, point 9)", () => {
  it("wakes a hero who is above 0 again, and not one who is still below", () => {
    const hero = createCharacter({ name: "A", classType: "Knight", raceType: "Human", avatar: "character01", attrs: { str: 12, int: 12, per: 12, end: 12, spd: 12, acc: 12, lck: 12 } });
    hero.hp = -4;
    addCondition(hero, "Unconscious", 0);
    expect(canAct(hero)).toBe(false);
    expect(healHp(hero, 3)).toBe(3);
    expect(hero.hp).toBe(-1);
    expect(hero.conditions).toContain("Unconscious");
    healHp(hero, 5);
    expect(hero.hp).toBe(4);
    expect(hero.conditions).not.toContain("Unconscious");
    expect(canAct(hero)).toBe(true);
    // never above the maximum
    healHp(hero, 100000);
    expect(hero.hp).toBe(hero.health);
  });
});

describe("the mascots (twelfth playtest, point 10)", () => {
  it("empties the place of the mascot in the party, leaves a perch and a mushroom", () => {
    for (const name of Object.keys(MASCOT_ITEM)) {
      const item = MASCOT_ITEM[name]!;
      expect(mascotSpotItem(item, name === "Crow" ? "Wolf" : "Crow")).toBe(item);
    }
    expect(mascotSpotItem(7, "Crow")).toBe(78);
    expect(mascotSpotItem(9, "Fairy")).toBe(79);
    expect(mascotSpotItem(8, "Donkey")).toBe(0);
    expect(mascotSpotItem(10, "Orb")).toBe(0);
    expect(mascotSpotItem(11, "Wolf")).toBe(0);
    // other map items are left alone
    expect(mascotSpotItem(91, "Crow")).toBe(91);
    // the perch can be walked over, the mushroom cannot
    expect(isSolidSpotItem(78)).toBe(false);
    expect(isSolidSpotItem(0)).toBe(false);
    expect(isSolidSpotItem(79)).toBe(true);
    expect(isSolidSpotItem(7)).toBe(true);
  });

  it("places the four wild mascots near the start on plain ground, apart from each other, in every world", () => {
    for (let i = 0; i < 25; i++) {
      const world = new World(`mascot-seed-${i}`);
      const spots = overworldMascotSpots(world);
      expect(spots.map((s) => s.mascot).sort(), `world ${i}`).toEqual(["Donkey", "Fairy", "Orb", "Wolf"]);
      const start = world.startPosition();
      for (const s of spots) {
        const t = world.tile(s.x, s.y);
        expect(t.ground).toBe(GROUND.LAND);
        expect(t.deco).toBe(DECO.NONE);
        // near the start; only a town on a small island sends them as far as the nearest land
        expect(Math.max(Math.abs(s.x - start.x), Math.abs(s.y - start.y)), `world ${i} ${s.mascot}`).toBeLessThanOrEqual(45);
        for (const o of spots) if (o !== s) expect(Math.max(Math.abs(o.x - s.x), Math.abs(o.y - s.y))).toBeGreaterThanOrEqual(2);
      }
      expect(overworldMascotSpots(world)).toEqual(spots);
    }
  });

  it("puts the Crow's perch in a dead end of the start town, against the wall and facing the street (changed by the seventeenth session: no longer in the middle of the town)", () => {
    for (const seed of ["alpha", "ember", "kelp-mere-931", "pearl-wood-564"]) {
      const world = new World(seed);
      const poi = world.poiById("p:0:0:0")!;
      expect(poi.kind).toBe("town");
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      const spot = townMascotSpot(map, content)!;
      expect(spot.mascot, seed).toBe("Crow");
      expect(map.cells[spot.y * map.width + spot.x]).toBe(CELL.FLOOR);
      expect(content.actions.some((a) => a.x === spot.x && a.y === spot.y), `${seed}: nothing else on the perch`).toBe(false);
      // against the wall: exactly one open neighbour, and the bird looks at it
      const open = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) => map.cells[(spot.y + dy!) * map.width + spot.x + dx!] === CELL.FLOOR);
      expect(open, seed).toHaveLength(1);
      expect([spot.faceX - spot.x, spot.faceY - spot.y], seed).toEqual(open[0]);
    }
  });
});

describe("a fuller overworld (twelfth playtest, point 10)", () => {
  it("holds wild monster groups in most chunks on average, and landmarks that block the way", () => {
    const world = new World("alpha", "large");
    let groups = 0;
    let chunks = 0;
    for (let cy = 0; cy < 20; cy++) {
      for (let cx = 0; cx < 20; cx++) {
        groups += chunkSpawns(world, cx, cy).length;
        chunks++;
      }
    }
    // a chunk is 10 x 10 tiles now and much of the world is open sea: a group in about every third chunk
    expect(groups / chunks).toBeGreaterThan(0.2);
    let landmarks = 0;
    let land = 0;
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const t = world.tile(x, y);
        if (t.ground === GROUND.LAND) land++;
        if (t.deco === DECO.LANDMARK) {
          landmarks++;
          expect(isTileWalkable(t)).toBe(false);
        }
      }
    }
    expect(landmarks / land).toBeGreaterThan(0.003);
    expect(landmarks / land).toBeLessThan(0.02);
  });
});

describe("woods and mountains (twelfth playtest, point 10 again)", () => {
  it("has mountains and woods within a hundred tiles of the start in every world", () => {
    for (const seed of ["alpha", "beta", "gamma", "delta", "ember", "test", "fullness", "speed"]) {
      const world = new World(seed, "large");
      let mountains = 0;
      let trees = 0;
      let land = 0;
      for (let y = 0; y < 200; y += 1) {
        for (let x = 0; x < 200; x += 1) {
          const t = world.tile(x, y);
          if (t.ground === GROUND.MOUNTAIN) mountains++;
          if (t.ground === GROUND.LAND) land++;
          if (t.deco === DECO.TREE) trees++;
        }
      }
      expect(mountains, `${seed} mountains`).toBeGreaterThan(150);
      // the woods thin out near roads and places (nineteenth playtest, point 13): they are the walls between the ways, so about a tenth of the land
      expect(trees / Math.max(1, land), `${seed} trees`).toBeGreaterThan(0.025);
    }
  });

  it("leaves the terrain around Starthaven to the world: no circular clearing, mountains and woods reach the town in most worlds", () => {
    // how much of the land in a disc of radius 7 around the town is open ground without trees and rocks: a made-to-measure clearing would be all of it
    let wild = 0;
    const seeds = ["alpha", "beta", "gamma", "delta", "ember", "test", "dune-keep-451", "iron-vale-164", "fullness", "speed"];
    for (const seed of seeds) {
      const world = new World(seed);
      const town = world.anchorOf(0, 0);
      let open = 0;
      let all = 0;
      for (let y = -7; y <= 7; y++) {
        for (let x = -7; x <= 7; x++) {
          if (x * x + y * y > 7 * 7) continue;
          const t = world.tile(town.x + x, town.y + y);
          if (t.ground === GROUND.WATER || t.ground === GROUND.SHALLOW) continue;
          all++;
          if (t.ground === GROUND.LAND && t.deco !== DECO.TREE) open++;
        }
      }
      if (open / all < 0.9) wild++;
    }
    expect(wild).toBeGreaterThanOrEqual(4);
  });
});

describe("the cave is made of the old game's rock models (cave levels request)", () => {
  it("draws no wall faces where the models stand, and keeps floor and ceiling", () => {
    const world = new World("alpha");
    const poi = placesOf(world, "cave", 2, 1)[0]!;
    const map = generateInterior(world, poi);
    const textured = meshInterior(map);
    const modelled = meshInterior(map, new Set(), { modelWalls: true });
    const kinds = (g: ReturnType<typeof meshInterior>) => new Set(g.groups.map((x) => x.material));
    expect(kinds(textured).has("wall")).toBe(true);
    expect(kinds(modelled).has("wall")).toBe(false);
    expect(kinds(modelled).has("door")).toBe(false);
    expect(kinds(modelled).has("floor")).toBe(true);
    expect(kinds(modelled).has("ceiling")).toBe(true);
  });

  it("gives the campaign's cave wall (block 44) and way out (block 45) their models, the glTF yaw included", () => {
    expect(BLOCKS[44]!.style.model).toMatchObject({ key: "blk_cave_wall", scale: 1.75, y: 1.5, yaw: 180 });
    expect(BLOCKS[45]!.style.model).toMatchObject({ key: "blk_cave_exit", scale: 2.6, y: 1.6, });
    expect(BLOCKS[45]!.style.model!.yaw).toBeUndefined(); // turned by half a circle against the glTF rule: the user saw the first version backwards
    // still solid for walking, looking and the minimap: only the picture changed
    expect(BLOCKS[44]!.cls).toBe("wall");
    expect(BLOCKS[45]!.cls).toBe("wall");
    expect(BLOCKS[46]!.style.model).toBeUndefined();
  });
});
