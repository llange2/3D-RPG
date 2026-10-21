import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { hasLandMonster, pickMonster, pickMonsterWeighted } from "../../src/data/monsters";
import { MONSTERS } from "../../src/data/tables";
import { buildMapContent } from "../../src/actions";
import { generateInterior } from "../../src/interiors";
import { CELL, type Facing } from "../../src/interiors/types";
import { chunkRadius, VIEW_SHARE } from "../../src/render/engine";
import { tileHeight } from "../../src/render/heights";
import { recalcValues } from "../../src/sim/character";
import { smithStock } from "../../src/sim/economy";
import { createEncounter, createMonster, partyAttack, type GridView } from "../../src/sim/encounter";
import { bonusLines, makeItem } from "../../src/sim/items";
import { createDefaultParty, setMascot } from "../../src/sim/party";
import { canSee, visibleCells } from "../../src/sim/vision";
import { chunkSpawns } from "../../src/world/spawns";
import { GROUND, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";

describe("the smith sells what his level allows (thirteenth playtest, point 3)", () => {
  const root = new World("baywatch").rootSeed;

  it("never offers ruby or better at level 2, eight items to a shelf", () => {
    const party = createDefaultParty();
    for (let day = 0; day < 40; day++) {
      const stock = smithStock(root, "campaign:baywatch", day, 2, party);
      expect(stock).toHaveLength(24);
      for (const shelf of ["armor", "weapons", "rings"] as const) expect(stock.filter((s) => s.shelf === shelf)).toHaveLength(8);
      for (const s of stock) if (s.shelf !== "rings") expect(s.item.material, `${s.item.name} on day ${day}`).toBeLessThanOrEqual(5);
    }
  });

  it("does sell ruby at level 3 and up", () => {
    const party = createDefaultParty();
    let ruby = 0;
    for (let day = 0; day < 40; day++) for (const s of smithStock(root, "campaign:baywatch", day, 3, party)) if (s.item.material === 6) ruby++;
    expect(ruby).toBeGreaterThan(0);
  });
});

describe("water monsters stay in the water (thirteenth playtest, point 4)", () => {
  const water = Object.values(MONSTERS).filter((m) => m.terrain === "water");

  it("has water monsters, all of the aquatic theme, and the theme has no land monster", () => {
    expect(water.length).toBeGreaterThan(0);
    expect(hasLandMonster("aquatic")).toBe(false);
    expect(hasLandMonster("beast")).toBe(true);
  });

  it("never draws one for dry ground, whatever the theme", () => {
    const rng = new Rng(seedFromString("dry"));
    for (let i = 0; i < 300; i++) {
      expect(pickMonster(rng, "aquatic", 1 + (i % 5)).terrain).toBe("land");
      expect(pickMonsterWeighted(rng, { beast: 3, aquatic: 3 }, 1 + (i % 5)).terrain).toBe("land");
    }
    expect(pickMonsterWeighted(rng, { aquatic: 1 }, 2).terrain).toBe("land");
  });

  it("puts none into a generated cave, castle or dungeon, nor into a land spawn of the wild", () => {
    for (const seed of ["north-wood-636", "kelp-mere-931", "ember"]) {
      const world = new World(seed, "large");
      const pois: Poi[] = world.allPois().filter((p) => p.kind !== "town");
      for (const poi of pois.slice(0, 40)) {
        const map = generateInterior(world, poi);
        for (const s of buildMapContent(world, poi, map).spawns) for (const id of s.monsterIds) expect(MONSTERS[id]!.terrain, `${seed} ${poi.id}`).toBe("land");
      }
      for (let cy = 0; cy < 20; cy++) {
        for (let cx = 0; cx < 20; cx++) {
          for (const g of chunkSpawns(world, cx, cy)) {
            const t = world.tile(g.x, g.y);
            const inWater = t.ground === GROUND.WATER || t.ground === GROUND.SHALLOW;
            for (const id of g.monsterIds) expect(MONSTERS[id]!.terrain, `${seed} ${g.uid}`).toBe(inWater ? "water" : "land");
          }
        }
      }
    }
  });
});

describe("the Wolf and the Orb (thirteenth playtest, points 7 and 9)", () => {
  const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };
  const tough = Object.values(MONSTERS).find((m) => m.health >= 400 && m.terrain === "land")!;

  it("kills a monster that falls under 90 percent of its health, only while the Wolf is the mascot", () => {
    for (const [mascot, dies] of [["Wolf", true], ["Crow", false]] as const) {
      const party = createDefaultParty();
      setMascot(party, mascot);
      const enc = createEncounter();
      enc.monsters.push(createMonster("m", tough.id, 6, 2));
      enc.monsters[0]!.hp = Math.floor(tough.health * 0.85);
      const events = partyAttack(party, open, enc, 5, 2, new Rng(seedFromString("w")), { kind: "melee", targetUid: "m" });
      expect(events.some((e) => e.type === "wolf_kill"), mascot).toBe(dies);
      expect(events.some((e) => e.type === "monster_dead"), mascot).toBe(dies);
      expect(enc.monsters.length).toBe(dies ? 0 : 1);
    }
  });

  it("leaves a monster at full health alone", () => {
    const party = createDefaultParty();
    setMascot(party, "Wolf");
    const enc = createEncounter();
    enc.monsters.push(createMonster("m", tough.id, 6, 2));
    // a miss deals nothing: the monster stays at full health and the wolf does nothing
    const events = partyAttack(party, open, enc, 5, 2, new Rng(seedFromString("miss")), { kind: "magic", targetUid: "m", magic: { damage: 0, type: "fire" } });
    expect(enc.monsters[0]!.hp).toBe(tough.health);
    expect(events.some((e) => e.type === "wolf_kill")).toBe(false);
  });

  it("gives every hero with spell points 20 percent more with the Orb, and the knight nothing", () => {
    const party = createDefaultParty();
    const before = party.characters.map((c) => c.mana);
    expect(before.some((m) => m > 0)).toBe(true);
    setMascot(party, "Orb");
    party.characters.forEach((c, i) => {
      expect(c.mana).toBe(before[i]! > 0 ? Math.round(before[i]! * 1.2) : 0);
    });
    setMascot(party, "Crow");
    party.characters.forEach((c, i) => expect(c.mana).toBe(before[i]));
    // a later recalculation (a level, an item) keeps the bonus when it is given the mascot
    const caster = party.characters.find((c) => c.mana > 0)!;
    recalcValues(caster, party.talents, false, "Orb");
    expect(caster.mana).toBe(Math.round(before[party.characters.indexOf(caster)]! * 1.2));
  });
});

describe("the item tooltip compares with an empty slot (thirteenth playtest, point 2)", () => {
  it("shows the whole bonus as the change when nothing is replaced", () => {
    const belt = makeItem({ name: "Belt", type: "belt", bonus: { arm: 3, end: 5 } });
    const nothing = makeItem({ name: "", type: "combined" });
    const lines = bonusLines(belt, nothing);
    expect(lines.map((l) => [l.label, l.value, l.change]).filter((l) => l[2] !== null).length).toBe(lines.length);
    for (const l of lines) expect(l.change).toBe(l.value);
    expect(bonusLines(belt, null).every((l) => l.change === null)).toBe(true);
  });
});

describe("the map does not show what a wall hides (thirteenth playtest, point 5)", () => {
  /** Two walls that only touch at a corner: the way through the pinch is closed. */
  const rows = ["#####", "#...#", "#..##", "##.##", "#####"];
  const wallAt = (x: number, y: number) => rows[y]?.[x] !== ".";

  it("does not look through the corner between two diagonal walls", () => {
    // floor at (3,1) and (2,2): standing at (1,1) the cell (3,1) is open and in view, but (4,2)'s neighbours are walls
    const grid = ["#######", "#.....#", "#.###.#", "#.#.#.#", "#.###.#", "#.....#", "#######"];
    const opaque = (x: number, y: number) => grid[y]?.[x] !== ".";
    // the closed chamber in the middle (3,3) cannot be seen from the ring around it
    expect(canSee(opaque, 1, 1, 3, 3)).toBe(false);
    expect(canSee(opaque, 3, 1, 3, 3)).toBe(false);
    const diagonal = ["#####", "#.#.#", "##.##", "#.#.#", "#####"];
    const opaque2 = (x: number, y: number) => diagonal[y]?.[x] !== ".";
    expect(canSee(opaque2, 1, 1, 3, 3)).toBe(false);
    expect(canSee(opaque2, 1, 1, 2, 2)).toBe(false);
  });

  it("leaves out a cell at the party's feet that lies behind two walls", () => {
    const opaque = (x: number, y: number) => wallAt(x, y) && !(x === 2 && y === 2);
    // standing at (1,1): the cell (2,2) is open, (2,1) and (1,2) are open too, so it is seen
    expect(visibleCells(opaque, 1, 1, "S", 3).some(([x, y]) => x === 2 && y === 2)).toBe(true);
    const walled = (x: number, y: number) => !(x === 1 && y === 1) && !(x === 2 && y === 2);
    const seen = visibleCells(walled, 1, 1, "S" as Facing, 3).map(([x, y]) => `${x},${y}`);
    expect(seen).not.toContain("2,2");
    expect(seen).toContain("1,1");
  });

  it("keeps the open cave of the report free of cells behind rock", () => {
    const world = new World("north-wood-636", "large");
    const caves = world.allPois().filter((p) => p.kind === "cave").slice(0, 3);
    expect(caves.length).toBeGreaterThan(0);
    for (const poi of caves) {
      const map = generateInterior(world, poi);
      const opaque = (x: number, y: number) => x < 0 || y < 0 || x >= map.width || y >= map.height || map.cells[y * map.width + x] !== CELL.FLOOR;
      // from every floor cell of a stretch of the cave, in every direction
      const cells: [number, number][] = [];
      for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (map.cells[y * map.width + x] === CELL.FLOOR && (x + y * 3) % 17 === 0) cells.push([x, y]);
      for (const [px, py] of cells.slice(0, 12)) {
        for (const facing of ["N", "E", "S", "W"] as const) {
          for (const [x, y] of visibleCells(opaque, px, py, facing, 5)) {
            // everything seen is either wall or reached by a line that leaves the party's cell through open ground
            if (Math.max(Math.abs(x - px), Math.abs(y - py)) <= 1) continue;
            expect(canSee(opaque, px, py, x, y)).toBe(true);
          }
        }
      }
    }
  });
});

describe("view distance and flat ground (thirteenth playtest, points 10 and 12)", () => {
  it("draws 2, 4 and 6 chunks (of 10 tiles) around the party at close, medium and far (the quality setting was folded into the distance)", () => {
    expect(chunkRadius("close")).toBe(2);
    expect(chunkRadius("medium")).toBe(4);
    expect(chunkRadius("far")).toBe(6);
    expect(VIEW_SHARE.far).toBe(1);
    expect(VIEW_SHARE.close).toBeLessThan(VIEW_SHARE.medium);
  });

  it("has no height difference between water, land and shallows", () => {
    for (const ground of [GROUND.LAND, GROUND.WATER, GROUND.SHALLOW, GROUND.LAVA_POOL, GROUND.MOUNTAIN]) expect(tileHeight({ ground, elevation: 40000 })).toBe(0);
  });
});
